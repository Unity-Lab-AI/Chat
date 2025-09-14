import assert from 'node:assert/strict';
import { imageFeed } from '../js/polliLib/src/feeds.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.get = async () => new MockResponse({ streamMessages: ['{"a":1}', '{"b":2}'] });
const gen = imageFeed({}, client);
const arr = [];
for await (const item of gen) arr.push(item);
assert.deepEqual(arr, [{a:1}, {b:2}]);
