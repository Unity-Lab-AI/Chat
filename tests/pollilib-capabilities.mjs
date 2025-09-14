import assert from 'assert/strict';
import { modelCapabilities } from '../js/polliLib/src/models.js';

const client = {
  imageBase: 'https://img.example',
  textBase: 'https://txt.example',
  async get(url) {
    if (url.startsWith('https://img.example')) {
      return { ok: true, async json() { return { foo: {} }; }, headers: { get: () => 'application/json' } };
    }
    return { ok: true, async json() { return { bar: {}, 'openai-audio': { voices: ['a'] } }; }, headers: { get: () => 'application/json' } };
  }
};

const caps = await modelCapabilities(client);
assert('foo' in caps.image);
assert('bar' in caps.text);
assert.deepEqual(caps.audio.voices, ['a']);
