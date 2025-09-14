import assert from 'node:assert/strict';
import { Context } from '../js/polliLib/src/pipeline.js';

const ctx = new Context();
ctx.set('a',1);
assert.equal(ctx.get('a'),1);
