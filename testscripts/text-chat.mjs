import assert from 'node:assert/strict';
import { chat } from '../js/polliLib/src/text.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const client = new MockClient();
client.postJson = async () => new MockResponse({ json:{ choices:[{message:{content:'ok'}}] } });
const res = await chat({ model:'m', messages:[] }, client);
assert.deepEqual(res, { choices:[{message:{content:'ok'}}] });
