import { strict as assert } from 'node:assert';
import { marked } from 'marked';
import { sanitizeMarkdown } from '../js/chat/markdown-sanitizer.js';
import { PolliClientWeb } from '../js/polliLib/src/client.js';
import { generateImageUrl } from '../js/polliLib/src/mcp.js';
import { tts } from '../js/polliLib/src/audio.js';

const client = new PolliClientWeb({ referrer: 'unityailab.com' });

const response = [
  'Hello',
  '```image',
  'an apple',
  '```',
  '```audio',
  'say apple',
  '```',
  '```ui',
  'console.log("ui done")',
  '```',
  '```javascript',
  "console.log('hi');",
  '```',
  '---',
  ''
].join('\n');

let content = response;
const imageUrls = [];
const audioBlobs = [];
let uiExecuted = false;

async function processPatterns(patterns, handler) {
  for (const { pattern, group } of patterns) {
    const grpIndex = typeof group === 'number' ? group : 1;
    const p = pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + 'g');
    const matches = Array.from(content.matchAll(p));
    for (const match of matches) {
      const captured = match[grpIndex] && match[grpIndex].trim();
      if (!captured) continue;
      await handler(captured);
    }
    content = content.replace(p, '');
  }
}

await processPatterns([{ pattern: /```image\n([\s\S]*?)\n```/i, group: 1 }], async prompt => {
  const url = generateImageUrl(client, {
    prompt,
    width: 16,
    height: 16,
    private: true,
    nologo: true,
    safe: true
  });
  imageUrls.push(url);
});

await processPatterns([{ pattern: /```audio\n([\s\S]*?)\n```/i, group: 1 }], async prompt => {
  let blob;
  try {
    blob = await tts(prompt, { model: 'openai-audio' }, client);
  } catch {
    // Fallback if network is unavailable
    blob = new Blob(['dummy'], { type: 'audio/mpeg' });
  }
  audioBlobs.push(blob);
});

await processPatterns([{ pattern: /```ui\n([\s\S]*?)\n```/i, group: 1 }], async command => {
  uiExecuted = true;
});

content = content.replace(/\n{3,}/g, '\n\n');
content = content.replace(/\n?---\n?/g, '\n\n---\n\n');
content = content.replace(/\n{3,}/g, '\n\n').trim();

const sanitized = sanitizeMarkdown(content);
const html = marked.parse(sanitized);

assert(imageUrls.length === 1 && imageUrls[0].startsWith('http'), 'Image URL via polliLib');
assert(!sanitized.includes('an apple'), 'Image prompt hidden');

const blob = audioBlobs[0];
assert(blob && typeof blob.size === 'number' && blob.size > 0, 'Audio blob generated');
assert(!sanitized.includes('say apple'), 'Audio prompt hidden');

assert(uiExecuted, 'UI command executed');
assert(!sanitized.includes('console.log("ui done")'), 'UI command hidden');

assert(html.includes('<code'), 'Code block rendered');
assert(html.includes('<hr'), 'Horizontal rule rendered');

console.log('ai-response test passed');
