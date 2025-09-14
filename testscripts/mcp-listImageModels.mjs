import assert from 'node:assert/strict';
import { listImageModels } from '../js/polliLib/src/mcp.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.get = async () => new MockResponse({ json: ['x'] });
const models = await listImageModels(client);
assert.deepEqual(models, ['x']);
