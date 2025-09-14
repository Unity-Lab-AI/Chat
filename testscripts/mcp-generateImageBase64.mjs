import assert from 'node:assert/strict';
import { generateImageBase64 } from '../js/polliLib/src/mcp.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.get = async () => new MockResponse({ blob: new Blob(['hi']) });
const b64 = await generateImageBase64(client, { prompt: 'hi' });
assert.ok(typeof b64 === 'string');
