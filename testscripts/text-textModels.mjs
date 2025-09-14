import assert from 'node:assert/strict';
import { textModels } from '../js/polliLib/src/text.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.get = async () => new MockResponse({ json: ['a'] });
const models = await textModels(client);
assert.deepEqual(models, ['a']);
