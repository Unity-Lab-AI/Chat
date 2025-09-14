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
                const url = window.polliLib.mcp.generateImageUrl(window.polliClient, {
                    prompt,
                    width: 512,
                    height: 512,
                    private: true,
                    nologo: true,
                    safe: true
                });
                return { imageUrl: url };
            } catch (e) {
                console.warn('polliLib generateImageUrl failed', e);
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

    async function handleToolJson(raw, { imageUrls, audioUrls }) {
        try {
            const obj = JSON.parse(raw);
            const fn = toolbox.get(obj.tool);
            if (!fn) return { handled: false, text: raw };
            const res = await fn(obj);
            if (res?.imageUrl) imageUrls.push(res.imageUrl);
            if (res?.audioUrl) audioUrls.push(res.audioUrl);
            return { handled: true, text: res?.text || '' };
        } catch {
            return { handled: false, text: raw };
        }
    }

    function handleVoiceCommand(text) {
        return executeCommand(text);
    }

    function setVoiceInputButton(btn) {
        voiceInputBtn = btn;
        if (window._chatInternals) {
            window._chatInternals.voiceInputBtn = btn;
        }
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
            // Use polliLib OpenAI-compatible chat endpoint
            const data = await (window.polliLib?.chat?.({ model, messages, tools: toolDefinitions }) ?? Promise.reject(new Error('polliLib not loaded')));
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
                        imageUrls.push(part.image_url.url);
                    } else if (part.type === 'audio' && part.audio?.url) {
                        audioUrls.push(part.audio.url);
                    }
                }
            } else {
                aiContent = messageObj.content || "";
            }

            const toolRes = await handleToolJson(aiContent, { imageUrls, audioUrls });
            aiContent = toolRes.text;

            const memRegex = /\[memory\]([\s\S]*?)\[\/memory\]/gi;
            let m;
            while ((m = memRegex.exec(aiContent)) !== null) Memory.addMemoryEntry(m[1].trim());
            aiContent = aiContent.replace(memRegex, "").trim();

            if (aiContent) {
                const processPatterns = async (patterns, handler) => {
                    for (const { pattern, group } of patterns) {
                        const grpIndex = typeof group === 'number' ? group : 1;
                        const p = pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + 'g');
                        const matches = Array.from(aiContent.matchAll(p));
                        for (const match of matches) {
                            const captured = match[grpIndex] && match[grpIndex].trim();
                            if (!captured) continue;
                            try { await handler(captured); } catch (e) { console.warn('pattern handler failed', e); }
                        }
                        aiContent = aiContent.replace(p, '');
                    }
                };

                await processPatterns(window.imagePatterns || [], async prompt => {
                    if (!(window.polliLib && window.polliClient)) return;
                    try {
                        const url = window.polliLib.mcp.generateImageUrl(window.polliClient, {
                            prompt,
                            width: 512,
                            height: 512,
                            private: true,
                            nologo: true,
                            safe: true
                        });
                        imageUrls.push(url);
                    } catch (e) {
                        console.warn('polliLib generateImageUrl failed', e);
                    }
                });

                await processPatterns(window.audioPatterns || [], async prompt => {
                    if (!(window.polliLib && window.polliClient)) return;
                    try {
                        const blob = await window.polliLib.tts(prompt, { model: 'openai-audio' }, window.polliClient);
                        const url = URL.createObjectURL(blob);
                        audioUrls.push(url);
                    } catch (e) {
                        console.warn('polliLib tts failed', e);
                    }
                });

                await processPatterns(window.uiPatterns || [], async command => {
                    try { executeCommand(command); } catch (e) { console.warn('executeCommand failed', e); }
                });

                await processPatterns(window.videoPatterns || [], async prompt => {
                    // Video handling to be implemented
                });

                await processPatterns(window.voicePatterns || [], async text => {
                    try {
                        const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
                        speakSentences(sentences);
                    } catch (e) {
                        console.warn('speakSentences failed', e);
                    }
                });

                aiContent = aiContent.replace(/\n{3,}/g, '\n\n');
                aiContent = aiContent.replace(/\n?---\n?/g, '\n\n---\n\n');
                aiContent = aiContent.replace(/\n{3,}/g, '\n\n').trim();
            }

            window.addNewMessage({ role: "ai", content: aiContent, imageUrls, audioUrls });
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
            toast.style.backgroundColor = "rgba(0,0,0,0.7)";
            toast.style.color = "#fff";
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

