import assert from 'node:assert/strict';
import { ImageStep } from '../js/polliLib/src/pipeline.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const step = new ImageStep({ prompt:'hi', outKey:'img' });
const client = new MockClient();
client.get = async () => new MockResponse({ blob: 'imgblob' });
const context = new Map();
await step.run({ client, context });
assert.equal(context.get('img').blob, 'imgblob');
