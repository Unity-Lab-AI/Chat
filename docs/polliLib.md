# PolliLib Usage Guide

PolliLib provides a lightweight client for interacting with the Pollinations API from the browser or Node.js environments.  This guide covers basic usage patterns for image, text and audio generation along with other helper utilities.

## Table of Contents

- [Installation](#installation)
- [Image Generation](#image-generation)
- [Text Generation](#text-generation)
- [Audio Generation](#audio-generation)
- [Model Capabilities](#model-capabilities)
- [Feeds](#feeds)
- [Tools](#tools)
- [MCP](#mcp)
- [Pipeline](#pipeline)
- [Vision](#vision)
- [SSE](#sse)

## Installation

PolliLib is bundled in this repository under `js/polliLib`.  Include `polliLib-web.global.js` in the browser or import the individual modules from `js/polliLib/src` when using Node.js.

```html
<script src="js/polliLib/polliLib-web.global.js"></script>
<script>
  polliLib.configure({ referrer: window.location.origin });
</script>
```

## Image Generation

```javascript
import { image } from './js/polliLib/src/image.js';

const blob = await image('a tiny red square', {
  width: 64,
  height: 64,
  json: false,       // set to true to receive raw JSON metadata
  retries: 5         // poll until the image is ready
});
```

The call returns a `Blob` containing the generated PNG.  Passing `json: true` forces Pollinations to return raw JSON when supported.  When the service responds with a placeholder JSON payload, the function automatically polls until an actual image is available.

## Text Generation

```javascript
import { text, chat } from './js/polliLib/src/text.js';

const out = await text('Explain gravity in one sentence.', { model: 'openai' });

const chatOut = await chat({
  model: 'openai',
  messages: [
    { role: 'user', content: 'Say hello.' }
  ],
  json: true // request strict JSON formatting
});
```

`text` returns a string (or an async iterator when `stream: true`).  `chat` mirrors the OpenAI chat API and can also stream JSON objects when requested.

## Audio Generation

```javascript
import { tts, stt } from './js/polliLib/src/audio.js';

const speech = await tts('hello world', { voice: 'alloy' });
const transcript = await stt({ data: myArrayBuffer, format: 'mp3' });
```

`tts` produces a spoken audio `Blob` using the `openai-audio` model.  `stt` performs speech‑to‑text on a provided file or raw audio buffer.

## Model Capabilities

```javascript
import { modelCapabilities } from './js/polliLib/src/models.js';

const caps = await modelCapabilities();
console.log(caps.image); // available image models
console.log(caps.text);  // available text models
console.log(caps.audio); // audio voices (if available)
```

This helper combines information from the image and text model endpoints so applications can dynamically enable features based on available capabilities.

## Feeds

```javascript
import { imageFeed } from './js/polliLib/src/feeds.js';

for await (const item of imageFeed({ limit: 5 })) {
  console.log(item.prompt, item.url);
}
```

`imageFeed` and `textFeed` stream public generations via Server‑Sent Events. Pass a `limit` to stop after a certain number of items.

## Tools

```javascript
import { functionTool, ToolBox, chatWithTools } from './js/polliLib/src/tools.js';

const toolbox = new ToolBox().register('add', ({ a, b }) => a + b);

const tools = [
  functionTool('add', 'Add two numbers', {
    type: 'object',
    properties: { a: { type: 'number' }, b: { type: 'number' } },
    required: ['a', 'b']
  })
];

const resp = await chatWithTools({
  model: 'openai',
  messages: [{ role: 'user', content: '2+3?' }],
  tools,
  toolbox,
  maxRounds: 2
});
console.log(resp.choices[0].message.content);
```

`ToolBox` maps tool names to handlers. `chatWithTools` orchestrates calls and supports `maxRounds` and `tool_choice` for fine‑tuning behaviour.

## MCP

```javascript
import { toolDefinitions, generateImageUrl, generateImageBase64 } from './js/polliLib/src/mcp.js';

const defs = toolDefinitions(); // expose to your MCP server

const url = generateImageUrl(polliLib.client(), {
  prompt: 'a smiling robot',
  width: 512,
  height: 512
});

const b64 = await generateImageBase64(polliLib.client(), {
  prompt: 'thumbnail',
  width: 128,
  height: 128
});
```

`toolDefinitions` returns the Pollinations tool schema for an MCP server. Use helpers like `generateImageUrl`, `generateImageBase64`, `listImageModels`, `listTextModels`, and `listAudioVoices` inside your MCP implementation.

## Pipeline

```javascript
import { Pipeline, TextGetStep, ImageStep } from './js/polliLib/src/pipeline.js';

const pipe = new Pipeline()
  .step(new TextGetStep({ prompt: 'A poem about the sea', outKey: 'poem' }))
  .step(new ImageStep({ prompt: 'waves in the moonlight', outKey: 'image', params: { width: 256 } }));

const ctx = await pipe.execute();
console.log(ctx.get('poem'));
const { blob } = ctx.get('image');
```

`Pipeline` executes registered steps sequentially, storing results in a shared `Context`. Each step accepts `params` passed to the underlying polliLib function.

## Vision

```javascript
import { vision } from './js/polliLib/src/vision.js';

const result = await vision({
  imageUrl: 'https://example.com/cat.png',
  question: 'What animal is shown?',
  model: 'openai',
  max_tokens: 50
});
console.log(result.choices[0].message.content);
```

`vision` analyzes an image by URL or raw bytes. Provide `model`, `question`, `imageFormat`, or `max_tokens` as needed.

## SSE

```javascript
import { sseEvents } from './js/polliLib/src/sse.js';

const resp = await fetch('https://example.com/stream', {
  headers: { 'Accept': 'text/event-stream' }
});

for await (const data of sseEvents(resp)) {
  console.log('event:', data);
}
```

`sseEvents` turns a `fetch` response into an async iterator of event `data` chunks. PolliLib uses it internally for feeds and other streaming endpoints.

See the source files in `js/polliLib/src` for full details on each module.

