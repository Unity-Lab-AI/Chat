import { getDefaultClient } from './client.js';

function modelSupportsJson(info) {
  if (!info || typeof info !== 'object') return false;
  if (info.json === true) return true;
  const fields = [info.output, info.outputs, info.formats, info.format];
  for (const f of fields) {
    if (Array.isArray(f) && f.some(v => String(v).toLowerCase() === 'json')) return true;
  }
  return false;
}

const bool = v => (v == null ? undefined : (v ? 'true' : 'false'));
const sleep = ms => new Promise(res => setTimeout(res, ms));

export async function image(prompt, {
  model, seed, width, height, image, nologo, private: priv, enhance, safe, referrer,
  json, retries = 5, retryDelayMs = 1000,
} = {}, client = getDefaultClient()) {
  const url = `${client.imageBase}/prompt/${encodeURIComponent(prompt)}`;
  const params = {};
  if (model) params.model = model;
  if (seed != null) params.seed = seed;
  if (width != null) params.width = width;
  if (height != null) params.height = height;
  if (image) params.image = image;
  if (nologo != null) params.nologo = bool(nologo);
  if (priv != null) params.private = bool(priv);
  if (enhance != null) params.enhance = bool(enhance);
  if (safe != null) params.safe = bool(safe);
  if (referrer) params.referrer = referrer;

  let expectJson = false;
  const headers = {};
  if (json && model) {
    try {
      const models = await imageModels(client);
      if (modelSupportsJson(models?.[model])) {
        params.json = 'true';
        headers.Accept = 'application/json';
        expectJson = true;
      }
    } catch {
      // ignore capability errors and fall back to blob response
    }
  }

  const r = await client.get(url, { params, headers });
  if (!r.ok) throw new Error(`image error ${r.status}`);

  const ct = r.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const data = await r.json();
    if (expectJson) return data;
    if (data?.url) {
      const ir = await client.get(data.url);
      if (ir.ok) return await ir.blob();
      if (retries > 0) {
        await sleep(retryDelayMs);
        return await image(prompt, {
          model, seed, width, height, image, nologo, private: priv,
          enhance, safe, referrer, json, retries: retries - 1, retryDelayMs,
        }, client);
      }
      throw new Error(`image error ${ir.status}`);
    }
    if (retries > 0) {
      await sleep(retryDelayMs);
      return await image(prompt, {
        model, seed, width, height, image, nologo, private: priv,
        enhance, safe, referrer, json, retries: retries - 1, retryDelayMs,
      }, client);
    }
    throw new Error('image pending');
  }

  return await r.blob();
}

export async function imageModels(client = getDefaultClient()) {
  const r = await client.get(`${client.imageBase}/models`);
  if (!r.ok) throw new Error(`imageModels error ${r.status}`);
  return await r.json();
}

