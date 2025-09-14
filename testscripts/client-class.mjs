import assert from 'node:assert/strict';
import { PolliClientWeb } from '../js/polliLib/src/client.js';

const client = new PolliClientWeb();
assert.equal(client.imageBase, 'https://image.pollinations.ai');
