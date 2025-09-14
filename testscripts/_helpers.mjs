import { ReadableStream } from 'node:stream/web';

export class MockResponse {
  constructor({ ok = true, status = 200, blob = '', text = '', json = null, streamMessages = null } = {}) {
    this.ok = ok;
    this.status = status;
    this._blob = blob;
    this._text = text;
    this._json = json;
    if (streamMessages) {
      const encoder = new TextEncoder();
      this.body = new ReadableStream({
        start(controller) {
          for (const msg of streamMessages) {
            controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
          }
          controller.close();
        }
      });
    }
  }
  async blob() { return this._blob; }
  async text() { return this._text; }
  async json() { return this._json; }
}

export class MockClient {
  constructor() {
    this.imageBase = 'https://image.test';
    this.textBase = 'https://text.test';
  }
  async get(url, opts) { return new MockResponse({}); }
  async postJson(url, body) { return new MockResponse({}); }
}
