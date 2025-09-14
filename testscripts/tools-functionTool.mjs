import assert from 'node:assert/strict';
import { functionTool } from '../js/polliLib/src/tools.js';

const t = functionTool('n','d',{type:'object'});
assert.equal(t.type, 'function');
