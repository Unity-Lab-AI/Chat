// Configure polliLib default client and expose an explicit client for MCP helpers
(function(){
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  async function waitForPolliLib({ timeoutMs = 10000, intervalMs = 75 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.polliLib && typeof window.polliLib.modelCapabilities === 'function') {
        return window.polliLib;
      }
      await sleep(intervalMs);
    }
    throw new Error('polliLib not loaded');
  }

  const polliLibReadyPromise = (async () => {
    const polliLib = await waitForPolliLib();
    try {
      // Derive base referrer from attribute or window location (no path segments)
      const cur = document.currentScript;
      const attrRef = cur && cur.getAttribute('data-referrer');
      let base = window.location.origin;
      if (attrRef) {
        // Support values missing protocol by resolving against window.location.origin
        try { base = new URL(attrRef, window.location.origin).origin; } catch {}
      }
      const referrer = base.endsWith('/') ? base : base + '/';
      polliLib.configure({ referrer });

      const defaultClient = typeof polliLib.getDefaultClient === 'function'
        ? polliLib.getDefaultClient()
        : new polliLib.PolliClientWeb({ referrer });

      const token = typeof window !== 'undefined'
        ? (window.POLLINATIONS_TOKEN || null)
        : null;

      const pollinationsOrigins = new Set();
      const maybeAddOrigin = (value) => {
        if (!value) return;
        try {
          const origin = new URL(value, window.location.origin).origin;
          pollinationsOrigins.add(origin);
        } catch {}
      };

      maybeAddOrigin(defaultClient?.imageBase);
      maybeAddOrigin(defaultClient?.textBase);

      const ensureAuthHeaders = (headers = {}) => {
        if (!token) return headers;
        const next = { ...headers };
        if (!next.Authorization) next.Authorization = `Bearer ${token}`;
        return next;
      };

      const shouldAugment = (url) => {
        if (!url) return false;
        try {
          const target = new URL(url, window.location.origin);
          return pollinationsOrigins.has(target.origin);
        } catch {
          return false;
        }
      };

      const ensureUrlAuth = (url) => {
        if (!url || (!token && !referrer)) return url;
        if (!shouldAugment(url)) return url;
        try {
          const target = new URL(url);
          if (referrer && !target.searchParams.has('referrer')) {
            target.searchParams.set('referrer', referrer);
          }
          if (token && !target.searchParams.has('token')) {
            target.searchParams.set('token', token);
          }
          return target.toString();
        } catch {
          return url;
        }
      };

      if (defaultClient && token) {
        const originalGet = defaultClient.get?.bind(defaultClient);
        if (originalGet) {
          defaultClient.get = async function patchedGet(url, options = {}) {
            if (!shouldAugment(url)) {
              return originalGet(url, options);
            }
            const nextOptions = { ...options };
            nextOptions.headers = ensureAuthHeaders(options.headers);
            const params = { ...(options.params || {}) };
            if (token && params.token == null) params.token = token;
            nextOptions.params = params;
            return originalGet(url, nextOptions);
          };
        }
        const originalPostJson = defaultClient.postJson?.bind(defaultClient);
        if (originalPostJson) {
          defaultClient.postJson = async function patchedPostJson(url, body, options = {}) {
            if (!shouldAugment(url)) {
              return originalPostJson(url, body, options);
            }
            const payload = { ...(body || {}) };
            if (token && payload.token == null) payload.token = token;
            const nextOptions = { ...options };
            nextOptions.headers = ensureAuthHeaders(options.headers);
            return originalPostJson(url, payload, nextOptions);
          };
        }
      }

      if (typeof polliLib.image === 'function') {
        const originalImage = polliLib.image.bind(polliLib);
        polliLib.image = async function patchedImage(prompt, opts, client) {
          const result = await originalImage(prompt, opts, client);
          if (result && typeof result === 'object' && !('arrayBuffer' in result)) {
            if ('url' in result && result.url) {
              result.url = ensureUrlAuth(result.url);
            }
          }
          return result;
        };
      }

      if (polliLib?.mcp?.generateImageUrl) {
        const originalGenerateImageUrl = polliLib.mcp.generateImageUrl.bind(polliLib.mcp);
        polliLib.mcp.generateImageUrl = function patchedGenerateImageUrl(client, params = {}) {
          const payload = { ...(params || {}) };
          if (token && payload.token == null) payload.token = token;
          if (referrer && payload.referrer == null) payload.referrer = referrer;
          const rawUrl = originalGenerateImageUrl(client || defaultClient, payload);
          return ensureUrlAuth(rawUrl);
        };
      }

      window.polliClient = defaultClient;
      window.ensurePollinationsUrlAuth = ensureUrlAuth;

      // Provide basic helpers used by image features
      if (!window.randomSeed) {
        window.randomSeed = function randomSeed() { return Math.floor(Math.random() * 1000000); };
      }
      if (!window.imagePatterns) {
        window.imagePatterns = [
          { pattern: /```image\n([\s\S]*?)\n```/i, group: 1 },
        ];
      }
      if (!window.audioPatterns) {
        window.audioPatterns = [
          { pattern: /```audio\n([\s\S]*?)\n```/i, group: 1 },
        ];
      }
      if (!window.uiPatterns) {
        window.uiPatterns = [
          { pattern: /```ui\n([\s\S]*?)\n```/i, group: 1 },
        ];
      }
      if (!window.voicePatterns) {
        window.voicePatterns = [
          { pattern: /```voice\n([\s\S]*?)\n```/i, group: 1 },
        ];
      }
      if (!window.videoPatterns) {
        window.videoPatterns = [
          { pattern: /```video\n([\s\S]*?)\n```/i, group: 1 },
        ];
      }
    } catch (e) {
      console.warn('polliLib configure failed', e);
    }
    return polliLib;
  })();

  window.polliLibReady = polliLibReadyPromise;
  window.awaitPolliLib = function awaitPolliLib(options = {}) {
    if (options && (options.timeoutMs != null || options.intervalMs != null)) {
      return waitForPolliLib(options);
    }
    return polliLibReadyPromise;
  };

  polliLibReadyPromise.catch(err => console.warn('polliLib failed to initialize', err));
})();
