import assert from 'node:assert/strict';
import { getDefaultClient, PolliClientWeb, setDefaultClient } from '../js/polliLib/src/client.js';

setDefaultClient(null);
const client = getDefaultClient();
assert.ok(client instanceof PolliClientWeb);
