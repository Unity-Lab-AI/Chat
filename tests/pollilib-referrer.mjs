import assert from 'assert/strict';
import { PolliClientWeb } from '../js/polliLib/src/client.js';

let lastUrl = '';
global.fetch = async (url, opts) => { lastUrl = url.toString(); return { ok: true, blob: async () => new Blob() }; };

const client = new PolliClientWeb({ referrer: 'test.com', imageBase: 'https://img', textBase: 'https://txt' });
await client.get('https://img/prompt/cat');
assert(lastUrl.includes('referrer=test.com'));
