# PolliLib Usage Guide

PolliLib provides a lightweight client for interacting with the Pollinations API from the browser or Node.js environments.  This guide covers basic usage patterns for image, text and audio generation along with other helper utilities.

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

## Other Utilities

- **Feeds** – `imageFeed` and `textFeed` stream recent public generations.
- **Tools & MCP** – helpers for creating tool calls and constructing MCP servers.
- **Pipeline** – compose multi‑step workflows that mix text, image and audio steps.

See the source files in `js/polliLib/src` for full details on each module.

