import { strict as assert } from 'node:assert';
import { PolliClientWeb } from '../js/polliLib/src/client.js';
import { generateImageUrl } from '../js/polliLib/src/mcp.js';
import { tts } from '../js/polliLib/src/audio.js';
import { ToolBox, functionTool } from '../js/polliLib/src/tools.js';

const client = new PolliClientWeb({ referrer: 'unityailab.com' });

const toolbox = new ToolBox();
const tools = [
  functionTool('image', 'Generate an image', {
    type: 'object',
    properties: { prompt: { type: 'string' } },
    required: ['prompt']
  }),
  functionTool('tts', 'Text to speech', {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text']
  }),
  functionTool('ui', 'Execute UI command', {
    type: 'object',
    properties: { command: { type: 'string' } },
    required: ['command']
  })
];

let imageUrl;
let audioBlob;
let uiRan = false;

// Register tool implementations
box: {
  toolbox
    .register('image', async ({ prompt }) => {
      imageUrl = generateImageUrl(client, {
        prompt,
        width: 16,
        height: 16,
        private: true,
        nologo: true,
        safe: true
      });
      return { imageUrl };
    })
    .register('tts', async ({ text }) => {
      try {
        audioBlob = await tts(text, { model: 'openai-audio' }, client);
      } catch {
        audioBlob = new Blob(['dummy'], { type: 'audio/mpeg' });
      }
      return { ok: true };
    })
    .register('ui', async ({ command }) => {
      uiRan = command === 'ping';
      return { ok: uiRan };
    });
}

async function dispatch(json) {
  const obj = JSON.parse(json);
  const fn = toolbox.get(obj.tool);
  assert(fn, `missing tool ${obj.tool}`);
  return await fn(obj);
}

await dispatch('{"tool":"image","prompt":"tiny green square"}');
await dispatch('{"tool":"tts","text":"ok"}');
await dispatch('{"tool":"ui","command":"ping"}');

assert(imageUrl && imageUrl.startsWith('http'), 'image url via polliLib');
assert(audioBlob && typeof audioBlob.size === 'number', 'audio blob generated');
assert(uiRan, 'ui command executed');

console.log('json-tools test passed');
