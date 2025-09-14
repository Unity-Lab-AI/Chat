import assert from 'node:assert/strict';
import { tts } from '../js/polliLib/src/audio.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.get = async () => new MockResponse({ blob: 'audio' });
const result = await tts('hello', {}, client);
assert.equal(result, 'audio');
