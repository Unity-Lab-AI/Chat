/*
  Non-blocking smoke tests for polliLib and minimal site structure.
  - Uses only Node 20 built-ins (no deps)
  - Uses copy under /js/polliLib; does not modify original /polliLib
  - Intended to run in CI and summarize results
*/

// Polyfill fetch via curl before importing polliLib modules.
import './fetch-polyfill.mjs';

import { PolliClientWeb } from '../js/polliLib/src/client.js';
import { text as textGet, chat, textModels, search } from '../js/polliLib/src/text.js';
import { image, imageModels } from '../js/polliLib/src/image.js';
import { tts } from '../js/polliLib/src/audio.js';
import { vision } from '../js/polliLib/src/vision.js';
import * as pipeline from '../js/polliLib/src/pipeline.js';
import * as tools from '../js/polliLib/src/tools.js';
import * as mcp from '../js/polliLib/src/mcp.js';
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

await step('text(prompt) mentions apple', async () => {
  const out = await textGet('apple', { model: 'openai-mini' }, client);
  if (typeof out !== 'string' || !out.toLowerCase().includes('apple')) {
    throw new Error('text output missing apple');
  }
  return `ok`;
});

await step('chat basic response mentions apple', async () => {
  const messages = [
    { role: 'system', content: 'You are concise.' },
    { role: 'user', content: 'apple' }
  ];
  const data = await chat({ messages, /* model omitted to use server default */ }, client);
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string' || !content.toLowerCase().includes('apple')) {
    throw new Error('chat response missing apple');
  }
  return 'ok';
});

await step('search convenience mentions apple', async () => {
  const out = await search('apple', 'searchgpt', client);
  if (typeof out !== 'string' || !out.toLowerCase().includes('apple')) {
    throw new Error('search output missing apple');
  }
  return 'ok';
});

await step('imageModels returns JSON', async () => {
  const models = await imageModels(client);
  const type = typeof models;
  if (!(type === 'object' && models)) throw new Error('image models is not object');
  const keys = Array.isArray(models) ? models.slice(0, 3) : Object.keys(models).slice(0, 3);
  return `keys: ${JSON.stringify(keys)}`;
});

await step('mcp generateImageUrl builds URL', async () => {
  const url = mcp.generateImageUrl(client, { prompt: 'apple', width: 32, height: 32, private: true, nologo: true });
  if (typeof url !== 'string' || !url.startsWith('http')) throw new Error('bad url');
  return url.slice(0, 80) + '…';
});

await step('image fetch small blob', async () => {
  const blob = await image('apple', { width: 32, height: 32, private: true, nologo: true, safe: true }, client);
  if (!blob || typeof blob.size !== 'number' || blob.size <= 0) throw new Error('empty image blob');
  return `blob size=${blob.size}`;
});

async function blobToBase64(b) {
  const ab = await b.arrayBuffer();
  const bytes = new Uint8Array(ab);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return Buffer.from(bin, 'binary').toString('base64');
}

await step('mcp generateImageBase64 returns base64', async () => {
  const b64 = await mcp.generateImageBase64(client, { prompt: 'apple', width: 16, height: 16, private: true, nologo: true, safe: true });
  if (typeof b64 !== 'string' || b64.length < 20) throw new Error('short base64');
  return `len=${b64.length}`;
});

await step('vision identifies apple image', async () => {
  const blob = await image('apple', { width: 16, height: 16, private: true, nologo: true, safe: true }, client);
  const b64 = await blobToBase64(blob);
  const dataUrl = `data:image/png;base64,${b64}`;
  const resp = await vision({ imageUrl: dataUrl, question: 'What fruit is this?' }, client);
  const msg = resp?.choices?.[0]?.message?.content;
  if (!msg || !msg.toLowerCase().includes('apple')) {
    throw new Error('vision response missing apple');
  }
  return 'ok';
});

await step('audio.tts returns audio blob', async () => {
  const blob = await tts('apple', { voice: 'alloy', model: 'openai-audio' }, client);
  if (!blob || typeof blob.size !== 'number' || blob.size <= 0) throw new Error('empty tts blob');
  return `blob size=${blob.size}`;
});

await step('mcp list helpers return arrays/objects', async () => {
  const ims = await mcp.listImageModels(client);
  const tms = await mcp.listTextModels(client);
  const voices = await mcp.listAudioVoices(client);
  if (typeof ims !== 'object' || !ims) throw new Error('listImageModels not object');
  if (typeof tms !== 'object' || !tms) throw new Error('listTextModels not object');
  if (!Array.isArray(voices)) throw new Error('listAudioVoices not array');
  return `voices: ${voices.length}`;
});

await step('tools.functionTool and ToolBox shape', async () => {
  const def = tools.functionTool('echo', 'Echo back input', { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] });
  if (def?.type !== 'function' || !def.function?.name) throw new Error('bad function tool shape');
  const tb = new tools.ToolBox().register('echo', async ({ text }) => `echo:${text}`);
  const got = await tb.get('echo')({ text: 'hi' });
  if (got !== 'echo:hi') throw new Error('toolbox failed');
  return 'ok';
});

await step('pipeline end-to-end', async () => {
  const p = new pipeline.Pipeline()
    .step(new pipeline.TextGetStep({ prompt: 'apple', outKey: 't', params: { model: 'openai-mini' } }))
    .step(new pipeline.ImageStep({ prompt: 'apple', outKey: 'img', params: { width: 16, height: 16, private: true, nologo: true, safe: true } }))
    .step(new pipeline.TtsStep({ text: 'apple', outKey: 'snd', params: { model: 'openai-audio' } }));
  const ctx = await p.execute({ client });
  if (!ctx.get('t') || !ctx.get('img')?.blob || !ctx.get('snd')?.blob) throw new Error('pipeline missing outputs');
  return 'ok';
});

await step('index.html contains critical tags', async () => {
  const p = path.join(process.cwd(), 'index.html');
  const html = await fs.readFile(p, 'utf8');
  const checks = [ 'js/polliLib/polliLib-web.global.js', 'js/chat/chat-core.js', 'js/chat/chat-init.js', 'id="chat-box"' ];
  const missing = checks.filter(s => !html.includes(s));
  if (missing.length) throw new Error('missing: ' + missing.join(', '));
  return 'tags ok';
});

// Output summary
const { ok, fail, text } = summary();
console.log('\n' + text + '\n');
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ['# PolliLib Smoke Tests', '', '```', text, '```'].join('\n');
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}
// Exit non-zero if any failures to make failures visible in CI (deployment workflow is independent)
process.exit(fail ? 1 : 0);
