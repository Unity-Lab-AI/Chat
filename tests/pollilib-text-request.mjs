import assert from 'assert/strict';
import { text, chat } from '../js/polliLib/src/text.js';
import { PolliClientWeb } from '../js/polliLib/src/client.js';

const calls = [];
global.fetch = async (url, opts) => {
  calls.push({ url: url.toString(), opts });
  return {
    ok: true,
    text: async () => 'ok',
    json: async () => ({ ok: true })
  };
};

const client = new PolliClientWeb({ referrer: 'default.com', textBase: 'https://txt', imageBase: 'https://img' });

// text() request
await text('hi there', {
  model: 'foo',
  temperature: 0.5,
  seed: 1,
  json: true,
  private: true,
  referrer: 'ref.com'
}, client);

let { url, opts } = calls[0];
assert.equal(opts.method, 'GET');
const u = new URL(url);
assert.equal(u.origin + u.pathname, 'https://txt/hi%20there');
assert.equal(u.searchParams.get('model'), 'foo');
assert.equal(u.searchParams.get('temperature'), '0.5');
assert.equal(u.searchParams.get('seed'), '1');
assert.equal(u.searchParams.get('json'), 'true');
assert.equal(u.searchParams.get('private'), 'true');
assert.equal(u.searchParams.get('referrer'), 'ref.com');

// chat() request
await chat({
  model: 'gpt',
  messages: [{ role: 'user', content: 'hello' }],
  temperature: 0.7,
  json: true
}, client);

({ url, opts } = calls[1]);
assert.equal(url, 'https://txt/openai');
assert.equal(opts.method, 'POST');
assert.equal(opts.headers['Content-Type'], 'application/json');
const body = JSON.parse(opts.body);
assert.equal(body.model, 'gpt');
assert.equal(body.temperature, 0.7);
assert.equal(body.messages[0].content, 'hello');
assert.equal(body.json, true);
// default referrer added by client
assert.equal(body.referrer, 'default.com');
