import assert from 'node:assert/strict';
import { Pipeline } from '../js/polliLib/src/pipeline.js';

const p = new Pipeline();
p.step({ run: async () => {} });
const ctx = await p.execute();
assert.ok(ctx instanceof Map);
