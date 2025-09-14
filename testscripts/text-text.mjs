import assert from 'node:assert/strict';
import { text } from '../js/polliLib/src/text.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.get = async () => new MockResponse({ text: 'hello' });
const res = await text('hi', {}, client);
assert.equal(res, 'hello');
