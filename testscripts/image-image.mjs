import assert from 'node:assert/strict';
import { image } from '../js/polliLib/src/image.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.get = async () => new MockResponse({ blob: 'img' });
const res = await image('cat', {}, client);
assert.equal(res, 'img');
