import { strict as assert } from 'node:assert';
import { repairJson } from '../js/chat/json-repair.js';

const fixed = repairJson("{tool:'image', prompt:'apple',}");
assert.equal(fixed.tool, 'image');
assert.equal(fixed.prompt, 'apple');

const plain = repairJson('just some text');
assert.deepEqual(plain, { text: 'just some text' });

console.log('json-repair test passed');
