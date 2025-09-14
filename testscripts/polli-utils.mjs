import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><p></p>', { url: 'https://example.com' });
global.window = dom.window;
global.document = dom.window.document;
global.polliClient = { imageBase: 'https://image.pollinations.ai', referrer: 'ref' };
global.polliLib = { mcp: { generateImageUrl: (client, { prompt }) => `${client.imageBase}/prompt/${encodeURIComponent(prompt)}` } };

await import('../js/chat/polli-utils.js');
const { url, error } = window.refreshPolliImage('https://image.pollinations.ai/prompt/test', {});
assert.ok(url);
