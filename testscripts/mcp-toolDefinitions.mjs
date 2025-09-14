import assert from 'node:assert/strict';
import { toolDefinitions } from '../js/polliLib/src/mcp.js';

const defs = toolDefinitions();
assert.ok(Array.isArray(defs.tools));
