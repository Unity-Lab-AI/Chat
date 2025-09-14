import assert from 'node:assert/strict';
import { listAudioVoices } from '../js/polliLib/src/mcp.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.get = async () => new MockResponse({ json: { 'openai-audio': { voices: ['v1'] } } });
const voices = await listAudioVoices(client);
assert.deepEqual(voices, ['v1']);
