import assert from 'assert/strict';
import { image } from '../js/polliLib/src/image.js';

const client = {
  imageBase: 'https://example.com',
  async get(url, { params, headers } = {}) {
    assert.equal(headers.Accept, 'application/json');
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      async json() { return { prompt: params.model }; },
    };
  }
};

const data = await image('test', { model: 'foo', json: true }, client);
assert.equal(data.prompt, 'foo');
