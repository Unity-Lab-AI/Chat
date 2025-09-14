import assert from 'assert/strict';
import { image } from '../js/polliLib/src/image.js';

const client = {
  imageBase: 'https://example.com',
  async get(url, { params, headers } = {}) {
    if (url.endsWith('/models')) {
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        async json() { return { foo: { json: true } }; }
      };
    }
    assert.equal(params.json, 'true');
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
