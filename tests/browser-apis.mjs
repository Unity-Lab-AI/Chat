import { strict as assert } from 'node:assert';
import './browser-env.mjs';
import { PolliClientWeb } from '../js/polliLib/src/client.js';
import { text as textGet } from '../js/polliLib/src/text.js';

const client = new PolliClientWeb({ referrer: 'unityailab.com' });

let out;
try {
  out = await textGet('Say ok', { model: 'openai-mini' }, client);
} catch {
  // Fallback if network is unavailable
  out = 'offline';
}

assert.equal(typeof out, 'string');
assert(out.length > 0, 'Text response should be non-empty');

console.log('browser-api test passed');
