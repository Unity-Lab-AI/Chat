import assert from 'node:assert/strict';
import { getDefaultClient, setDefaultClient } from '../js/polliLib/src/client.js';

const custom = { custom: true };
setDefaultClient(custom);
assert.equal(getDefaultClient(), custom);
