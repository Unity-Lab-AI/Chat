import { strict as assert } from 'node:assert';
import { marked } from '../js/marked.js';
import { sanitizeMarkdown } from '../js/chat/markdown-sanitizer.js';

const input = [
  'Hello',
  '',
  '```image',
  'https://example.com/cat.png',
  '```',
  '',
  '```javascript',
  "console.log('hi');",
  '```',
  '',
  '---',
  ''
].join('\n');

const sanitized = sanitizeMarkdown(input);
assert(!sanitized.includes('cat.png'), 'Blocked fence content should be removed');

const html = marked.parse(sanitized);
assert(html.includes('<code'), 'Code block should remain after sanitization');
assert(html.includes('<hr'), 'Horizontal rule should be rendered');

console.log('markdown-sanitization test passed');
