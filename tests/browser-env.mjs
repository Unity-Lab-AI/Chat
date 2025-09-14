import { JSDOM } from 'jsdom';

// Initialize a minimal browser-like environment using JSDOM
export function setupBrowserEnv(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, { url: 'https://example.org/' });
  const { window } = dom;

  global.window = window;
  global.document = window.document;
  global.navigator = window.navigator;
  global.localStorage = window.localStorage;
  global.sessionStorage = window.sessionStorage;
  global.DOMParser = window.DOMParser;

  // Copy other useful properties
  Object.getOwnPropertyNames(window).forEach(prop => {
    if (typeof global[prop] === 'undefined') {
      global[prop] = window[prop];
    }
  });

  // Ensure window.fetch uses Node's fetch
  window.fetch = global.fetch.bind(global);
  return dom;
}

// If run directly, set up the environment immediately
if (import.meta.url === `file://${process.argv[1]}`) {
  setupBrowserEnv();
  console.log('Browser environment initialized');
}
