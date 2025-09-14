import assert from 'node:assert/strict';
import { imageModels } from '../js/polliLib/src/image.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.get = async () => new MockResponse({ json: ['a','b'] });
const models = await imageModels(client);
assert.deepEqual(models, ['a','b']);
