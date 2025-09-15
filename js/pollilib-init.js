// Configure polliLib default client and expose an explicit client for MCP helpers
(function(){
  try {
    if (window.polliLib) {
      // Derive base referrer from attribute or window location (no path segments)
      const cur = document.currentScript;
      const attrRef = cur && cur.getAttribute('data-referrer');
      let base = window.location.origin;
      if (attrRef) {
        // Support values missing protocol by resolving against window.location.origin
        try { base = new URL(attrRef, window.location.origin).origin; } catch {}
      }
      const referrer = base.endsWith('/') ? base : base + '/';
      window.polliLib.configure({ referrer });
      window.polliClient = window.polliLib.getDefaultClient();

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
    }
  } catch (e) { console.warn('polliLib configure failed', e); }
})();
