import assert from 'node:assert/strict';
import { chatWithTools } from '../js/polliLib/src/tools.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.postJson = async () => new MockResponse({ json:{ choices:[{message:{content:'ok'}}] } });
const toolbox = { get() {} };
const resp = await chatWithTools({ client, model:'m', messages:[], tools:[], toolbox });
assert.deepEqual(resp, { choices:[{message:{content:'ok'}}] });
