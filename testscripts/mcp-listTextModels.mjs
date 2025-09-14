import assert from 'node:assert/strict';
import { listTextModels } from '../js/polliLib/src/mcp.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.get = async () => new MockResponse({ json: {a:1} });
const models = await listTextModels(client);
assert.deepEqual(models, {a:1});
