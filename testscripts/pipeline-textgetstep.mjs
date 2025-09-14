import assert from 'node:assert/strict';
import { TextGetStep } from '../js/polliLib/src/pipeline.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const step = new TextGetStep({ prompt:'hi', outKey:'resp' });
const client = new MockClient();
client.get = async () => new MockResponse({ text: 'ok' });
const context = new Map();
await step.run({ client, context });
assert.equal(context.get('resp'), 'ok');
