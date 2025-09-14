import assert from 'node:assert/strict';
import { VisionUrlStep } from '../js/polliLib/src/pipeline.js';
import { MockClient, MockResponse } from './_helpers.mjs';

const step = new VisionUrlStep({ imageUrl:'http://x', outKey:'vis' });
const client = new MockClient();
client.postJson = async () => new MockResponse({ json:{ answer:'ok' } });
const context = new Map();
await step.run({ client, context });
assert.deepEqual(context.get('vis'), { answer:'ok' });
