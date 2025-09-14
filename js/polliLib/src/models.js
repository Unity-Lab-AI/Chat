import { getDefaultClient } from './client.js';
import { imageModels } from './image.js';
import { textModels } from './text.js';

// Return true if a model description indicates JSON support
export function imageModelSupportsJson(info) {
  if (!info || typeof info !== 'object') return false;
  if (info.json === true) return true;
  const fields = [info.output, info.outputs, info.formats, info.format];
  for (const f of fields) {
    if (Array.isArray(f) && f.some(v => String(v).toLowerCase() === 'json')) return true;
  }
  return false;
}

async function toolModels(client) {
  const r = await client.get(`${client.textBase}/tools`);
  if (!r.ok) throw new Error(`toolModels error ${r.status}`);
  return await r.json();
}

async function audioModels(client) {
  const r = await client.get(`${client.textBase}/audio`);
  if (!r.ok) throw new Error(`audioModels error ${r.status}`);
  return await r.json();
}

export async function modelCapabilities(client = getDefaultClient()) {
  const [img, text, audio, tools] = await Promise.all([
    imageModels(client).catch(() => ({})),
    textModels(client).catch(() => ({})),
    audioModels(client).catch(() => ({})),
    toolModels(client).catch(() => ({})),
  ]);
  const image = {};
  for (const [name, info] of Object.entries(img ?? {})) {
    image[name] = { ...(info || {}), json: imageModelSupportsJson(info) };
  }
  const textCaps = { ...(text ?? {}) };
  for (const [name, info] of Object.entries(audio ?? {})) {
    textCaps[name] = { ...(textCaps[name] || {}), audio: info };
  }
  for (const [name, info] of Object.entries(tools ?? {})) {
    textCaps[name] = { ...(textCaps[name] || {}), tools: info };
  }
  return { image, text: textCaps, audio, tools };
}

