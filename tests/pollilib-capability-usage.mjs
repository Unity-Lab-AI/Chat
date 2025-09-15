import assert from 'assert/strict';
import { modelCapabilities } from '../js/polliLib/src/models.js';

const client = {
  imageBase: 'https://img.example',
  textBase: 'https://txt.example',
  async get(url) {
    if (url === 'https://img.example/models') {
      return { ok: true, async json() { return { foo: {} }; }, headers: { get: () => 'application/json' } };
    }
    if (url === 'https://txt.example/models') {
      return { ok: true, async json() { return { bar: {}, baz: {} }; }, headers: { get: () => 'application/json' } };
    }
    if (url === 'https://txt.example/audio') {
      return { ok: true, async json() { return { bar: { voices: ['a'] } }; }, headers: { get: () => 'application/json' } };
    }
    if (url === 'https://txt.example/tools') {
      return { ok: true, async json() { return { bar: { toolA: true } }; }, headers: { get: () => 'application/json' } };
    }
  }
};

const caps = await modelCapabilities(client);

function buildOptions(model) {
  const opts = { model, messages: [] };
  if (caps.text?.[model]?.tools) {
    opts.tools = ['toolA'];
    opts.json = true;
  }
  return opts;
}

const withTools = buildOptions('bar');
assert('tools' in withTools && withTools.json === true);
const withoutTools = buildOptions('baz');
assert(!('tools' in withoutTools));
assert(!('json' in withoutTools));

console.log('capability-usage test passed');
