import assert from 'node:assert/strict';
import { search } from '../js/polliLib/src/text.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.get = async () => new MockResponse({ text: 'res' });
const res = await search('q', 'model', client);
assert.equal(res, 'res');
