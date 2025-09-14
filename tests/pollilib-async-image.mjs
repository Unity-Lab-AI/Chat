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
    return {
      ok: true,
      headers: { get: () => 'image/png' },
      async blob() { return new Blob(['x'], { type: 'image/png' }); },
    };
  }
};

global.fetch = async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/png' }) });

const blob = await image('test', {}, client);
assert(blob instanceof Blob);
