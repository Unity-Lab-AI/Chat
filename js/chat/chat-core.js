// ===== network.js =====
async function apiFetch(url, options = {}, { timeoutMs = 45000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'AbortError')), timeoutMs);
    try {
        const res = await fetch(
            url,
            { ...options, signal: controller.signal, cache: 'no-store' }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
    } finally {
        clearTimeout(timer);
    }
}
window.apiFetch = apiFetch;

// Load global AI instructions from external markdown file
window.aiInstructions = "";
window.aiInstructionPromise = fetch("prompts/ai-instruct.md")
    .then(res => res.text())
    .then(text => { window.aiInstructions = text; })
    .catch(err => {
        console.error("Failed to load AI instructions", err);
        window.aiInstructions = "";
    });

// Ensure AI instructions are loaded before any polliLib calls
window.ensureAIInstructions = async function ensureAIInstructions() {
    if (window.aiInstructions) return window.aiInstructions;
    try {
        if (window.aiInstructionPromise) await window.aiInstructionPromise;
    } catch (e) {
        // fall through to re-fetch
    }
    if (window.aiInstructions) return window.aiInstructions;
    try {
        const res = await fetch("prompts/ai-instruct.md", { cache: "no-store" });
        window.aiInstructions = await res.text();
    } catch (e) {
        console.error("Failed to fetch AI instructions", e);
        window.aiInstructions = "";
    }
    return window.aiInstructions;
};

// Schema for structured UI commands
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

function validateUICommand(cmd) {
    if (!cmd || typeof cmd !== 'object') return false;
    const { action, target, value } = cmd;
    if (!uiCommandSchema.properties.action.enum.includes(action)) return false;
    if (['changeTheme', 'changeModel', 'click'].includes(action) && typeof target !== 'string') return false;
    if (action === 'setValue' && (typeof target !== 'string' || typeof value !== 'string')) return false;
    return true;
}

document.addEventListener("DOMContentLoaded", () => {

    const chatBox = document.getElementById("chat-box");
    const chatInput = document.getElementById("chat-input");
    const sendButton = document.getElementById("send-button");
    const clearChatBtn = document.getElementById("clear-chat");
    const voiceToggleBtn = document.getElementById("voice-toggle");
    const modelSelect = document.getElementById("model-select");

    let currentSession = Storage.getCurrentSession();
    if (!currentSession) {
        currentSession = Storage.createSession("New Chat");
        localStorage.setItem("currentSessionId", currentSession.id);
    }

    const synth = window.speechSynthesis;
    let voices = [];
    let selectedVoice = null;
    let isSpeaking = false;
    let autoSpeakEnabled = localStorage.getItem("autoSpeakEnabled") === "true";
    let currentlySpeakingMessage = null;
    let activeUtterance = null;
    let recognition = null;
    let isListening = false;
    let voiceInputBtn = null;
    let slideshowInterval = null;

    let capabilities = window.pollinationsCaps || null;

    async function ensureCapabilities() {
        if (!capabilities && window.polliLib?.modelCapabilities) {
            try {
                capabilities = await window.polliLib.modelCapabilities();
                window.pollinationsCaps = capabilities;
            } catch (e) {
                console.warn('capabilities fetch failed', e);
                capabilities = {};
            }
        }
    }

    function applyCapabilities(model) {
        const info = capabilities?.text?.[model] || {};
        const hasAudio = !!info.audio;
        if (voiceToggleBtn) voiceToggleBtn.disabled = !hasAudio;
        if (voiceInputBtn) voiceInputBtn.disabled = !hasAudio;
    }

    window.updateCapabilityUI = applyCapabilities;
    ensureCapabilities().then(() => applyCapabilities(modelSelect?.value));

    function normalize(str) {
        return str?.toLowerCase().trim() || "";
    }

    function autoTagVoiceTargets(root = document) {
        const selectors = 'button, [role="button"], a, input, select, textarea';
        const elements = root.querySelectorAll(selectors);
        for (const el of elements) {
            if (el.dataset.voice) continue;
            const labels = [
                el.id?.replace(/[-_]/g, ' '),
                el.getAttribute('aria-label'),
                el.getAttribute('title'),
                el.textContent
            ].map(normalize).filter(Boolean);
            if (!labels.length) continue;
            const variants = new Set();
            for (const label of labels) {
                variants.add(label);
                if (label.endsWith('s')) variants.add(label.slice(0, -1));
                else variants.add(label + 's');
            }
            el.dataset.voice = Array.from(variants).join(' ');
        }
    }

    autoTagVoiceTargets();
    const voiceTagObserver = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                autoTagVoiceTargets(node);
            }
        }
    });
    voiceTagObserver.observe(document.body, { childList: true, subtree: true });

    function findElement(phrase) {
        const norm = normalize(phrase);
        const id = norm.replace(/\s+/g, "-");
        let el = document.getElementById(id) ||
                 document.querySelector(`[data-voice~="${norm}"]`);

        if (!el && norm.endsWith('s')) {
            const singular = norm.slice(0, -1);
            const singularId = singular.replace(/\s+/g, "-");
            el = document.getElementById(singularId) ||
                document.querySelector(`[data-voice~="${singular}"]`);
        }

        if (el) return el;

        const candidates = Array.from(document.querySelectorAll("*"));
        for (const candidate of candidates) {
            const texts = [
                candidate.getAttribute("aria-label"),
                candidate.getAttribute("title"),
                candidate.textContent,
                candidate.dataset?.voice
            ].map(normalize);
            if (texts.some(t => t && (t.includes(norm) || norm.includes(t)))) {
                return candidate;
            }
        }
        return null;
    }

    function executeCommand(command) {
        if (typeof command === 'object') {
            if (!validateUICommand(command)) return false;
            const { action, target, value } = command;
            if (action === 'openScreensaver') {
                const reply = "Just a second, opening the screensaver.";
                if (!window.screensaverActive) document.getElementById("toggle-screensaver")?.click();
                window.addNewMessage({ role: "ai", content: reply });
                if (autoSpeakEnabled) speakMessage(reply);
                return true;
            }
            if (action === 'closeScreensaver') {
                const reply = "Closing the screensaver.";
                if (window.screensaverActive) document.getElementById("toggle-screensaver")?.click();
                window.addNewMessage({ role: "ai", content: reply });
                if (autoSpeakEnabled) speakMessage(reply);
                return true;
            }
            if (action === 'changeTheme') {
                const theme = target.trim().replace(/\s+/g, '-');
                const themeSelect = document.getElementById("theme-select");
                const themeSettings = document.getElementById("theme-select-settings");
                if (themeSelect) {
                    themeSelect.value = theme;
                    themeSelect.dispatchEvent(new Event('change'));
                }
                if (themeSettings) {
                    themeSettings.value = theme;
                    themeSettings.dispatchEvent(new Event('change'));
                }
                showToast(`Theme changed to ${theme}`);
                return true;
            }
            if (action === 'changeModel') {
                const desired = target.trim();
                const option = Array.from(modelSelect.options).find(opt =>
                    opt.textContent.toLowerCase().includes(desired.toLowerCase()));
                let reply;
                if (option) {
                    modelSelect.value = option.value;
                    modelSelect.dispatchEvent(new Event("change"));
                    reply = `Model changed to ${option.textContent}.`;
                } else {
                    reply = `I couldn't find a model named ${desired}.`;
                }
                window.addNewMessage({ role: "ai", content: reply });
                if (autoSpeakEnabled) speakMessage(reply);
                return true;
            }
            if (action === 'setValue') {
                const el = findElement(target);
                let reply;
                if (el && "value" in el) {
                    el.value = value;
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                    reply = `${target} set to ${value}.`;
                } else {
                    reply = `I couldn't find ${target}.`;
                }
                window.addNewMessage({ role: "ai", content: reply });
                if (autoSpeakEnabled) speakMessage(reply);
                return true;
            }
            if (action === 'click') {
                let el = findElement(target);
                if (!el && target === "screensaver") {
                    el = findElement("toggle screensaver");
                }
                let reply;
                if (el) {
                    el.click();
                    reply = `${target} activated.`;
                } else {
                    reply = `I couldn't find ${target}.`;
                }
                window.addNewMessage({ role: "ai", content: reply });
                if (autoSpeakEnabled) speakMessage(reply);
                return true;
            }
            return false;
        }

        const message = command;
        const lower = message.toLowerCase().trim();

        const openScreensaver = /^(open|start)( the)? screensaver$/.test(lower);
        const closeScreensaver = /^(close|stop)( the)? screensaver$/.test(lower);

        if (openScreensaver) {
            const reply = "Just a second, opening the screensaver.";
            if (!window.screensaverActive) document.getElementById("toggle-screensaver")?.click();
            window.addNewMessage({ role: "ai", content: reply });
            if (autoSpeakEnabled) speakMessage(reply);
            return true;
        }
        if (closeScreensaver) {
            const reply = "Closing the screensaver.";
            if (window.screensaverActive) document.getElementById("toggle-screensaver")?.click();
            window.addNewMessage({ role: "ai", content: reply });
            if (autoSpeakEnabled) speakMessage(reply);
            return true;
        }


        const themeMatch = lower.match(/change theme to\s+(.+)/);
        if (themeMatch) {
            const theme = themeMatch[1].trim().replace(/\s+/g, '-');
            const themeSelect = document.getElementById("theme-select");
            const themeSettings = document.getElementById("theme-select-settings");
            if (themeSelect) {
                themeSelect.value = theme;
                themeSelect.dispatchEvent(new Event('change'));
            }
            if (themeSettings) {
                themeSettings.value = theme;
                themeSettings.dispatchEvent(new Event('change'));
            }
            showToast(`Theme changed to ${theme}`);
            return true;
        }

        const modelMatch = lower.match(/^(change|set|switch) model to (.+)$/);
        if (modelMatch) {
            const desired = modelMatch[2].trim();
            const option = Array.from(modelSelect.options).find(opt =>
                opt.textContent.toLowerCase().includes(desired));
            let reply;
            if (option) {
                modelSelect.value = option.value;
                modelSelect.dispatchEvent(new Event("change"));
                reply = `Model changed to ${option.textContent}.`;
            } else {
                reply = `I couldn't find a model named ${desired}.`;
            }
            window.addNewMessage({ role: "ai", content: reply });
            if (autoSpeakEnabled) speakMessage(reply);
            return true;
        }

        const setMatch = message.match(/^set (?:the )?(.+?) to[:]?\s*(.+)$/i);
        if (setMatch) {
            const target = setMatch[1].trim();
            const value = (setMatch[2] || "").trim();
            const el = findElement(target);
            let reply;
            if (el && "value" in el) {
                el.value = value;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                reply = `${target} set to ${value}.`;
            } else {
                reply = `I couldn't find ${target}.`;
            }
            window.addNewMessage({ role: "ai", content: reply });
            if (autoSpeakEnabled) speakMessage(reply);
            return true;
        }

        const clickMatch = message.match(/^(click|press|activate|toggle|open|start|close|stop|pause|resume|play|save|copy|hide|show|exit|fullscreen) (?:the )?(.+)$/i);
        if (clickMatch) {
            const verb = clickMatch[1].toLowerCase();
            const target = clickMatch[2].trim();
            let el = findElement(target);
            if (!el && target === "screensaver") {
                el = findElement(verb);
            }
            if (!el) {
                const actionTarget = `${verb} ${target}`;
                el = findElement(actionTarget);
            }
            if (!el) {
                el = findElement(verb);
            }
            let reply;
            if (el) {
                el.click();
                reply = `${target} activated.`;
            } else {
                reply = `I couldn't find ${target}.`;
            }
            window.addNewMessage({ role: "ai", content: reply });
            if (autoSpeakEnabled) speakMessage(reply);
            return true;
        }

        const singleMatch = message.match(/^(pause|resume|play|save|copy|hide|show|exit|fullscreen)$/i);
        if (singleMatch) {
            const verb = singleMatch[1];
            const el = findElement(verb);
            let reply;
            if (el) {
                el.click();
                reply = `${verb} activated.`;
            } else {
                reply = `I couldn't find ${verb}.`;
            }
            window.addNewMessage({ role: "ai", content: reply });
            if (autoSpeakEnabled) speakMessage(reply);
            return true;
        }

        return false;
    }

    const applyPollinationsAuth = (url) => {
        if (!url) return url;
        try {
            return window.ensurePollinationsUrlAuth ? window.ensurePollinationsUrlAuth(url) : url;
        } catch {
            return url;
        }
    };

    const polliTools = window.polliLib?.tools;
    const toolDefinitions = polliTools ? [
        polliTools.functionTool('image', 'Generate an image', {
            type: 'object',
            properties: { prompt: { type: 'string', description: 'Image description' } },
            required: ['prompt']
        }),
        polliTools.functionTool('tts', 'Convert text to speech', {
            type: 'object',
            properties: { text: { type: 'string', description: 'Text to speak' } },
            required: ['text']
        }),
        polliTools.functionTool('ui', 'Execute a UI command', {
            type: 'object',
            properties: { command: uiCommandSchema },
            required: ['command']
        })
    ] : [];

    const toolbox = polliTools ? new polliTools.ToolBox() : { register() { return this; }, get() { return null; } };
    toolbox
        .register('image', async ({ prompt }) => {
            if (!(window.polliLib && window.polliClient)) return {};
            try {
                const baseOptions = { width: 512, height: 512, private: true, nologo: true, safe: true };
                const result = await window.polliLib.image(
                    prompt,
                    { ...baseOptions, json: true },
                    window.polliClient
                );
                let url = typeof result === 'object' && result?.url ? result.url : null;
                if (!url && window.polliLib?.mcp?.generateImageUrl) {
                    url = window.polliLib.mcp.generateImageUrl(window.polliClient, { ...baseOptions, prompt });
                }
                if (!url && result && typeof URL?.createObjectURL === 'function') {
                    url = URL.createObjectURL(result);
                }
                const finalUrl = applyPollinationsAuth(url);
                return finalUrl ? { imageUrl: finalUrl } : {};
            } catch (e) {
                console.warn('polliLib image failed', e);
                return {};
            }
        })
        .register('tts', async ({ text }) => {
            if (!(window.polliLib && window.polliClient)) return {};
            try {
                const blob = await window.polliLib.tts(text, { model: 'openai-audio' }, window.polliClient);
                const url = URL.createObjectURL(blob);
                return { audioUrl: url };
            } catch (e) {
                console.warn('polliLib tts failed', e);
                return {};
            }
        })
        .register('ui', async ({ command }) => {
            if (!validateUICommand(command)) {
                console.warn('invalid ui command', command);
                return {};
            }
            try { executeCommand(command); } catch (e) { console.warn('executeCommand failed', e); }
            return {};
        });

    async function handleToolJson(raw, { imageUrls, audioUrls }, messageObj = null) {
        const textFromSpecs = [];
        let handled = false;
        const structured = { images: [], audio: [], ui: [], voice: [] };

        const tryParseJson = (value) => {
            if (typeof value !== 'string') return null;
            const trimmed = value.trim();
            if (!trimmed) return null;
            try {
                return JSON.parse(trimmed);
            } catch (err) {
                if (window.repairJson) {
                    try {
                        const repaired = window.repairJson(trimmed);
                        if (repaired && typeof repaired === 'object') {
                            const keys = Object.keys(repaired);
                            if (!(keys.length === 1 && repaired.text === trimmed)) {
                                return repaired;
                            }
                        }
                    } catch (repairErr) {
                        console.warn('repairJson failed', repairErr);
                    }
                }
            }
            return null;
        };

        const parseCommandString = (value) => {
            if (typeof value !== 'string') return value;
            const trimmed = value.trim();
            if (!trimmed) return null;
            const parsed = tryParseJson(trimmed);
            if (parsed && typeof parsed === 'object') return parsed;
            const tokens = trimmed.split(' ').map(part => part.trim()).filter(Boolean);
            if (!tokens.length) return null;
            const [action, ...rest] = tokens;
            const target = rest.length ? rest.join(' ') : undefined;
            return { action, target };
        };

        const parseArgPayload = (payload) => {
            if (payload == null) return {};
            if (typeof payload === 'string') {
                const parsed = tryParseJson(payload);
                if (parsed && typeof parsed === 'object') return parsed;
                return { prompt: payload };
            }
            if (typeof payload === 'object') {
                return Array.isArray(payload) ? { values: payload } : { ...payload };
            }
            return {};
        };

        const extractArgs = (source) => {
            if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
            const argKeys = ['arguments', 'args', 'parameters', 'payload', 'data', 'input', 'options', 'values'];
            for (const key of argKeys) {
                if (source[key] != null) {
                    const parsed = parseArgPayload(source[key]);
                    if (parsed && Object.keys(parsed).length) return parsed;
                }
            }
            const args = {};
            for (const [key, value] of Object.entries(source)) {
                if (value === undefined) continue;
                if (['tool', 'name', 'type', 'function', 'tool_calls', 'tools', 'commands', 'command', 'ui', 'image', 'images', 'audio', 'tts', 'voice', 'speak'].includes(key)) continue;
                if (['text', 'message', 'response', 'reply', 'description', 'caption'].includes(key)) continue;
                args[key] = value;
            }
            if (source.prompt != null && args.prompt == null) args.prompt = source.prompt;
            if (source.text != null && args.text == null) args.text = source.text;
            if (source.command && typeof source.command === 'object' && args.command == null) args.command = source.command;
            return args;
        };

        const pickString = (candidates) => {
            for (const value of candidates) {
                if (typeof value === 'string' && value.trim()) return value.trim();
            }
            return null;
        };

        const mapToolName = (name) => {
            if (!name) return null;
            const normalized = String(name).toLowerCase();
            if (normalized.includes('image') || normalized.includes('picture') || normalized.includes('photo') || normalized.includes('draw') || normalized.includes('art')) {
                return 'image';
            }
            if (normalized.includes('audio') || normalized.includes('speak') || normalized.includes('voice') || normalized.includes('sound') || normalized.includes('speech') || normalized.includes('tts')) {
                return 'tts';
            }
            if (normalized.includes('ui') || normalized.includes('command') || normalized.includes('action') || normalized.includes('control')) {
                return 'ui';
            }
            return normalized;
        };

        const executeTool = async (name, rawArgs = {}, original = null) => {
            const canonical = mapToolName(name);
            if (!canonical) return false;
            const fn = toolbox.get(canonical);
            if (!fn) return false;

            let args = {};
            if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
                args = { ...rawArgs };
            } else if (typeof rawArgs === 'string') {
                args = { value: rawArgs };
            }

            if (canonical === 'image') {
                const prompt = pickString([
                    args.prompt,
                    args.description,
                    args.text,
                    args.query,
                    args.input,
                    original?.prompt,
                    original?.description,
                    original?.text,
                    typeof original === 'string' ? original : null
                ]);
                if (!prompt) return false;
                args = { ...args, prompt };
            } else if (canonical === 'tts') {
                const textValue = pickString([
                    args.text,
                    args.prompt,
                    args.speech,
                    args.say,
                    args.message,
                    args.content,
                    original?.text,
                    original?.speech,
                    original?.message,
                    typeof original === 'string' ? original : null
                ]);
                if (!textValue) return false;
                args = { ...args, text: textValue };
            } else if (canonical === 'ui') {
                let command = args.command ?? original?.command ?? args;
                if (typeof command === 'string') {
                    command = parseCommandString(command);
                } else if (!command || Array.isArray(command)) {
                    command = {
                        action: args.action ?? original?.action,
                        target: args.target ?? original?.target,
                        value: args.value ?? original?.value
                    };
                }
                if (typeof command === 'string') {
                    command = parseCommandString(command);
                }
                if (!command || !validateUICommand(command)) return false;
                args = { command };
                structured.ui.push({ command });
            }

            try {
                const result = await fn(args);
                if (result?.imageUrl) {
                    const finalUrl = applyPollinationsAuth(result.imageUrl);
                    if (finalUrl) {
                        imageUrls.push(finalUrl);
                        structured.images.push({ url: finalUrl, prompt: args.prompt ?? null, options: args });
                    }
                }
                if (result?.audioUrl) {
                    audioUrls.push(result.audioUrl);
                    structured.audio.push({ url: result.audioUrl, text: args.text ?? null, options: args });
                }
                if (typeof result?.text === 'string') {
                    textFromSpecs.push(result.text);
                }
                handled = true;
                return true;
            } catch (e) {
                console.warn('tool execution failed', e);
            }
            return false;
        };

        const processStructuredValue = async (value, parentToolName = null) => {
            if (value == null) return;

            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                const str = String(value).trim();
                if (!str) return;
                if (parentToolName) {
                    if (parentToolName === 'voice') {
                        structured.voice.push(str);
                        return;
                    }
                    if (parentToolName === 'image') {
                        await executeTool('image', { prompt: str }, str);
                        return;
                    }
                    if (parentToolName === 'tts') {
                        await executeTool('tts', { text: str }, str);
                        return;
                    }
                    if (parentToolName === 'ui') {
                        await executeTool('ui', { command: str }, str);
                        return;
                    }
                    await executeTool(parentToolName, { value: str }, str);
                    return;
                }
                textFromSpecs.push(str);
                return;
            }

            if (Array.isArray(value)) {
                for (const item of value) {
                    await processStructuredValue(item, parentToolName);
                }
                return;
            }

            if (typeof value !== 'object') return;

            if (parentToolName) {
                if (parentToolName === 'voice') {
                    const voiceText = pickString([
                        value.text,
                        value.message,
                        value.prompt,
                        value.say,
                        value.response
                    ]);
                    if (voiceText) structured.voice.push(voiceText);
                    return;
                }
                const args = extractArgs(value);
                const executed = await executeTool(parentToolName, args, value);
                if (executed) return;
            }

            if (Array.isArray(value.tool_calls)) {
                for (const call of value.tool_calls) {
                    await processStructuredValue(call);
                }
            }

            if (Array.isArray(value.tools)) {
                for (const tool of value.tools) {
                    await processStructuredValue(tool);
                }
            }

            if (Array.isArray(value.commands)) {
                for (const cmd of value.commands) {
                    await processStructuredValue({ tool: 'ui', ...cmd });
                }
            }

            if (value.function && value.function.name) {
                const args = parseArgPayload(value.function.arguments ?? value.function.args ?? value.function.parameters ?? value.function.payload);
                await executeTool(value.function.name, args, value.function);
            }

            if (value.name && (value.arguments || value.args || value.parameters)) {
                const args = parseArgPayload(value.arguments ?? value.args ?? value.parameters);
                await executeTool(value.name, args, value);
            }

            if (value.tool) {
                if (typeof value.tool === 'object') {
                    await processStructuredValue(value.tool);
                } else {
                    const args = extractArgs(value);
                    await executeTool(value.tool, args, value);
                }
            } else if (value.type) {
                await executeTool(value.type, extractArgs(value), value);
            }

            if (value.image !== undefined) await processStructuredValue(value.image, 'image');
            if (value.images !== undefined) await processStructuredValue(value.images, 'image');
            if (value.audio !== undefined) await processStructuredValue(value.audio, 'tts');
            if (value.tts !== undefined) await processStructuredValue(value.tts, 'tts');
            if (value.voice !== undefined) await processStructuredValue(value.voice, 'voice');
            if (value.speak !== undefined) await processStructuredValue(value.speak, 'tts');
            if (value.ui !== undefined) await processStructuredValue(value.ui, 'ui');
            if (value.command !== undefined) await processStructuredValue(value.command, 'ui');

            const textKeys = ['text', 'message', 'response', 'reply', 'caption', 'description'];
            for (const key of textKeys) {
                if (typeof value[key] === 'string') {
                    const trimmed = value[key].trim();
                    if (trimmed) textFromSpecs.push(trimmed);
                }
            }
        };

        const extractJsonSections = (input) => {
            if (typeof input !== 'string') return [];
            const sections = [];
            let start = -1;
            let depth = 0;
            let inString = false;
            let escape = false;
            for (let i = 0; i < input.length; i++) {
                const char = input[i];
                if (start === -1) {
                    if (char === '{' || char === '[') {
                        start = i;
                        depth = 1;
                        inString = false;
                        escape = false;
                    }
                    continue;
                }
                if (escape) {
                    escape = false;
                    continue;
                }
                if (char === '\' && inString) {
                    escape = true;
                    continue;
                }
                if (char === '"') {
                    inString = !inString;
                    continue;
                }
                if (inString) continue;
                if (char === '{' || char === '[') {
                    depth += 1;
                    continue;
                }
                if (char === '}' || char === ']') {
                    depth -= 1;
                    if (depth === 0) {
                        const snippet = input.slice(start, i + 1);
                        const parsed = tryParseJson(snippet);
                        if (parsed !== null) {
                            sections.push({ start, end: i + 1, value: parsed });
                        }
                        start = -1;
                        depth = 0;
                        inString = false;
                        escape = false;
                    } else if (depth < 0) {
                        start = -1;
                        depth = 0;
                    }
                }
            }
            return sections;
        };

        const handledFenceTypes = new Set(['image', 'audio', 'ui', 'voice', 'video']);
        const instructions = [];
        let leftoverText = typeof raw === 'string' ? raw : '';

        if (typeof raw === 'string' && raw.trim()) {
            const jsonSections = extractJsonSections(raw);
            const segments = [];
            let lastIndex = 0;
            for (const section of jsonSections) {
                if (section.start > lastIndex) {
                    segments.push({ text: raw.slice(lastIndex, section.start), start: lastIndex });
                }
                instructions.push({ start: section.start, value: section.value });
                lastIndex = section.end;
            }
            if (lastIndex < raw.length) {
                segments.push({ text: raw.slice(lastIndex), start: lastIndex });
            }

            const cleanedSegments = [];
            for (const segment of segments) {
                const text = segment.text;
                if (typeof text !== 'string' || text.indexOf('```') === -1) {
                    cleanedSegments.push(text);
                    continue;
                }
                let idx = 0;
                let cleaned = '';
                while (idx < text.length) {
                    const fenceStart = text.indexOf('```', idx);
                    if (fenceStart === -1) {
                        cleaned += text.slice(idx);
                        break;
                    }
                    const langLineEnd = text.indexOf('\n', fenceStart + 3);
                    if (langLineEnd === -1) {
                        cleaned += text.slice(idx);
                        break;
                    }
                    const lang = text.slice(fenceStart + 3, langLineEnd).trim().toLowerCase();
                    const fenceEnd = text.indexOf('```', langLineEnd + 1);
                    if (fenceEnd === -1) {
                        cleaned += text.slice(idx);
                        break;
                    }
                    if (handledFenceTypes.has(lang)) {
                        cleaned += text.slice(idx, fenceStart);
                        const blockContent = text.slice(langLineEnd + 1, fenceEnd).trim();
                        if (blockContent) {
                            instructions.push({ start: segment.start + fenceStart, value: { fence: lang, content: blockContent } });
                        }
                        idx = fenceEnd + 3;
                    } else {
                        cleaned += text.slice(idx, fenceEnd + 3);
                        idx = fenceEnd + 3;
                    }
                }
                cleanedSegments.push(cleaned);
            }
            leftoverText = cleanedSegments.join('');
        }

        if (Array.isArray(messageObj?.tool_calls)) {
            let offset = -1;
            for (const call of messageObj.tool_calls) {
                instructions.push({ start: offset, value: { toolCall: call } });
                offset -= 1;
            }
        }

        instructions.sort((a, b) => a.start - b.start);

        for (const entry of instructions) {
            const value = entry.value;
            if (!value) continue;
            if (value.toolCall) {
                await processStructuredValue(value.toolCall);
                continue;
            }
            if (value.fence) {
                const lang = value.fence;
                if (lang === 'voice') {
                    structured.voice.push(value.content);
                } else if (lang === 'image') {
                    await processStructuredValue({ tool: 'image', prompt: value.content });
                } else if (lang === 'audio') {
                    await processStructuredValue({ tool: 'tts', text: value.content });
                } else if (lang === 'ui') {
                    await processStructuredValue({ tool: 'ui', command: value.content });
                } else {
                    await processStructuredValue({ tool: lang, prompt: value.content });
                }
                continue;
            }
            await processStructuredValue(value);
        }

        const cleanedLeftover = typeof leftoverText === 'string'
            ? leftoverText.replace(/\n{3,}/g, '\n\n').trim()
            : '';

        const textParts = [];
        if (cleanedLeftover) textParts.push(cleanedLeftover);
        if (textFromSpecs.length) textParts.push(textFromSpecs.join('\n\n').trim());
        const finalText = textParts.join('\n\n').trim();
        const structuredResult = {};
        for (const [key, value] of Object.entries(structured)) {
            if (Array.isArray(value)) {
                if (value.length) structuredResult[key] = value;
            } else if (value) {
                structuredResult[key] = value;
            }
        }

        return { handled, text: finalText, structured: structuredResult };
    }
    function handleVoiceCommand(text) {
        return executeCommand(text);
    }

    function setVoiceInputButton(btn) {
        voiceInputBtn = btn;
        if (window._chatInternals) {
            window._chatInternals.voiceInputBtn = btn;
        }
        if (modelSelect) applyCapabilities(modelSelect.value);
    }

    function loadVoices() {
        return new Promise((resolve) => {
            voices = synth.getVoices();
            if (voices.length === 0) {
                synth.onvoiceschanged = () => {
                    voices = synth.getVoices();
                    if (voices.length > 0) {
                        setVoiceOptions(resolve);
                    }
                };
                setTimeout(() => {
                    if (voices.length === 0) {
                        voices = synth.getVoices();
                        setVoiceOptions(resolve);
                    }
                }, 2000);
            } else {
                setVoiceOptions(resolve);
            }
        });
    }

    function setVoiceOptions(resolve) {
        const savedVoiceIndex = localStorage.getItem("selectedVoiceIndex");
        if (savedVoiceIndex && voices[savedVoiceIndex]) {
            selectedVoice = voices[savedVoiceIndex];
        } else {
            selectedVoice = voices.find((v) => v.name === "Google UK English Female") || 
                            voices.find((v) => v.lang === "en-GB" && v.name.toLowerCase().includes("female")) || 
                            voices[0];
            const selectedIndex = voices.indexOf(selectedVoice);
            if (selectedIndex >= 0) {
                localStorage.setItem("selectedVoiceIndex", selectedIndex);
            }
        }
        populateAllVoiceDropdowns();
        resolve(selectedVoice);
    }

    function getVoiceDropdowns() {
        const voiceSelect = document.getElementById("voice-select");
        const voiceSelectModal = document.getElementById("voice-select-modal");
        const voiceSelectSettings = document.getElementById("voice-select-settings");
        const voiceSelectVoiceChat = document.getElementById("voice-select-voicechat");
        return [voiceSelect, voiceSelectModal, voiceSelectSettings, voiceSelectVoiceChat];
    }

    function populateAllVoiceDropdowns() {
        const dropdowns = getVoiceDropdowns();

        dropdowns.forEach((dropdown) => {
            if (dropdown) {
                dropdown.innerHTML = "";
                voices.forEach((voice, index) => {
                    const option = document.createElement("option");
                    option.value = index;
                    option.textContent = `${voice.name} (${voice.lang})`;
                    dropdown.appendChild(option);
                });

                const savedVoiceIndex = localStorage.getItem("selectedVoiceIndex");
                if (savedVoiceIndex && voices[savedVoiceIndex]) {
                    dropdown.value = savedVoiceIndex;
                }

                dropdown.addEventListener("change", () => {
                    selectedVoice = voices[dropdown.value];
                    localStorage.setItem("selectedVoiceIndex", dropdown.value);
                    updateAllVoiceDropdowns(dropdown.value);
                    showToast(`Voice changed to ${selectedVoice.name}`);
                });
            }
        });
    }

    function updateAllVoiceDropdowns(selectedIndex) {
        const dropdowns = getVoiceDropdowns();

        dropdowns.forEach((dropdown) => {
            if (dropdown && dropdown.value !== selectedIndex) {
                dropdown.value = selectedIndex;
            }
        });
    }

    loadVoices().then(() => {
        updateVoiceToggleUI();
    });

    function toggleAutoSpeak() {
        autoSpeakEnabled = !autoSpeakEnabled;
        localStorage.setItem("autoSpeakEnabled", autoSpeakEnabled.toString());
        updateVoiceToggleUI();
        showToast(autoSpeakEnabled ? "Auto-speak enabled" : "Auto-speak disabled");
        if (autoSpeakEnabled) {
            speakMessage("Voice mode enabled. I'll speak responses out loud.");
        } else {
            stopSpeaking();
        }
    }

    function updateVoiceToggleUI() {
        if (voiceToggleBtn) {
            voiceToggleBtn.textContent = autoSpeakEnabled ? "🔊 Voice On" : "🔇 Voice Off";
            voiceToggleBtn.style.backgroundColor = autoSpeakEnabled ? "#4CAF50" : "";
        }
    }

    function speakMessage(text, onEnd = null) {
        if (!synth || !window.SpeechSynthesisUtterance) {
            showToast("Speech synthesis not supported in your browser");
            return;
        }

        if (isSpeaking) {
            synth.cancel();
            isSpeaking = false;
            activeUtterance = null;
        }

        let speakText = text.replace(/\[CODE\][\s\S]*?\[\/CODE\]/gi, "").replace(/https?:\/\/[^\s)"'<>]+/gi, "").trim();

        const utterance = new SpeechSynthesisUtterance(speakText);
        activeUtterance = utterance;

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        } else {
            loadVoices().then((voice) => {
                if (voice) {
                    utterance.voice = voice;
                    synth.speak(utterance);
                }
            });
            return;
        }

        utterance.rate = parseFloat(localStorage.getItem("voiceSpeed")) || 0.9;
        utterance.pitch = parseFloat(localStorage.getItem("voicePitch")) || 1.0;
        utterance.volume = 1.0;

        utterance.onstart = () => {
            isSpeaking = true;
            currentlySpeakingMessage = speakText;
        };

        utterance.onend = () => {
            isSpeaking = false;
            currentlySpeakingMessage = null;
            activeUtterance = null;
            if (onEnd) onEnd();
        };

        utterance.onerror = (event) => {
            isSpeaking = false;
            currentlySpeakingMessage = null;
            activeUtterance = null;
            showToast(`Speech error: ${event.error}`);
            if (onEnd) onEnd();
        };

        try {
            synth.speak(utterance);
        } catch (err) {
            showToast("Error initiating speech synthesis");
            isSpeaking = false;
            activeUtterance = null;
        }

        const keepAlive = setInterval(() => {
            if (!isSpeaking || !activeUtterance) {
                clearInterval(keepAlive);
            }
        }, 10000);
    }

    function stopSpeaking() {
        if (synth && (isSpeaking || synth.speaking)) {
            synth.cancel();
            isSpeaking = false;
            currentlySpeakingMessage = null;
            activeUtterance = null;
        }
    }

    function shutUpTTS() {
        if (synth) {
            synth.cancel();
            isSpeaking = false;
            currentlySpeakingMessage = null;
            activeUtterance = null;
            showToast("TTS stopped");
        }
    }

    // Directly handle whatever response shape the API returns without filtering.

    function speakSentences(sentences, index = 0) {
        if (index >= sentences.length) {
            return;
        }
        speakMessage(sentences[index], () => speakSentences(sentences, index + 1));
    }

    window.sendToPolliLib = async function sendToPolliLib(callback = null, overrideContent = null) {
        const currentSession = Storage.getCurrentSession();
        const loadingDiv = document.createElement("div");
        loadingDiv.className = "message ai-message";
        loadingDiv.textContent = "Thinking...";
        chatBox.appendChild(loadingDiv);
        chatBox.scrollTop = chatBox.scrollHeight;

        await window.ensureAIInstructions();

        const messages = [];
        if (window.aiInstructions) {
            messages.push({ role: "system", content: window.aiInstructions });
        }
        const memories = Memory.getMemories();
        if (memories?.length) {
            messages.push({ role: "system", content: `Relevant memory:\n${memories.join("\n")}\nUse it in your response.` });
        }

        const HISTORY = 10;
        const end = currentSession.messages.length - 1;
        const start = Math.max(0, end - HISTORY);

        // Ensure roles conform to OpenAI schema before sending to polliLib
        const mapRole = (r) => {
            if (!r) return null;
            const s = String(r).toLowerCase();
            if (s === 'ai') return 'assistant';
            if (s === 'assistant' || s === 'user' || s === 'system') return s;
            // Skip non-chat roles (e.g., tool) for this basic chat flow
            return null;
        };

        for (let i = start; i < end; i++) {
            const m = currentSession.messages[i];
            const role = mapRole(m?.role);
            const content = typeof m?.content === 'string' ? m.content : (m?.content != null ? String(m.content) : '');
            if (role && content) messages.push({ role, content });
        }

        const lastUser = overrideContent || currentSession.messages[end]?.content;
        if (lastUser) {
            messages.push({ role: "user", content: lastUser });
        }

        const modelSelectEl = document.getElementById("model-select");
        const model = modelSelectEl?.value || currentSession.model || Storage.getDefaultModel();
        if (!model) {
            loadingDiv.textContent = "Error: No model selected.";
            setTimeout(() => loadingDiv.remove(), 3000);
            const btn = window._chatInternals?.sendButton || document.getElementById("send-button");
            const input = window._chatInternals?.chatInput || document.getElementById("chat-input");
            if (btn) btn.disabled = false;
            if (input) input.disabled = false;
            showToast("Please select a model before sending a message.");
            if (callback) callback();
            return;
        }

        try {
            const capsInfo = capabilities?.text?.[model];
            const chatParams = { model, messages };
            if (capsInfo?.tools) {
                chatParams.tools = toolDefinitions;
                chatParams.json = true;
            }
            const data = await (window.polliLib?.chat?.(chatParams) ?? Promise.reject(new Error('polliLib not loaded')));
            loadingDiv.remove();

            const messageObj = data?.choices?.[0]?.message || {};
            const imageUrls = [];
            const audioUrls = [];
            let aiContent = "";

            if (Array.isArray(messageObj.content)) {
                for (const part of messageObj.content) {
                    if (!part) continue;
                    if (typeof part === 'string') {
                        aiContent += part;
                    } else if (part.type === 'text' && part.text) {
                        aiContent += part.text;
                    } else if (part.type === 'image_url' && part.image_url?.url) {
                        imageUrls.push(applyPollinationsAuth(part.image_url.url));
                    } else if (part.type === 'audio' && part.audio?.url) {
                        audioUrls.push(part.audio.url);
                    }
                }
            } else {
                aiContent = messageObj.content || "";
            }

            const toolRes = await handleToolJson(aiContent, { imageUrls, audioUrls }, messageObj);
            const structuredOutputs = toolRes.structured || {};
            aiContent = toolRes.text;

            const memRegex = /\[memory\]([\s\S]*?)\[\/memory\]/gi;
            let m;
            while ((m = memRegex.exec(aiContent)) !== null) Memory.addMemoryEntry(m[1].trim());
            aiContent = aiContent.replace(memRegex, "").trim();

            if (structuredOutputs.voice) {
                for (const voiceText of structuredOutputs.voice) {
                    if (!voiceText) continue;
                    try {
                        const sentences = voiceText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
                        speakSentences(sentences);
                    } catch (e) {
                        console.warn('speakSentences failed', e);
                    }
                }
            }

            if (aiContent) {
                aiContent = aiContent.replace(/\n{3,}/g, '\n\n');
                aiContent = aiContent.replace(/\n?---\n?/g, '\n\n---\n\n');
                aiContent = aiContent.replace(/\n{3,}/g, '\n\n').trim();
            }

            const hasMetadata = Object.values(structuredOutputs).some(value => Array.isArray(value) ? value.length > 0 : !!value);
            const metadata = hasMetadata ? structuredOutputs : null;

            window.addNewMessage({ role: "ai", content: aiContent, imageUrls, audioUrls, metadata });
            if (autoSpeakEnabled) {
                const sentences = aiContent.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
                speakSentences(sentences);
            } else {
                stopSpeaking();
            }
            if (callback) callback();
        } catch (err) {
            loadingDiv.textContent = "Error: Failed to get a response.";
            setTimeout(() => loadingDiv.remove(), 3000);
            console.error("Pollinations error:", err);
            if (callback) callback();
            const btn = window._chatInternals?.sendButton || document.getElementById("send-button");
            const input = window._chatInternals?.chatInput || document.getElementById("chat-input");
            if (btn) btn.disabled = false;
            if (input) input.disabled = false;
        }
    };

    function initSpeechRecognition() {
        if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
            showToast("Speech recognition not supported in this browser");
            return false;
        }

        try {
            if ("webkitSpeechRecognition" in window) {
                recognition = new window.webkitSpeechRecognition();
            } else {
                recognition = new window.SpeechRecognition();
            }

            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            if (window._chatInternals) {
                window._chatInternals.recognition = recognition;
            }

            recognition.onstart = () => {
                isListening = true;
                if (voiceInputBtn) {
                    voiceInputBtn.classList.add("listening");
                    voiceInputBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                }
            };

            recognition.onresult = (event) => {
                let finalTranscript = "";
                let interimTranscript = "";

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        const processed = transcript.trim();
                        if (!handleVoiceCommand(processed)) {
                            finalTranscript += processed + " ";
                        }
                    } else {
                        interimTranscript += transcript;
                    }
                }

                if (finalTranscript) {
                    chatInput.value = (chatInput.value + " " + finalTranscript).trim();
                    chatInput.dispatchEvent(new Event("input"));
                    const btn = window._chatInternals?.sendButton || document.getElementById("send-button");
                    if (btn) {
                        btn.disabled = false;
                        btn.click();
                    }
                }
            };

            recognition.onerror = (event) => {
                isListening = false;
                if (voiceInputBtn) {
                    voiceInputBtn.classList.remove("listening");
                    voiceInputBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                }
                console.error("Speech recognition error:", event.error);
            };

            recognition.onend = () => {
                isListening = false;
                if (voiceInputBtn) {
                    voiceInputBtn.classList.remove("listening");
                    voiceInputBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                }
            };

            return true;
        } catch (error) {
            console.error("Error initializing speech recognition:", error);
            showToast("Failed to initialize speech recognition");
            return false;
        }
    }

    function toggleSpeechRecognition() {
        if (!recognition && !initSpeechRecognition()) {
            showToast("Speech recognition not supported in this browser. Please use Chrome, Edge, or Firefox.");
            return;
        }

        if (isListening) {
            recognition.stop();
        } else {
            try {
                showToast("Requesting microphone access...");
                recognition.start();
            } catch (error) {
                showToast("Could not start speech recognition: " + error.message);
                console.error("Speech recognition start error:", error);
            }
        }
    }

    function showToast(message, duration = 3000) {
        let toast = document.getElementById("toast-notification");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "toast-notification";
            toast.style.position = "fixed";
            toast.style.top = "5%";
            toast.style.left = "50%";
            toast.style.transform = "translateX(-50%)";
            const bodyStyles = getComputedStyle(document.body);
            const bgMatch = bodyStyles.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            toast.style.backgroundColor = bgMatch
                ? `rgba(${bgMatch[1]}, ${bgMatch[2]}, ${bgMatch[3]}, 0.7)`
                : bodyStyles.backgroundColor;
            toast.style.color = bodyStyles.color;
            toast.style.padding = "10px 20px";
            toast.style.borderRadius = "5px";
            toast.style.zIndex = "9999";
            toast.style.transition = "opacity 0.3s";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = "1";
        clearTimeout(toast.timeout);
        toast.timeout = setTimeout(() => {
            toast.style.opacity = "0";
        }, duration);
    }

    window._chatInternals = {
        chatBox,
        chatInput,
        sendButton,
        clearChatBtn,
        voiceToggleBtn,
        modelSelect,
        currentSession,
        synth,
        voices,
        selectedVoice,
        isSpeaking,
        autoSpeakEnabled,
        currentlySpeakingMessage,
        recognition,
        isListening,
        voiceInputBtn,
        slideshowInterval,
        setVoiceInputButton,
        applyCapabilities,
        capabilities,
        toggleAutoSpeak,
        updateVoiceToggleUI,
        speakMessage,
        stopSpeaking,
        speakSentences,
        shutUpTTS,
        initSpeechRecognition,
        toggleSpeechRecognition,
        handleVoiceCommand,
        findElement,
        executeCommand,
        showToast,
        loadVoices,
        populateAllVoiceDropdowns,
        updateAllVoiceDropdowns,
        getVoiceDropdowns
    };

});

