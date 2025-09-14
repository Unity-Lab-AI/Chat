import assert from 'node:assert/strict';
import { serverName } from '../js/polliLib/src/mcp.js';

assert.equal(serverName(), 'pollinations-multimodal-api');
