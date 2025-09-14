(function (g) {
  'use strict';

  // --- client.js (web) ---
  class PolliClientWeb {
    constructor({ referrer = inferReferrer(), imageBase = 'https://image.pollinations.ai', textBase = 'https://text.pollinations.ai', timeoutMs = 60_000 } = {}) {
      this.referrer = referrer;
      this.imageBase = stripTrail(imageBase);
      this.textBase = stripTrail(textBase);
      this.timeoutMs = timeoutMs;
    }
    _addReferrer(u, params) {
      const hasRefParam = params && Object.prototype.hasOwnProperty.call(params, 'referrer');
      if (!hasRefParam && this.referrer) u.searchParams.set('referrer', this.referrer);
      else if (hasRefParam && params.referrer) u.searchParams.set('referrer', params.referrer);
    }
    async get(url, { params = {}, headers = {}, stream = false } = {}) {
      const u = new URL(url);
      for (const [k, v] of Object.entries(params)) if (v != null && k !== 'referrer') u.searchParams.set(k, String(v));
      this._addReferrer(u, params);
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), this.timeoutMs);
      try { return await fetch(u.toString(), { method: 'GET', headers, signal: controller.signal }); }
      finally { clearTimeout(id); }
    }
    async postJson(url, body, { headers = {}, stream = false } = {}) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), this.timeoutMs);
      const hdrs = { 'Content-Type': 'application/json' };
      Object.assign(hdrs, headers);
      const payload = { ...(body || {}) };
      if (this.referrer && payload.referrer == null) payload.referrer = this.referrer;
      try { return await fetch(url, { method: 'POST', headers: hdrs, body: JSON.stringify(payload), signal: controller.signal }); }
      finally { clearTimeout(id); }
    }
  }
  function inferReferrer() { try { if (typeof window !== 'undefined' && window.location && window.location.origin) return window.location.origin; } catch {} return null; }
  function stripTrail(s) { return s && s.endsWith('/') ? s.slice(0, -1) : s; }
  let defaultClient = null;
  function getDefaultClient() { return defaultClient ?? (defaultClient = new PolliClientWeb()); }
  function setDefaultClient(c) { defaultClient = c; }

  // --- sse.js ---
  async function* sseEvents(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventLines = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (line === '') {
          if (eventLines.length) {
            const data = eventLines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
            eventLines = [];
            if (data) yield data;
          }
        } else eventLines.push(line);
      }
    }
    if (eventLines.length) {
      const data = eventLines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
      if (data) yield data;
    }
  }

  // --- helpers ---
  const bool = v => (v == null ? undefined : (v ? 'true' : 'false'));
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  function base64FromArrayBuffer(ab) {
    const bytes = new Uint8Array(ab);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const sub = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode.apply(null, sub);
    }
    return btoa(binary);
  }

  // --- image.js ---
  async function image(prompt, { model, seed, width, height, image: imgUrl, nologo, private: priv, enhance, safe, referrer, json, retries = 5, retryDelayMs = 1000 } = {}, client = getDefaultClient()) {
    const url = `${client.imageBase}/prompt/${encodeURIComponent(prompt)}`;
    const params = {};
    if (model) params.model = model;
    if (seed != null) params.seed = seed;
    if (width != null) params.width = width;
    if (height != null) params.height = height;
    if (imgUrl) params.image = imgUrl;
    if (nologo != null) params.nologo = bool(nologo);
    if (priv != null) params.private = bool(priv);
    if (enhance != null) params.enhance = bool(enhance);
    if (safe != null) params.safe = bool(safe);
    if (referrer) params.referrer = referrer;
    if (json) params.json = 'true';
    const headers = json ? { Accept: 'application/json' } : {};
    const r = await client.get(url, { params, headers });
    if (!r.ok) throw new Error(`image error ${r.status}`);
    const ct = r.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const data = await r.json();
      if (json) return data;
      if (data?.url) {
        const ir = await fetch(data.url);
        if (ir.ok) return await ir.blob();
      }
      if (retries > 0) {
        await sleep(retryDelayMs);
        return await image(prompt, { model, seed, width, height, image: imgUrl, nologo, private: priv, enhance, safe, referrer, json, retries: retries - 1, retryDelayMs }, client);
      }
      throw new Error('image pending');
    }
    return await r.blob();
  }
  async function imageModels(client = getDefaultClient()) {
    const r = await client.get(`${client.imageBase}/models`);
    if (!r.ok) throw new Error(`imageModels error ${r.status}`);
    return await r.json();
  }

  // --- text.js ---
  async function text(prompt, { model, seed, temperature, top_p, presence_penalty, frequency_penalty, json, system, stream, private: priv, referrer } = {}, client = getDefaultClient()) {
    const url = `${client.textBase}/${encodeURIComponent(prompt)}`;
    const params = {};
    if (model) params.model = model;
    if (seed != null) params.seed = seed;
    if (temperature != null) params.temperature = temperature;
    if (top_p != null) params.top_p = top_p;
    if (presence_penalty != null) params.presence_penalty = presence_penalty;
    if (frequency_penalty != null) params.frequency_penalty = frequency_penalty;
    if (json) params.json = 'true';
    if (system) params.system = system;
    if (priv != null) params.private = !!priv;
    if (referrer) params.referrer = referrer;
    if (stream) {
      params.stream = 'true';
      const r = await client.get(url, { params, headers: { 'Accept': 'text/event-stream' } });
      if (!r.ok) throw new Error(`text(stream) error ${r.status}`);
      return (async function* () { for await (const data of sseEvents(r)) { if (String(data).trim() === '[DONE]') break; yield data; } })();
    } else {
      const r = await client.get(url, { params });
      if (!r.ok) throw new Error(`text error ${r.status}`);
      return await r.text();
    }
  }
  async function chat({ model, messages, seed, temperature, top_p, presence_penalty, frequency_penalty, max_tokens, stream, private: priv, tools, tool_choice, referrer, json }, client = getDefaultClient()) {
    const url = `${client.textBase}/openai`;
    const body = { model, messages };
    if (seed != null) body.seed = seed;
    if (temperature != null) body.temperature = temperature;
    if (top_p != null) body.top_p = top_p;
    if (presence_penalty != null) body.presence_penalty = presence_penalty;
    if (frequency_penalty != null) body.frequency_penalty = frequency_penalty;
    if (max_tokens != null) body.max_tokens = max_tokens;
    if (priv != null) body.private = !!priv;
    if (tools) body.tools = tools;
    if (tool_choice) body.tool_choice = tool_choice;
    if (referrer) body.referrer = referrer;
    if (json) body.json = true;
    if (stream) {
      body.stream = true;
      const r = await client.postJson(url, body, { headers: { 'Accept': 'text/event-stream' } });
      if (!r.ok) throw new Error(`chat(stream) error ${r.status}`);
      return (async function* () { for await (const data of sseEvents(r)) { if (String(data).trim() === '[DONE]') break; yield JSON.parse(data); } })();
    } else {
      const r = await client.postJson(url, body);
      if (!r.ok) throw new Error(`chat error ${r.status}`);
      return await r.json();
    }
  }
  async function textModels(client = getDefaultClient()) {
    const r = await client.get(`${client.textBase}/models`);
    if (!r.ok) throw new Error(`textModels error ${r.status}`);
    return await r.json();
  }
  async function search(query, model = 'searchgpt', client = getDefaultClient()) { return await text(query, { model }, client); }

  // --- audio.js ---
  async function tts(t, { voice, model = 'openai-audio', referrer } = {}, client = getDefaultClient()) {
    const url = `${client.textBase}/${encodeURIComponent(t)}`;
    const params = { model };
    if (voice) params.voice = voice;
    if (referrer) params.referrer = referrer;
    const r = await client.get(url, { params });
    if (!r.ok) throw new Error(`tts error ${r.status}`);
    return await r.blob();
  }
  async function stt({ file, data, format, question }, client = getDefaultClient()) {
    if (!file && !data) throw new Error("Provide either 'file' or 'data'");
    if (!format && file) {
      if (file.type && file.type.startsWith('audio/')) format = file.type.split('/')[1];
      else if (file.name && file.name.includes('.')) format = file.name.split('.').pop().toLowerCase();
    }
    if (!format) throw new Error("Audio 'format' is required (e.g., 'mp3' or 'wav')");
    const bytes = file ? await file.arrayBuffer() : (data instanceof ArrayBuffer ? data : (data?.buffer ?? data));
    const b64 = base64FromArrayBuffer(bytes);
    const body = { model: 'openai-audio', messages: [{ role: 'user', content: [{ type: 'text', text: question ?? 'Transcribe this audio' }, { type: 'input_audio', input_audio: { data: b64, format } }] }] };
    const r = await client.postJson(`${client.textBase}/openai`, body);
    if (!r.ok) throw new Error(`stt error ${r.status}`);
    return await r.json();
  }

  // --- vision.js ---
  async function vision({ imageUrl, file, data, imageFormat, question, model = 'openai', max_tokens } = {}, client = getDefaultClient()) {
    if (!imageUrl && !file && !data) throw new Error('Provide imageUrl or file/data');
    if (!imageUrl) {
      const ab = file ? await file.arrayBuffer() : (data instanceof ArrayBuffer ? data : (data?.buffer ?? data));
      if (!imageFormat) { if (file?.type?.startsWith('image/')) imageFormat = file.type.split('/')[1]; else throw new Error('imageFormat is required when providing raw bytes'); }
      const b64 = base64FromArrayBuffer(ab);
      imageUrl = `data:image/${imageFormat};base64,${b64}`;
    }
    const payload = { model, messages: [{ role: 'user', content: [{ type: 'text', text: question ?? 'Describe this image:' }, { type: 'image_url', image_url: { url: imageUrl } }] }] };
    if (max_tokens != null) payload.max_tokens = max_tokens;
    const r = await client.postJson(`${client.textBase}/openai`, payload);
    if (!r.ok) throw new Error(`vision error ${r.status}`);
    return await r.json();
  }

  // --- feeds.js ---
  async function* imageFeed({ limit } = {}, client = getDefaultClient()) {
    const r = await client.get(`${client.imageBase}/feed`, { headers: { 'Accept': 'text/event-stream' } });
    if (!r.ok) throw new Error(`imageFeed error ${r.status}`);
    let count = 0;
    for await (const data of sseEvents(r)) { try { const obj = JSON.parse(data); yield obj; if (limit != null && ++count >= limit) break; } catch {} }
  }
  async function* textFeed({ limit } = {}, client = getDefaultClient()) {
    const r = await client.get(`${client.textBase}/feed`, { headers: { 'Accept': 'text/event-stream' } });
    if (!r.ok) throw new Error(`textFeed error ${r.status}`);
    let count = 0;
    for await (const data of sseEvents(r)) { try { const obj = JSON.parse(data); yield obj; if (limit != null && ++count >= limit) break; } catch {} }
  }

  // --- tools.js ---
  function functionTool(name, description, parameters) { return { type: 'function', function: { name, description, parameters } }; }
  class ToolBox { constructor() { this.map = new Map(); } register(n, fn) { this.map.set(n, fn); return this; } get(n) { return this.map.get(n); } }
  async function chatWithTools({ client, model, messages, tools, toolbox, maxRounds = 3, tool_choice }) {
    const history = [...messages];
    for (let round = 0; round <= maxRounds; round++) {
      const resp = await chat({ model, messages: history, tools, tool_choice }, client);
      const choice = (resp.choices?.[0]?.message) ?? {}; const toolCalls = choice.tool_calls ?? [];
      if (!toolCalls.length) return resp;
      history.push({ role: 'assistant', tool_calls: toolCalls });
      for (const tc of toolCalls) {
        const fname = tc.function?.name; let args = {}; try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch {}
        const fn = toolbox.get(fname); if (!fn) return resp; const out = await fn(args);
        history.push({ role: 'tool', tool_call_id: tc.id, name: fname, content: typeof out === 'string' ? out : JSON.stringify(out) });
      }
    }
    return await chat({ model, messages: history }, client);
  }

  // --- mcp.js (web) ---
  function serverName() { return 'pollinations-multimodal-api'; }
  function toolDefinitions() {
    return { name: serverName(), tools: [
      { name: 'generateImageUrl', description: 'Generate an image and return its URL', parameters: { type: 'object', properties: { prompt: { type: 'string' }, model: { type: 'string' }, seed: { type: 'integer' }, width: { type: 'integer' }, height: { type: 'integer' }, nologo: { type: 'boolean' }, private: { type: 'boolean' } }, required: ['prompt'] } },
      { name: 'generateImage', description: 'Generate an image and return base64', parameters: { type: 'object', properties: { prompt: { type: 'string' }, model: { type: 'string' }, seed: { type: 'integer' }, width: { type: 'integer' }, height: { type: 'integer' } }, required: ['prompt'] } },
      { name: 'listImageModels', description: 'List available image models', parameters: { type: 'object', properties: {} } },
      { name: 'respondAudio', description: 'Generate TTS audio (voice) from text', parameters: { type: 'object', properties: { text: { type: 'string' }, voice: { type: 'string' } }, required: ['text'] } },
      { name: 'sayText', description: 'Speak the provided text', parameters: { type: 'object', properties: { text: { type: 'string' }, voice: { type: 'string' } }, required: ['text'] } },
      { name: 'listAudioVoices', description: 'List available voices', parameters: { type: 'object', properties: {} } },
      { name: 'listTextModels', description: 'List text & multimodal models', parameters: { type: 'object', properties: {} } },
      { name: 'listModels', description: 'List models by kind', parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['image','text','audio'] } } } },
    ] };
  }
  function generateImageUrl(client, params) {
    const { prompt, ...rest } = params; const u = new URL(`${client.imageBase}/prompt/${encodeURIComponent(prompt)}`);
    for (const [k, v] of Object.entries(rest)) if (v != null) u.searchParams.set(k, String(v));
    if (client.referrer && !u.searchParams.has('referrer')) u.searchParams.set('referrer', client.referrer);
    return u.toString();
  }
  async function generateImageBase64(client, params) {
    const blob = await image(params.prompt, params, client);
    const ab = await blob.arrayBuffer(); const bytes = new Uint8Array(ab);
    let binary = ''; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) { const sub = bytes.subarray(i, i + chunk); binary += String.fromCharCode.apply(null, sub); }
    return btoa(binary);
  }
  async function listImageModels(client) { return await imageModels(client); }
  async function listTextModels(client) { return await textModels(client); }
  async function listAudioVoices(client) { const models = await textModels(client); return models?.['openai-audio']?.voices ?? []; }

  async function modelCapabilities(client = getDefaultClient()) {
    const [image, text] = await Promise.all([
      imageModels(client).catch(() => ({})),
      textModels(client).catch(() => ({})),
    ]);
    return { image, text, audio: text?.['openai-audio'] ?? {} };
  }

  // --- pipeline.js ---
  class Context extends Map {}
  class Pipeline { constructor() { this.steps = []; } step(s) { this.steps.push(s); return this; } async execute({ client, context = new Context() } = {}) { for (const s of this.steps) await s.run({ client, context }); return context; } }
  class TextGetStep { constructor({ prompt, outKey, params = {} }) { this.prompt = prompt; this.outKey = outKey; this.params = params; } async run({ client, context }) { const v = await text(this.prompt, this.params, client); context.set(this.outKey, v); } }
  class ImageStep { constructor({ prompt, outKey, params = {} }) { this.prompt = prompt; this.outKey = outKey; this.params = params; } async run({ client, context }) { const blob = await image(this.prompt, this.params, client); context.set(this.outKey, { blob }); } }
  class TtsStep { constructor({ text: t, outKey, params = {} }) { this.text = t; this.outKey = outKey; this.params = params; } async run({ client, context }) { const blob = await tts(this.text, this.params, client); context.set(this.outKey, { blob }); } }
  class VisionUrlStep { constructor({ imageUrl, outKey, question, params = {} }) { this.imageUrl = imageUrl; this.outKey = outKey; this.params = { question, ...params }; } async run({ client, context }) { const v = await vision({ imageUrl: this.imageUrl, ...this.params }, client); context.set(this.outKey, v); } }

  // --- top-level API ---
  function configure({ referrer = undefined, imageBase = 'https://image.pollinations.ai', textBase = 'https://text.pollinations.ai', timeoutMs = 60_000 } = {}) {
    setDefaultClient(new PolliClientWeb({ referrer, imageBase, textBase, timeoutMs }));
  }

  const api = {
    configure,
    image, text, chat, search, tts, stt, vision,
    imageModels, textModels, imageFeed, textFeed, modelCapabilities,
    tools: { functionTool, ToolBox, chatWithTools },
    mcp: { serverName, toolDefinitions, generateImageUrl, generateImageBase64, listImageModels, listTextModels, listAudioVoices },
    pipeline: { Context, Pipeline, TextGetStep, ImageStep, TtsStep, VisionUrlStep },
    PolliClientWeb,
  };

  g.polliLib = api;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
