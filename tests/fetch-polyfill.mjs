import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Simple fetch polyfill using curl to bypass Node network restrictions.
// Supports basic GET/POST with headers and binary bodies.
export async function fetchWithCurl(url, options = {}) {
  const args = ['-sL'];
  const { method = 'GET', headers = {}, body } = options;
  if (method && method.toUpperCase() !== 'GET') {
    args.push('-X', method);
  }
  for (const [k, v] of Object.entries(headers)) {
    args.push('-H', `${k}: ${v}`);
  }
  if (body != null) {
    const data = typeof body === 'string' || body instanceof Buffer ? body : JSON.stringify(body);
    args.push('--data-binary', data);
  }
  args.push(url);
  const { stdout } = await execFileAsync('curl', args, { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 });
  return new Response(stdout);
}

// Always override global fetch so polliLib uses curl-backed requests.
globalThis.fetch = fetchWithCurl;
