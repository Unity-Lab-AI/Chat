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

export async function modelCapabilities(client = getDefaultClient()) {
  const [img, text] = await Promise.all([
    imageModels(client).catch(() => ({})),
    textModels(client).catch(() => ({})),
  ]);
  const image = {};
  for (const [name, info] of Object.entries(img ?? {})) {
    image[name] = { ...(info || {}), json: imageModelSupportsJson(info) };
  }
  return { image, text, audio: text?.['openai-audio'] ?? {} };
}

