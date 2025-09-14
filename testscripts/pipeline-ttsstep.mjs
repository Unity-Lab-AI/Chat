import assert from 'node:assert/strict';
import { TtsStep } from '../js/polliLib/src/pipeline.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const step = new TtsStep({ text:'hi', outKey:'aud' });
const client = new MockClient();
client.get = async () => new MockResponse({ blob: 'audblob' });
const context = new Map();
await step.run({ client, context });
assert.equal(context.get('aud').blob, 'audblob');
