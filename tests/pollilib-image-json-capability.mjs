import assert from 'assert/strict';
import { image } from '../js/polliLib/src/image.js';
import { modelCapabilities } from '../js/polliLib/src/models.js';

const client = {
  imageBase: 'https://example.com',
  async get(url, { params, headers } = {}) {
    if (url.endsWith('/models')) {
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        async json() { return { foo: { json: true }, bar: {} }; }
      };
    }
    if (params.model === 'foo') {
      assert.equal(params.json, 'true');
      assert.equal(headers.Accept, 'application/json');
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        async json() { return { model: params.model }; }
      };
    }
    assert.equal(params.json, undefined);
    assert.equal(headers?.Accept, undefined);
    return {
      ok: true,
      headers: { get: () => 'image/png' },
      async blob() { return { blob: true }; }
    };
  }
};

const caps = await modelCapabilities(client);
assert.equal(caps.image.foo.json, true);
assert.equal(caps.image.bar.json, false);

const data = await image('test', { model: 'foo', json: true }, client);
assert.equal(data.model, 'foo');

const blob = await image('test', { model: 'bar', json: true }, client);
assert.deepEqual(blob, { blob: true });
