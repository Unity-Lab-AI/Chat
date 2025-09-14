import assert from 'node:assert/strict';
import { sseEvents } from '../js/polliLib/src/sse.js';
import { MockResponse } from './_helpers.mjs';

const resp = new MockResponse({ streamMessages:['{"a":1}','{"b":2}'] });
const out = [];
for await (const m of sseEvents(resp)) out.push(m);
assert.deepEqual(out, ['{"a":1}','{"b":2}']);
