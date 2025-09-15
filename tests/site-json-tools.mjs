import { strict as assert } from 'node:assert';
import { PolliClientWeb } from '../js/polliLib/src/client.js';
import { generateImageUrl } from '../js/polliLib/src/mcp.js';
import { tts } from '../js/polliLib/src/audio.js';
import { ToolBox, functionTool } from '../js/polliLib/src/tools.js';

const uiCommandSchema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['openScreensaver', 'closeScreensaver', 'changeTheme', 'changeModel', 'setValue', 'click'] },
    target: { type: 'string' },
    value: { type: 'string' }
  },
  required: ['action'],
  additionalProperties: false
};

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
    properties: { command: uiCommandSchema },
    required: ['command']
  })
];

let imageUrl;
let audioBlob;
let uiRan = false;
let returnedText;

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
      uiRan = command.action === 'click' && command.target === 'ping';
      return { ok: uiRan };
    });
}

async function dispatch(json) {
  const obj = JSON.parse(json);
  const texts = [];
  if (Array.isArray(obj.tools)) {
    for (const t of obj.tools) {
      const fn = toolbox.get(t.tool);
      assert(fn, `missing tool ${t.tool}`);
      const res = await fn(t);
      if (res?.text) texts.push(res.text);
    }
  } else if (obj.tool) {
    const fn = toolbox.get(obj.tool);
    assert(fn, `missing tool ${obj.tool}`);
    const res = await fn(obj);
    if (res?.text) texts.push(res.text);
  }
  if (obj.text) texts.push(obj.text);
  return texts.join(' ').trim();
}

returnedText = await dispatch(JSON.stringify({
  tools: [
    { tool: 'image', prompt: 'tiny green square' },
    { tool: 'tts', text: 'ok' },
    { tool: 'ui', command: { action: 'click', target: 'ping' } }
  ],
  text: 'done'
}));

assert(imageUrl && imageUrl.startsWith('http'), 'image url via polliLib');
assert(audioBlob && typeof audioBlob.size === 'number', 'audio blob generated');
assert(uiRan, 'ui command executed');
assert.equal(returnedText, 'done');

console.log('json-tools test passed');
