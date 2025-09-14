import assert from 'assert/strict';
import fs from 'fs/promises';
import { image } from '../js/polliLib/src/image.js';

let calls = 0;
const pending = JSON.parse(await fs.readFile(new URL('./fixtures/pending-image.json', import.meta.url), 'utf8'));
const client = {
  imageBase: 'https://example.com',
  async get(url, opts = {}) {
    calls++;
    if (calls === 1) {
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        async json() { return pending; },
      };
    }
    return { ok: false, status: 500, headers: { get: () => 'text/plain' } };
  }
};

global.fetch = () => { throw new Error('fetch should not be called'); };

let caught = null;
try {
  await image('test', { retries: 0 }, client);
} catch (err) {
  caught = err;
}
assert(caught);
assert.equal(caught.message, 'image error 500');
assert.equal(calls, 2);
