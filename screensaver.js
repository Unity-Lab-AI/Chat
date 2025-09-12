document.addEventListener("DOMContentLoaded", () => {
    const screensaverContainer = document.getElementById("screensaver-container");
    const toggleScreensaverButton = document.getElementById("toggle-screensaver");
    const fullscreenButton = document.getElementById("fullscreen-screensaver");
    const stopButton = document.getElementById("screensaver-exit");
    const playPauseButton = document.getElementById("screensaver-playpause");
    const saveButton = document.getElementById("screensaver-save");
    const copyButton = document.getElementById("screensaver-copy");
    const hideButton = document.getElementById("screensaver-hide");
    const screensaverImage1 = document.getElementById("screensaver-image1");
    const screensaverImage2 = document.getElementById("screensaver-image2");
    const promptInput = document.getElementById("screensaver-prompt");
    const timerInput = document.getElementById("screensaver-timer");
    const aspectSelect = document.getElementById("screensaver-aspect");
    const enhanceCheckbox = document.getElementById("screensaver-enhance");
    const privateCheckbox = document.getElementById("screensaver-private");
    const modelSelect = document.getElementById("screensaver-model");
    const transitionDurationInput = document.getElementById("screensaver-transition-duration");
    const restartPromptButton = document.getElementById("screensaver-restart-prompt");
    const thumbnailsWrapper = document.getElementById("screensaver-thumbnails-wrapper");
    const thumbnailsContainer = document.getElementById("screensaver-thumbnails");
    const thumbLeftButton = document.getElementById("screensaver-thumb-left");
    const thumbRightButton = document.getElementById("screensaver-thumb-right");

    // --- State ---
    let screensaverActive = false;
    let imageInterval = null;
    let promptInterval = null;
    let paused = false;
    let isFullscreen = false;
    let imageHistory = [];
    let promptHistory = [];
    let currentImage = 'image1';
    let controlsHidden = false;
    let isTransitioning = false;
    let autoPromptEnabled = true;
    let isFetchingPrompt = false;
    let lastPromptUpdate = 0;

    const MAX_HISTORY = 10;
    const EMPTY_THUMBNAIL = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    const PROMPT_UPDATE_INTERVAL = 20000;

    // Helper to know if screensaver is actually visible, not just flagged
    const isScreensaverVisible = () => screensaverContainer && !screensaverContainer.classList.contains("hidden");

    let settings = {
        prompt: '',
        timer: 30,
        aspect: 'widescreen',
        model: '',
        enhance: true,
        priv: true,
        transitionDuration: 1
    };

    // --- Titles / Hints ---
    toggleScreensaverButton.title = "Toggle the screensaver on/off.";
    fullscreenButton.title = "Go full screen (or exit it).";
    stopButton.title = "Stop the screensaver.";
    playPauseButton.title = "Play or pause the image rotation.";
    saveButton.title = "Save the current screensaver image.";
    copyButton.title = "Copy the current screensaver image to clipboard.";
    hideButton.title = "Hide or show controls and thumbnails.";
    promptInput.title = "Prompt for the AI to create images from.";
    timerInput.title = "Interval between new images (in seconds).";
    aspectSelect.title = "Select the aspect ratio for the generated image.";
    modelSelect.title = "Choose the image-generation model.";
    enhanceCheckbox.title = "If enabled, the prompt is 'enhanced' via an LLM.";
    privateCheckbox.title = "If enabled, the image won't appear on the public feed.";
    transitionDurationInput.title = "Set the duration of image transitions in seconds.";
    if (restartPromptButton) restartPromptButton.title = "Toggle automatic prompt generation on/off.";

    // --- Persistence ---
    function saveScreensaverSettings() {
        try {
            localStorage.setItem("screensaverSettings", JSON.stringify(settings));
        } catch (err) {
            console.error("Failed to save settings to localStorage:", err);
            window.showToast("Couldn’t save settings.");
        }
    }

    function loadScreensaverSettings() {
        const raw = localStorage.getItem("screensaverSettings");
        if (raw) {
            try {
                const s = JSON.parse(raw);
                settings.prompt = ''; // always start empty prompt
                settings.timer = s.timer || 30;
                settings.aspect = s.aspect || 'widescreen';
                settings.model = s.model || '';
                settings.enhance = s.enhance !== undefined ? s.enhance : true;
                settings.priv = s.priv !== undefined ? s.priv : true;
                settings.transitionDuration = s.transitionDuration || 1;

                promptInput.value = settings.prompt;
                timerInput.value = settings.timer;
                aspectSelect.value = settings.aspect;
                enhanceCheckbox.checked = settings.enhance;
                privateCheckbox.checked = settings.priv;
                transitionDurationInput.value = settings.transitionDuration;
            } catch (err) {
                console.warn("Failed to parse screensaver settings:", err);
            }
        }
    }

    function saveImageHistory() {
        try {
            localStorage.setItem("imageHistory", JSON.stringify(imageHistory));
            localStorage.setItem("promptHistory", JSON.stringify(promptHistory));
        } catch (err) {
            console.error("Failed to save image history to localStorage:", err);
            window.showToast("Couldn’t save gallery.");
        }
    }

    function loadImageHistory() {
        try {
            const rawImages = localStorage.getItem("imageHistory");
            const rawPrompts = localStorage.getItem("promptHistory");
            imageHistory = rawImages ? JSON.parse(rawImages) : [];
            promptHistory = rawPrompts ? JSON.parse(rawPrompts) : [];
        } catch {
            imageHistory = [];
            promptHistory = [];
        }
        updateThumbnailHistory();
    }

    loadScreensaverSettings();
    loadImageHistory();

    // --- Thumbnails scrollers ---
    if (thumbLeftButton && thumbRightButton && thumbnailsContainer) {
        thumbLeftButton.addEventListener("click", () => {
            thumbnailsContainer.scrollBy({ left: -thumbnailsContainer.clientWidth, behavior: "smooth" });
        });
        thumbRightButton.addEventListener("click", () => {
            thumbnailsContainer.scrollBy({ left: thumbnailsContainer.clientWidth, behavior: "smooth" });
        });
    }

    // --- Models ---
    async function fetchImageModels() {
        try {
            const res = await window.pollinationsFetch("https://image.pollinations.ai/models", {
                method: "GET",
                headers: { "Content-Type": "application/json" },
                cache: "no-store"
            });
            const models = await res.json();
            modelSelect.innerHTML = "";
            if (Array.isArray(models) && models.length > 0) {
                models.forEach(name => {
                    const opt = document.createElement("option");
                    opt.value = name;
                    opt.textContent = name;
                    modelSelect.appendChild(opt);
                });
                if (settings.model && models.includes(settings.model)) {
                    modelSelect.value = settings.model;
                } else {
                    settings.model = models[0];
                    modelSelect.value = settings.model;
                }
            }
        } catch (err) {
            console.error("Failed to fetch image models:", err);
        }
    }
    fetchImageModels();

    // --- Utils ---
    function generateSeed() {
        return Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    }

    function getDimensions(aspect) {
        switch (aspect) {
            case "widescreen": return { width: 1920, height: 1080 };
            case "square":     return { width: 1024, height: 1024 };
            case "portrait":   return { width: 1080, height: 1920 };
            default:           return { width: 1920, height: 1080 };
        }
    }

    function preloadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = url;
            img.onload = () => resolve(url);
            img.onerror = () => reject(new Error("Image failed to load"));
        });
    }

    async function fetchDynamicPrompt() {
        const metaPrompt =
            "Generate exactly one short-125-character, new, wild image prompt as text only—outlandish, psychologically thrilling art.";
        const textModel = document.getElementById("model-select")?.value;
        const seed = generateSeed();
        try {
            const response = await window.pollinationsFetch("https://text.pollinations.ai/openai", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                cache: "no-store",
                body: JSON.stringify({
                    model: textModel || "openai",
                    seed,
                    messages: [{ role: "user", content: metaPrompt }]
                })
            });
            const data = await response.json();
            const generatedPrompt = data?.choices?.[0]?.message?.content?.trim();
            if (!generatedPrompt) throw new Error("No prompt returned from API");
            return generatedPrompt;
        } catch (err) {
            console.error("Failed to fetch dynamic prompt:", err);
            throw err;
        }
    }

    async function updatePrompt() {
        if (!isScreensaverVisible() || paused || !autoPromptEnabled || isFetchingPrompt) return false;
        isFetchingPrompt = true;
        try {
            const newPrompt = await fetchDynamicPrompt();
            promptInput.value = newPrompt;
            settings.prompt = newPrompt;
            saveScreensaverSettings();
            window.showToast("New prompt loaded: " + newPrompt);
            lastPromptUpdate = Date.now();
            return true;
        } catch (err) {
            window.showToast("Couldn’t get a new prompt. Will retry.");
            lastPromptUpdate = Date.now();
            return false;
        } finally {
            isFetchingPrompt = false;
        }
    }

    async function fetchNewImage() {
        if (isTransitioning) return;
        isTransitioning = true;

        saveScreensaverSettings();
        let prompt = promptInput.value.trim();
        if (!prompt || autoPromptEnabled) {
            const success = await updatePrompt();
            if (success) prompt = promptInput.value.trim();
            if (!success && !prompt) {
                isTransitioning = false;
                return;
            }
        }

        const { width, height } = getDimensions(settings.aspect);
        const seed = generateSeed();
        const model = settings.model || modelSelect.value;
        const enhance = settings.enhance;
        const priv = settings.priv;

        const url =
            `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?` +
            `width=${width}&height=${height}&seed=${seed}&model=${model}` +
            `&nologo=true&private=${priv}&enhance=${enhance}&nolog=true&referrer=unityailab.com`;

        const nextImage = currentImage === 'image1' ? 'image2' : 'image1';
        const nextImgElement = document.getElementById(`screensaver-${nextImage}`);
        const currentImgElement = document.getElementById(`screensaver-${currentImage}`);

        let imageAddedToHistory = false;
        function handleImageLoad() {
            nextImgElement.style.opacity = '1';
            currentImgElement.style.opacity = '0';
            currentImage = nextImage;
            if (!imageAddedToHistory) {
                addToHistory(nextImgElement.src, prompt);
                imageAddedToHistory = true;
            }
        }

        nextImgElement.onload = handleImageLoad;
        nextImgElement.onerror = () => {
            const fallbackUrl = "https://via.placeholder.com/512?text=Image+Failed";
            nextImgElement.src = fallbackUrl;
            nextImgElement.onload = handleImageLoad;
        };

        try {
            await preloadImage(url);
            nextImgElement.src = url;
        } catch {
            nextImgElement.src = "https://via.placeholder.com/512?text=Image+Failed";
        } finally {
            isTransitioning = false;
        }
    }

    function addToHistory(imageUrl, prompt) {
        imageHistory.push(imageUrl);
        promptHistory.push(prompt);
        if (imageHistory.length > MAX_HISTORY) {
            imageHistory.shift();
            promptHistory.shift();
        }
        saveImageHistory();
        updateThumbnailHistory();
    }

    function updateThumbnailHistory() {
        const thumbnailContainer = document.getElementById('screensaver-thumbnails');
        if (!thumbnailContainer) {
            console.error("Thumbnail container not found in DOM.");
            window.showToast("Thumbnail container missing.");
            return;
        }

        const slots = thumbnailContainer.querySelectorAll('img.thumbnail');
        slots.forEach((thumb, index) => {
            const imageUrl = imageHistory[index];
            thumb.onclick = null;
            thumb.classList.remove('selected', 'placeholder');

            if (imageUrl) {
                thumb.src = imageUrl;
                thumb.title = promptHistory[index] || 'No prompt available';
                thumb.onclick = () => showHistoricalImage(index);
                const currentImgSrc = document.getElementById(`screensaver-${currentImage}`).src;
                if (imageUrl === currentImgSrc) thumb.classList.add('selected');
            } else {
                thumb.src = EMPTY_THUMBNAIL;
                thumb.title = '';
                thumb.classList.add('placeholder');
            }
        });

        thumbnailContainer.scrollTo({ left: thumbnailContainer.scrollWidth, behavior: 'smooth' });
        // Force reflow to ensure rendering correctness on some browsers
        const display = thumbnailContainer.style.display;
        thumbnailContainer.style.display = 'none';
        // eslint-disable-next-line no-unused-expressions
        thumbnailContainer.offsetHeight;
        thumbnailContainer.style.display = display || 'flex';
    }

    function showHistoricalImage(index) {
        const imageUrl = imageHistory[index];
        const currentImgElement = document.getElementById(`screensaver-${currentImage}`);
        const nextImage = currentImage === 'image1' ? 'image2' : 'image1';
        const nextImgElement = document.getElementById(`screensaver-${nextImage}`);

        currentImgElement.style.opacity = '0';
        nextImgElement.onload = () => {
            nextImgElement.style.opacity = '1';
            currentImage = nextImage;
            updateThumbnailHistory();
        };
        nextImgElement.onerror = () => {
            nextImgElement.src = "https://via.placeholder.com/512?text=Image+Failed";
            nextImgElement.style.opacity = '1';
            currentImage = nextImage;
            updateThumbnailHistory();
        };
        nextImgElement.src = imageUrl;
        nextImgElement.alt = "Screensaver Image";

        if (nextImgElement.complete && nextImgElement.naturalWidth !== 0) {
            nextImgElement.style.opacity = '1';
            currentImgElement.style.opacity = '0';
            currentImage = nextImage;
            updateThumbnailHistory();
        }

        // resume automatic rotation after manual selection
        setOrResetImageInterval();
    }

    function setOrResetImageInterval() {
        clearInterval(imageInterval);
        imageInterval = setInterval(() => {
            if (!paused && isScreensaverVisible()) {
                fetchNewImage();
            }
        }, settings.timer * 1000);
    }

    function setOrResetPromptInterval() {
        clearInterval(promptInterval);
        promptInterval = null;
        if (autoPromptEnabled && isScreensaverVisible() && !paused) {
            lastPromptUpdate = Date.now();
            updatePrompt().then(success => {
                if (success) fetchNewImage();
            });
            promptInterval = setInterval(async () => {
                if (!autoPromptEnabled || !isScreensaverVisible() || paused || isFetchingPrompt) {
                    clearInterval(promptInterval);
                    promptInterval = null;
                    return;
                }
                const elapsed = Date.now() - lastPromptUpdate;
                if (elapsed >= PROMPT_UPDATE_INTERVAL) {
                    const success = await updatePrompt();
                    if (success) await fetchNewImage();
                }
            }, 1000);
        }
    }

    function toggleAutoPrompt() {
        autoPromptEnabled = !autoPromptEnabled;
        if (restartPromptButton) {
            restartPromptButton.innerHTML = autoPromptEnabled ? "🔄 Auto-Prompt On" : "🔄 Auto-Prompt Off";
        }
        window.showToast(autoPromptEnabled ? "Auto-prompt enabled" : "Auto-prompt disabled");
        if (autoPromptEnabled) {
            setOrResetPromptInterval();
        } else {
            clearInterval(promptInterval);
            promptInterval = null;
            if (promptInput.value.trim() && isScreensaverVisible()) fetchNewImage();
        }
    }

    function startScreensaver() {
        screensaverActive = true;
        paused = false;
        controlsHidden = false;

        screensaverContainer.style.position = "fixed";
        screensaverContainer.style.top = "0";
        screensaverContainer.style.left = "0";
        screensaverContainer.style.width = "100vw";
        screensaverContainer.style.height = "100vh";
        screensaverContainer.style.zIndex = "9999";
        screensaverContainer.classList.remove("hidden");

        // ensure it can receive keyboard focus
        if (!screensaverContainer.hasAttribute("tabindex")) {
            screensaverContainer.setAttribute("tabindex", "-1");
        }
        // focus so Esc reliably reaches us on hosted pages
        screensaverContainer.focus({ preventScroll: true });

        screensaverImage1.style.opacity = '0';
        screensaverImage2.style.opacity = '0';

        screensaverContainer.style.setProperty('--transition-duration', `${settings.transitionDuration}s`);

        fetchNewImage();
        setOrResetImageInterval();
        setOrResetPromptInterval();

        toggleScreensaverButton.textContent = "Stop Screensaver";
        playPauseButton.innerHTML = "⏸️";
        hideButton.innerHTML = "🙈";
        if (restartPromptButton) restartPromptButton.innerHTML = autoPromptEnabled ? "🔄 Auto-Prompt On" : "🔄 Auto-Prompt Off";

        if (window.speechSynthesis) window.speechSynthesis.cancel();
        document.body.style.overflow = "hidden";
        window.screensaverActive = true;
    }

    function stopScreensaver() {
        screensaverActive = false;
        paused = false;
        controlsHidden = false;
        screensaverContainer.classList.add("hidden");
        clearInterval(imageInterval);
        clearInterval(promptInterval);
        promptInterval = null;

        saveImageHistory();

        document.body.style.overflow = "";
        window.screensaverActive = false;

        toggleScreensaverButton.textContent = "Start Screensaver";
        playPauseButton.innerHTML = "▶️";
        hideButton.innerHTML = "🙈";
        if (restartPromptButton) restartPromptButton.innerHTML = autoPromptEnabled ? "🔄 Auto-Prompt On" : "🔄 Auto-Prompt Off";

        if (isFullscreen) {
            document.exitFullscreen().then(() => {
                isFullscreen = false;
                fullscreenButton.textContent = "⛶";
            }).catch(err => console.error("Error exiting fullscreen on stop:", err));
        }
    }

    function togglePause() {
        paused = !paused;
        playPauseButton.innerHTML = paused ? "▶️" : "⏸️";
        window.showToast(paused ? "Screensaver paused" : "Screensaver resumed");
        if (!paused) {
            setOrResetImageInterval();
            setOrResetPromptInterval();
        }
    }

    function toggleControls() {
        const controls = document.querySelector('.screensaver-controls');
        if (!controls) return;

        controlsHidden = !controlsHidden;
        if (controlsHidden) {
            controls.classList.add('hidden-panel');
            if (thumbnailsWrapper) thumbnailsWrapper.classList.add('hidden-panel');
            hideButton.innerHTML = "🙉";
        } else {
            controls.classList.remove('hidden-panel');
            if (thumbnailsWrapper) thumbnailsWrapper.classList.remove('hidden-panel');
            hideButton.innerHTML = "🙈";
        }
        window.showToast(controlsHidden ? "Controls hidden" : "Controls visible");
    }

    function saveImage() {
        const src = document.getElementById(`screensaver-${currentImage}`).src;
        if (!src) return window.showToast("No image to save");
        fetch(src, { mode: "cors" })
            .then(response => {
                if (!response.ok) throw new Error("Network response was not ok");
                return response.blob();
            })
            .then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `screensaver-image-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                window.showToast("Image download initiated");
            })
            .catch(err => {
                console.error("Error saving image:", err);
                window.showToast("Failed to save image");
            });
    }

    function copyImage() {
        const currentImg = document.getElementById(`screensaver-${currentImage}`);
        if (!currentImg.src) return window.showToast("No image to copy");
        if (!currentImg.complete || currentImg.naturalWidth === 0) {
            return window.showToast("Image not fully loaded yet. Please try again.");
        }
        copyButton.textContent = "📋 Copying...";
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = currentImg.naturalWidth;
        canvas.height = currentImg.naturalHeight;
        ctx.drawImage(currentImg, 0, 0);
        canvas.toBlob(blob => {
            if (!blob) {
                copyButton.textContent = "📋 Copy";
                return window.showToast("Failed to copy image: Unable to create blob.");
            }
            navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
                .then(() => {
                    const dataURL = canvas.toDataURL("image/png");
                    localStorage.setItem("lastCopiedImage", dataURL);
                    copyButton.textContent = "✅ Copied!";
                    window.showToast("Image copied to clipboard and saved to local storage");
                    setTimeout(() => copyButton.textContent = "📋 Copy", 1500);
                })
                .catch(err => {
                    copyButton.textContent = "❌ Failed";
                    window.showToast("Copy failed: " + err.message);
                    setTimeout(() => copyButton.textContent = "📋 Copy", 1500);
                });
        }, "image/png");
    }

    function toggleFullscreen() {
        if (!isScreensaverVisible()) {
            window.showToast("Start the screensaver first!");
            return;
        }
        if (!document.fullscreenElement) {
            screensaverContainer.requestFullscreen()
                .then(() => {
                    isFullscreen = true;
                    fullscreenButton.textContent = "↙";
                    screensaverImage1.style.objectFit = "contain";
                    screensaverImage2.style.objectFit = "contain";
                    screensaverContainer.style.backgroundColor = "#000000";
                    // Keep focus so Esc reaches us
                    screensaverContainer.focus({ preventScroll: true });
                })
                .catch(err => window.showToast("Failed to enter fullscreen: " + err.message));
        } else {
            document.exitFullscreen()
                .then(() => {
                    isFullscreen = false;
                    fullscreenButton.textContent = "⛶";
                    screensaverImage1.style.objectFit = "cover";
                    screensaverImage2.style.objectFit = "cover";
                    screensaverContainer.style.backgroundColor = "#000000";
                })
                .catch(err => window.showToast("Failed to exit fullscreen: " + err.message));
        }
    }

    // Pause prompt fetch while typing
    promptInput.addEventListener('focus', () => {
        clearInterval(promptInterval);
        promptInterval = null;
    });
    promptInput.addEventListener('input', () => {
        settings.prompt = promptInput.value;
    });

    // Settings bindings
    timerInput.addEventListener('change', () => {
        settings.timer = parseInt(timerInput.value) || 30;
        saveScreensaverSettings();
        if (isScreensaverVisible()) setOrResetImageInterval();
    });
    aspectSelect.addEventListener('change', () => {
        settings.aspect = aspectSelect.value;
        saveScreensaverSettings();
    });
    modelSelect.addEventListener('change', () => {
        settings.model = modelSelect.value;
        saveScreensaverSettings();
    });
    enhanceCheckbox.addEventListener('change', () => {
        settings.enhance = enhanceCheckbox.checked;
        saveScreensaverSettings();
    });
    privateCheckbox.addEventListener('change', () => {
        settings.priv = privateCheckbox.checked;
        saveScreensaverSettings();
    });
    transitionDurationInput.addEventListener('change', () => {
        settings.transitionDuration = parseFloat(transitionDurationInput.value) || 1;
        saveScreensaverSettings();
        screensaverContainer.style.setProperty('--transition-duration', `${settings.transitionDuration}s`);
    });

    if (restartPromptButton) {
        restartPromptButton.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleAutoPrompt();
        });
    }

    // Buttons
    toggleScreensaverButton.addEventListener("click", () => {
        isScreensaverVisible() ? stopScreensaver() : startScreensaver();
    });
    fullscreenButton.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFullscreen();
    });
    stopButton.addEventListener("click", (e) => {
        e.stopPropagation();
        stopScreensaver();
    });
    playPauseButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isScreensaverVisible()) togglePause();
        else window.showToast("Start the screensaver first!");
    });
    saveButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isScreensaverVisible()) saveImage();
        else window.showToast("Start the screensaver first!");
    });
    copyButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isScreensaverVisible()) copyImage();
        else window.showToast("Start the screensaver first!");
    });
    hideButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isScreensaverVisible()) toggleControls();
        else window.showToast("Start the screensaver first!");
    });

    // --- Robust ESC handling (hosted pages + inputs + fullscreen) ---
    function handleEscape(e) {
        const isEscape =
            e.key === 'Escape' || e.key === 'Esc' || e.code === 'Escape' || e.keyCode === 27;
        if (!isEscape) return;

        // Only act if the screensaver is actually visible
        if (!isScreensaverVisible()) return;

        // If an interactive element has focus, blur it so Esc isn't consumed there
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) {
            ae.blur();
        }

        // Prevent browser-level behavior (when allowed) and stop others from swallowing it
        try { e.preventDefault(); } catch {}
        try { e.stopImmediatePropagation(); } catch {}
        try { e.stopPropagation(); } catch {}

        toggleControls();
    }

    // Capture-phase listeners so we see Esc before other handlers/UI components
    document.addEventListener('keydown', handleEscape, { capture: true });
    window.addEventListener('keydown', handleEscape, { capture: true });
    // Also bind directly to the container (helps when it has focus)
    if (screensaverContainer) {
        screensaverContainer.addEventListener('keydown', handleEscape, { capture: true });
    }

    // Optional: if user exits fullscreen via Esc, keep behavior sane
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            isFullscreen = false;
            fullscreenButton.textContent = "⛶";
            // Keep focus on container so subsequent Esc presses still reach us
            if (isScreensaverVisible()) screensaverContainer.focus({ preventScroll: true });
        }
    });

    // --- Toast ---
    window.showToast = function(message, duration = 3000) {
        let toast = document.getElementById("toast-notification");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "toast-notification";
            toast.style.position = "fixed";
            toast.style.top = "5%";
            toast.style.left = "50%";
            toast.style.transform = "translateX(-50%)";
            toast.style.backgroundColor = "rgba(0,0,0,0.7)";
            toast.style.color = "white";
            toast.style.padding = "10px 20px";
            toast.style.borderRadius = "5px";
            toast.style.zIndex = "9999";
            toast.style.transition = "opacity 0.3s";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = "1";
        clearTimeout(toast.timeout);
        toast.timeout = setTimeout(() => toast.style.opacity = "0", duration);
    };

    console.log("Screensaver initialized with resilient ESC handling for hosted pages.");
});
