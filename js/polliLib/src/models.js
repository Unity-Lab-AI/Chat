import { getDefaultClient } from './client.js';
import { imageModels } from './image.js';
import { textModels } from './text.js';

export async function modelCapabilities(client = getDefaultClient()) {
  const [image, text] = await Promise.all([
    imageModels(client).catch(() => ({})),
    textModels(client).catch(() => ({})),
  ]);
  return { image, text, audio: text?.['openai-audio'] ?? {} };
}

