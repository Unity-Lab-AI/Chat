import assert from 'node:assert/strict';
import { textFeed } from '../js/polliLib/src/feeds.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.get = async () => new MockResponse({ streamMessages: ['{"x":1}'] });
const gen = textFeed({ limit:1 }, client);
const arr = [];
for await (const item of gen) arr.push(item);
assert.deepEqual(arr, [{x:1}]);
