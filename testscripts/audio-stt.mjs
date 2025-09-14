import assert from 'node:assert/strict';
import { stt } from '../js/polliLib/src/audio.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.postJson = async () => new MockResponse({ json: { text: 'ok' } });
const data = new Uint8Array([1,2,3]);
const res = await stt({ data, format: 'wav', question: '?' }, client);
assert.deepEqual(res, { text: 'ok' });
