/*
  Non-blocking smoke tests for polliLib and minimal site structure.
  - Uses only Node 20 built-ins (no deps)
  - Does not modify /polliLib; only imports from src
  - Intended to run in CI and summarize results
*/

import { PolliClientWeb } from '../polliLib/src/client.js';
import { chat, textModels } from '../polliLib/src/text.js';
import { image, imageModels } from '../polliLib/src/image.js';
import * as mcp from '../polliLib/src/mcp.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const REFERRER = process.env.POLLI_REFERRER || 'unityailab.com';
const client = new PolliClientWeb({ referrer: REFERRER, timeoutMs: 45_000 });

const results = [];
const push = (name, ok, info = '') => results.push({ name, ok, info });

async function step(name, fn) {
  const started = Date.now();
  try {
    const info = await fn();
    push(name, true, info ?? `ok in ${Date.now()-started}ms`);
  } catch (err) {
    push(name, false, `${err?.message || err}`);
  }
}

function summary() {
  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  const lines = [
    `PolliLib Smoke Tests — ${ok}/${results.length} passed`,
    '',
    ...results.map(r => `- ${r.ok ? 'PASS' : 'FAIL'}: ${r.name}${r.info ? ' — ' + r.info : ''}`)
  ];
  return { ok, fail, text: lines.join('\n') };
}

// Tests
await step('textModels returns JSON', async () => {
  const models = await textModels(client);
  const type = typeof models;
  if (!(type === 'object' && models)) throw new Error('models is not object');
  // Record a few keys for debugging
  const keys = Array.isArray(models) ? models.slice(0, 3) : Object.keys(models).slice(0, 3);
  return `keys: ${JSON.stringify(keys)}`;
});

await step('chat basic response', async () => {
  const messages = [
    { role: 'system', content: 'You are concise.' },
    { role: 'user', content: 'Reply with the word: ok' }
  ];
  const data = await chat({ messages, /* model omitted to use server default */ }, client);
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') throw new Error('missing choices[0].message.content');
  return `len=${content.length}`;
});

await step('imageModels returns JSON', async () => {
  const models = await imageModels(client);
  const type = typeof models;
  if (!(type === 'object' && models)) throw new Error('image models is not object');
  const keys = Array.isArray(models) ? models.slice(0, 3) : Object.keys(models).slice(0, 3);
  return `keys: ${JSON.stringify(keys)}`;
});

await step('mcp generateImageUrl builds URL', async () => {
  const url = mcp.generateImageUrl(client, { prompt: 'simple red square icon', width: 32, height: 32, private: true, nologo: true });
  if (typeof url !== 'string' || !url.startsWith('http')) throw new Error('bad url');
  return url.slice(0, 80) + '…';
});

await step('image fetch small blob', async () => {
  const blob = await image('tiny test pixel art red square', { width: 32, height: 32, private: true, nologo: true, safe: true }, client);
  if (!blob || typeof blob.size !== 'number' || blob.size <= 0) throw new Error('empty image blob');
  return `blob size=${blob.size}`;
});

await step('index.html contains critical tags', async () => {
  const p = path.join(process.cwd(), 'index.html');
  const html = await fs.readFile(p, 'utf8');
  const checks = [ 'polliLib/polliLib-web.global.js', 'chat-core.js', 'chat-init.js', 'id="chat-box"' ];
  const missing = checks.filter(s => !html.includes(s));
  if (missing.length) throw new Error('missing: ' + missing.join(', '));
  return 'tags ok';
});

// Output summary
const { ok, fail, text } = summary();
console.log('\n' + text + '\n');
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ['# PolliLib Smoke Tests', '', '```
' + text + '
```'].join('\n');
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}
// Exit non-zero if any failures to make failures visible in CI (deployment workflow is independent)
process.exit(fail ? 1 : 0);

