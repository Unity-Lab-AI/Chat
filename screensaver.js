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
  let currentImage = "image1";
  let controlsHidden = false;
  let isTransitioning = false;
  let autoPromptEnabled = true;
  let isFetchingPrompt = false;
  let lastPromptUpdate = 0;

  const MAX_HISTORY = 10;
  const EMPTY_THUMBNAIL = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
  const PROMPT_UPDATE_INTERVAL = 20000;

  // --- Settings ---
  let settings = {
    prompt: "",
    timer: 30,
    aspect: "widescreen",
    model: "",
    enhance: true,
    priv: true,
    transitionDuration: 1
  };

  // Titles (tooltips)
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

  // ---------- Helpers ----------
  function showToast(message, duration = 3000) {
    let toast = document.getElementById("toast-notification");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast-notification";
      toast.style.position = "fixed";
      toast.style.top = "5%";
      toast.style.left = "50%";
      toast.style.transform = "translateX(-50%)";
      toast.style.background = "rgba(0,0,0,0.7)";
      toast.style.color = "#fff";
      toast.style.padding = "10px 20px";
      toast.style.borderRadius = "6px";
      toast.style.zIndex = "99999";
      toast.style.transition = "opacity 0.25s";
      toast.style.opacity = "0";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = "1";
    clearTimeout(toast.__t);
    toast.__t = setTimeout(() => (toast.style.opacity = "0"), duration);
  }
  window.showToast = showToast;

  function saveScreensaverSettings() {
    try {
      localStorage.setItem("screensaverSettings", JSON.stringify(settings));
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  }

  function loadScreensaverSettings() {
    const raw = localStorage.getItem("screensaverSettings");
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      settings.prompt = ""; // start clean
      settings.timer = s.timer || 30;
      settings.aspect = s.aspect || "widescreen";
      settings.model = s.model || "";
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

  function saveImageHistory() {
    try {
      localStorage.setItem("imageHistory", JSON.stringify(imageHistory));
      localStorage.setItem("promptHistory", JSON.stringify(promptHistory));
    } catch (err) {
      console.error("Failed to save image history:", err);
    }
  }

  function loadImageHistory() {
    try {
      imageHistory = JSON.parse(localStorage.getItem("imageHistory") || "[]");
      promptHistory = JSON.parse(localStorage.getItem("promptHistory") || "[]");
    } catch {
      imageHistory = [];
      promptHistory = [];
    }
    updateThumbnailHistory();
  }

  loadScreensaverSettings();
  loadImageHistory();

  if (thumbLeftButton && thumbRightButton && thumbnailsContainer) {
    thumbLeftButton.addEventListener("click", () => {
      thumbnailsContainer.scrollBy({ left: -thumbnailsContainer.clientWidth, behavior: "smooth" });
    });
    thumbRightButton.addEventListener("click", () => {
      thumbnailsContainer.scrollBy({ left: thumbnailsContainer.clientWidth, behavior: "smooth" });
    });
  }

  // fetch wrapper: prefer pollinationsFetch, fall back to fetch
  async function fetchJSON(url, init) {
    const impl = typeof window.pollinationsFetch === "function" ? window.pollinationsFetch : fetch;
    const res = await impl(url, init);
    return res.json();
  }

  async function fetchImageModels() {
    try {
      const models = await fetchJSON("https://image.pollinations.ai/models", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store"
      });
      if (!Array.isArray(models) || models.length === 0) return;
      modelSelect.innerHTML = "";
      for (const name of models) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        modelSelect.appendChild(opt);
      }
      if (settings.model && models.includes(settings.model)) {
        modelSelect.value = settings.model;
      } else {
        settings.model = models[0];
        modelSelect.value = settings.model;
      }
    } catch (err) {
      console.warn("Failed to fetch image models (non-fatal):", err);
    }
  }
  // Don’t let this block init of controls/keyboard:
  setTimeout(fetchImageModels, 0);

  function generateSeed() {
    return Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
  }

  function getDimensions(aspect) {
    switch (aspect) {
      case "widescreen": return { width: 1920, height: 1080 };
      case "square": return { width: 1024, height: 1024 };
      case "portrait": return { width: 1080, height: 1920 };
      default: return { width: 1920, height: 1080 };
    }
  }

  function preloadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => reject(new Error("Image failed to load"));
      img.src = url;
    });
  }

  async function fetchDynamicPrompt() {
    const metaPrompt =
      "Generate exactly one short ~125-char thrilling art prompt (text only). Dark, psychological, cinematic.";
    const textModel = document.getElementById("model-select")?.value || "openai";
    const seed = generateSeed();
    try {
      const data = await fetchJSON("https://text.pollinations.ai/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          model: textModel,
          seed,
          messages: [{ role: "user", content: metaPrompt }]
        })
      });
      const generatedPrompt = data?.choices?.[0]?.message?.content?.trim();
      if (!generatedPrompt) throw new Error("No prompt returned");
      return generatedPrompt;
    } catch (err) {
      console.error("Dynamic prompt failed:", err);
      throw err;
    }
  }

  async function updatePrompt() {
    if (!screensaverActive || paused || !autoPromptEnabled || isFetchingPrompt) return false;
    isFetchingPrompt = true;
    try {
      const newPrompt = await fetchDynamicPrompt();
      promptInput.value = newPrompt;
      settings.prompt = newPrompt;
      saveScreensaverSettings();
      showToast("New prompt loaded");
      lastPromptUpdate = Date.now();
      return true;
    } catch {
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
      const ok = await updatePrompt();
      if (ok) prompt = promptInput.value.trim();
      if (!prompt) { isTransitioning = false; return; }
    }

    const { width, height } = getDimensions(settings.aspect);
    const seed = generateSeed();
    const model = settings.model || modelSelect.value;
    const enhance = settings.enhance;
    const priv = settings.priv;

    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=${width}&height=${height}&seed=${seed}` +
      `&model=${encodeURIComponent(model)}` +
      `&nologo=true&private=${priv}&enhance=${enhance}&referrer=github_pages`;

    const nextImage = currentImage === "image1" ? "image2" : "image1";
    const nextImg = document.getElementById(`screensaver-${nextImage}`);
    const curImg = document.getElementById(`screensaver-${currentImage}`);

    let imageAdded = false;

    function commitSwap() {
      nextImg.style.opacity = "1";
      curImg.style.opacity = "0";
      currentImage = nextImage;
      if (!imageAdded) {
        addToHistory(nextImg.src, prompt);
        imageAdded = true;
      }
    }

    nextImg.onload = () => { commitSwap(); isTransitioning = false; };
    nextImg.onerror = () => {
      nextImg.src = "https://via.placeholder.com/512?text=Image+Failed";
      nextImg.onload = () => { commitSwap(); isTransitioning = false; };
      nextImg.onerror = () => { isTransitioning = false; };
    };

    try {
      await preloadImage(url);
      nextImg.src = url;
    } catch {
      nextImg.src = "https://via.placeholder.com/512?text=Image+Failed";
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
    const container = document.getElementById("screensaver-thumbnails");
    if (!container) return;
    const slots = container.querySelectorAll("img.thumbnail");
    slots.forEach((thumb, i) => {
      const imageUrl = imageHistory[i];
      thumb.onclick = null;
      thumb.classList.remove("selected", "placeholder");
      if (imageUrl) {
        thumb.src = imageUrl;
        thumb.title = promptHistory[i] || "";
        thumb.onclick = () => showHistoricalImage(i);
        const curSrc = document.getElementById(`screensaver-${currentImage}`).src;
        if (imageUrl === curSrc) thumb.classList.add("selected");
      } else {
        thumb.src = EMPTY_THUMBNAIL;
        thumb.title = "";
        thumb.classList.add("placeholder");
      }
    });
    // keep scrolled to latest
    container.scrollTo({ left: container.scrollWidth, behavior: "smooth" });
  }

  function showHistoricalImage(index) {
    const imageUrl = imageHistory[index];
    const curImg = document.getElementById(`screensaver-${currentImage}`);
    const nextImage = currentImage === "image1" ? "image2" : "image1";
    const nextImg = document.getElementById(`screensaver-${nextImage}`);

    curImg.style.opacity = "0";
    nextImg.onload = () => {
      nextImg.style.opacity = "1";
      currentImage = nextImage;
      updateThumbnailHistory();
    };
    nextImg.onerror = () => {
      nextImg.src = "https://via.placeholder.com/512?text=Image+Failed";
      nextImg.style.opacity = "1";
      currentImage = nextImage;
      updateThumbnailHistory();
    };
    nextImg.src = imageUrl;

    // resume generation loop
    setOrResetImageInterval();
  }

  function setOrResetImageInterval() {
    clearInterval(imageInterval);
    imageInterval = setInterval(() => {
      if (!paused && screensaverActive) fetchNewImage();
    }, settings.timer * 1000);
  }

  function setOrResetPromptInterval() {
    clearInterval(promptInterval);
    promptInterval = null;
    if (autoPromptEnabled && screensaverActive && !paused) {
      lastPromptUpdate = Date.now();
      updatePrompt().then(ok => { if (ok) fetchNewImage(); });
      promptInterval = setInterval(async () => {
        if (!autoPromptEnabled || !screensaverActive || paused || isFetchingPrompt) {
          clearInterval(promptInterval);
          promptInterval = null;
          return;
        }
        const now = Date.now();
        if (now - lastPromptUpdate >= PROMPT_UPDATE_INTERVAL) {
          const ok = await updatePrompt();
          if (ok) await fetchNewImage();
        }
      }, 1000);
    }
  }

  function toggleAutoPrompt() {
    autoPromptEnabled = !autoPromptEnabled;
    if (restartPromptButton) {
      restartPromptButton.innerHTML = autoPromptEnabled ? "🔄 Auto-Prompt On" : "🔄 Auto-Prompt Off";
    }
    showToast(autoPromptEnabled ? "Auto-prompt on" : "Auto-prompt off");
    if (autoPromptEnabled) {
      setOrResetPromptInterval();
    } else {
      clearInterval(promptInterval);
      promptInterval = null;
      if (promptInput.value.trim() && screensaverActive) fetchNewImage();
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

    screensaverImage1.style.opacity = "0";
    screensaverImage2.style.opacity = "0";

    screensaverContainer.style.setProperty("--transition-duration", `${settings.transitionDuration}s`);

    fetchNewImage();
    setOrResetImageInterval();
    setOrResetPromptInterval();

    toggleScreensaverButton.textContent = "Stop Screensaver";
    playPauseButton.innerHTML = "⏸️";
    hideButton.innerHTML = "🙈";

    if (restartPromptButton) {
      restartPromptButton.innerHTML = autoPromptEnabled ? "🔄 Auto-Prompt On" : "🔄 Auto-Prompt Off";
    }

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    document.body.style.overflow = "hidden";
    window.screensaverActive = true;

    ensureRevealHandle(); // make sure our safety handle exists
    revealHandle.style.display = "none"; // hidden until controls are hidden
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
      document.exitFullscreen().catch(() => {}).finally(() => {
        isFullscreen = false;
        fullscreenButton.textContent = "⛶";
      });
    }

    if (revealHandle) revealHandle.style.display = "none";
  }

  function togglePause() {
    paused = !paused;
    playPauseButton.innerHTML = paused ? "▶️" : "⏸️";
    showToast(paused ? "Paused" : "Resumed");
    if (!paused) {
      setOrResetImageInterval();
      setOrResetPromptInterval();
    }
  }

  function toggleControls() {
    controlsHidden = !controlsHidden;
    const controls = document.querySelector(".screensaver-controls");
    if (controls) {
      controls.classList.toggle("hidden-panel", controlsHidden);
    }
    if (thumbnailsWrapper) {
      thumbnailsWrapper.classList.toggle("hidden-panel", controlsHidden);
    }
    hideButton.innerHTML = controlsHidden ? "🙉" : "🙈";
    screensaverContainer.classList.toggle("controls-hidden", controlsHidden);

    // Safety handle visibility
    if (revealHandle) revealHandle.style.display = controlsHidden ? "flex" : "none";

    showToast(controlsHidden ? "Controls hidden" : "Controls visible");
  }

  function saveImage() {
    const cur = document.getElementById(`screensaver-${currentImage}`);
    if (!cur?.src) return showToast("No image to save");
    fetch(cur.src, { mode: "cors" })
      .then(r => { if (!r.ok) throw new Error("Network error"); return r.blob(); })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `screensaver-image-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast("Download started");
      })
      .catch(err => {
        console.error("Save failed:", err);
        showToast("Failed to save image");
      });
  }

  function copyImage() {
    const cur = document.getElementById(`screensaver-${currentImage}`);
    if (!cur?.src) return showToast("No image to copy");
    if (!cur.complete || cur.naturalWidth === 0) return showToast("Image not loaded yet");

    copyButton.textContent = "📋 Copying...";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = cur.naturalWidth;
    canvas.height = cur.naturalHeight;
    ctx.drawImage(cur, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) {
        copyButton.textContent = "📋 Copy";
        return showToast("Copy failed");
      }
      navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
        .then(() => {
          copyButton.textContent = "✅ Copied!";
          setTimeout(() => (copyButton.textContent = "📋 Copy"), 1500);
        })
        .catch(err => {
          console.warn("Clipboard write failed (HTTPS required):", err);
          copyButton.textContent = "❌ Failed";
          setTimeout(() => (copyButton.textContent = "📋 Copy"), 1500);
        });
    }, "image/png");
  }

  function toggleFullscreen() {
    if (!screensaverActive) return showToast("Start the screensaver first!");
    if (!document.fullscreenElement) {
      screensaverContainer.requestFullscreen()
        .then(() => {
          isFullscreen = true;
          fullscreenButton.textContent = "↙";
          screensaverImage1.style.objectFit = "contain";
          screensaverImage2.style.objectFit = "contain";
          screensaverContainer.style.backgroundColor = "#000";
        })
        .catch(err => showToast("Failed to enter fullscreen: " + err.message));
    } else {
      document.exitFullscreen()
        .then(() => {
          isFullscreen = false;
          fullscreenButton.textContent = "⛶";
          screensaverImage1.style.objectFit = "cover";
          screensaverImage2.style.objectFit = "cover";
          screensaverContainer.style.backgroundColor = "#000";
        })
        .catch(err => showToast("Failed to exit fullscreen: " + err.message));
    }
  }

  // --- Input events ---
  promptInput.addEventListener("focus", () => {
    clearInterval(promptInterval);
    promptInterval = null;
  });
  promptInput.addEventListener("input", () => {
    settings.prompt = promptInput.value;
  });
  timerInput.addEventListener("change", () => {
    settings.timer = parseInt(timerInput.value) || 30;
    saveScreensaverSettings();
    if (screensaverActive) setOrResetImageInterval();
  });
  aspectSelect.addEventListener("change", () => {
    settings.aspect = aspectSelect.value;
    saveScreensaverSettings();
  });
  modelSelect.addEventListener("change", () => {
    settings.model = modelSelect.value;
    saveScreensaverSettings();
  });
  enhanceCheckbox.addEventListener("change", () => {
    settings.enhance = enhanceCheckbox.checked;
    saveScreensaverSettings();
  });
  privateCheckbox.addEventListener("change", () => {
    settings.priv = privateCheckbox.checked;
    saveScreensaverSettings();
  });
  transitionDurationInput.addEventListener("change", () => {
    settings.transitionDuration = parseFloat(transitionDurationInput.value) || 1;
    saveScreensaverSettings();
    screensaverContainer.style.setProperty("--transition-duration", `${settings.transitionDuration}s`);
  });
  if (restartPromptButton) {
    restartPromptButton.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleAutoPrompt();
    });
  }

  // --- Buttons ---
  toggleScreensaverButton.addEventListener("click", () => {
    screensaverActive ? stopScreensaver() : startScreensaver();
  });
  fullscreenButton.addEventListener("click", (e) => { e.stopPropagation(); toggleFullscreen(); });
  stopButton.addEventListener("click", (e) => { e.stopPropagation(); stopScreensaver(); });
  playPauseButton.addEventListener("click", (e) => {
    e.stopPropagation();
    if (screensaverActive) togglePause(); else showToast("Start the screensaver first!");
  });
  saveButton.addEventListener("click", (e) => {
    e.stopPropagation();
    if (screensaverActive) saveImage(); else showToast("Start the screensaver first!");
  });
  copyButton.addEventListener("click", (e) => {
    e.stopPropagation();
    if (screensaverActive) copyImage(); else showToast("Start the screensaver first!");
  });
  hideButton.addEventListener("click", (e) => {
    e.stopPropagation();
    if (screensaverActive) toggleControls(); else showToast("Start the screensaver first!");
  });

  // --- Esc toggle (robust) ---
  function isTypingTarget(el) {
    return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  }
  function escHandler(e) {
    const isEscape = e.key === "Escape" || e.key === "Esc" || e.keyCode === 27;
    if (!isEscape) return;
    if (!screensaverActive) return;
    if (isTypingTarget(e.target)) return; // don’t fight with typing
    e.preventDefault();
    e.stopPropagation();
    toggleControls();
  }
  // bind on both; hosted pages sometimes differ on which gets it first
  window.addEventListener("keydown", escHandler, { passive: false });
  document.addEventListener("keydown", escHandler, { passive: false });

  // --- Reveal handle: always-available click to unhide ---
  let revealHandle = null;
  function ensureRevealHandle() {
    if (revealHandle) return;
    revealHandle = document.createElement("button");
    revealHandle.id = "screensaver-reveal-handle";
    revealHandle.setAttribute("aria-label", "Show controls");
    revealHandle.style.position = "fixed";
    revealHandle.style.top = "10px";
    revealHandle.style.left = "10px";
    revealHandle.style.width = "28px";
    revealHandle.style.height = "28px";
    revealHandle.style.borderRadius = "50%";
    revealHandle.style.border = "1px solid rgba(255,255,255,0.6)";
    revealHandle.style.background = "rgba(0,0,0,0.35)";
    revealHandle.style.backdropFilter = "blur(4px)";
    revealHandle.style.display = "none";          // only visible when controls are hidden
    revealHandle.style.alignItems = "center";
    revealHandle.style.justifyContent = "center";
    revealHandle.style.zIndex = "100000";
    revealHandle.style.cursor = "pointer";
    revealHandle.textContent = "⋮";
    revealHandle.title = "Show controls (or press Esc)";
    revealHandle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (screensaverActive && controlsHidden) toggleControls();
    });
    document.body.appendChild(revealHandle);
  }

  // --- Initialize ---
  console.log("Screensaver JS ready");
});
