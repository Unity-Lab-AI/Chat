import assert from 'assert/strict';
import { tts, stt } from '../js/polliLib/src/audio.js';
import { PolliClientWeb } from '../js/polliLib/src/client.js';

global.btoa = s => Buffer.from(s, 'binary').toString('base64');
const calls = [];
global.fetch = async (url, opts) => {
  calls.push({ url: url.toString(), opts });
  return {
    ok: true,
    blob: async () => new Blob(),
    json: async () => ({ ok: true })
  };
};

const client = new PolliClientWeb({ referrer: 'base.com', textBase: 'https://txt', imageBase: 'https://img' });

// tts() request
await tts('hello', { voice: 'alice', referrer: 'ref.com' }, client);
let { url, opts } = calls[0];
assert.equal(opts.method, 'GET');
let u = new URL(url);
assert.equal(u.searchParams.get('model'), 'openai-audio');
assert.equal(u.searchParams.get('voice'), 'alice');
assert.equal(u.searchParams.get('referrer'), 'ref.com');

// stt() request
const data = new Uint8Array([1,2,3]).buffer;
await stt({ data, format: 'mp3' }, client);
({ url, opts } = calls[1]);
assert.equal(url, 'https://txt/openai');
assert.equal(opts.method, 'POST');
assert.equal(opts.headers['Content-Type'], 'application/json');
const body = JSON.parse(opts.body);
assert.equal(body.model, 'openai-audio');
assert.equal(body.messages[0].content[1].input_audio.format, 'mp3');
assert.equal(body.referrer, 'base.com');
