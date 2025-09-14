import assert from 'node:assert/strict';
import { generateImageUrl } from '../js/polliLib/src/mcp.js';

const client = { imageBase: 'https://image.test', referrer: 'r' };
const url = generateImageUrl(client, { prompt: 'cat', width: 1 });
assert.ok(url.includes('prompt/cat'));
assert.ok(url.includes('width=1'));
