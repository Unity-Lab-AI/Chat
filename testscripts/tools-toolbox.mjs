import assert from 'node:assert/strict';
import { ToolBox } from '../js/polliLib/src/tools.js';

const box = new ToolBox();
box.register('a', ()=>'b');
assert.equal(box.get('a')(), 'b');
