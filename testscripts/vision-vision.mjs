import assert from 'node:assert/strict';
import { vision } from '../js/polliLib/src/vision.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.postJson = async () => new MockResponse({ json:{ answer:'yes' } });
const res = await vision({ imageUrl:'http://x' }, client);
assert.deepEqual(res, { answer:'yes' });
