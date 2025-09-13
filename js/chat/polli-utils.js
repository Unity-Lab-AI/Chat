(function(global){
  function refreshPolliImage(url, options = {}) {
    if (!url) {
      return { error: 'No image source to refresh.' };
    }
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch {
      return { error: 'Invalid image URL.' };
    }
    if (!global.polliClient || !global.polliClient.imageBase) {
      return { error: 'Image client not ready.' };
    }
    const baseOrigin = new URL(global.polliClient.imageBase).origin;
    if (urlObj.origin !== baseOrigin) {
      return { error: "Can't refresh: not a polliLib image URL." };
    }
    const newSeed = Math.floor(Math.random() * 1000000);
    let prompt = '';
    try {
      const parts = urlObj.pathname.split('/');
      const i = parts.indexOf('prompt');
      if (i >= 0 && parts[i + 1]) prompt = decodeURIComponent(parts[i + 1]);
    } catch {}
    const width = options.width || Number(urlObj.searchParams.get('width')) || 512;
    const height = options.height || Number(urlObj.searchParams.get('height')) || 512;
    const model = options.model || urlObj.searchParams.get('model') || (document.getElementById('model-select')?.value || undefined);
    let newUrl = url;
    try {
      if (global.polliLib && global.polliClient && prompt) {
        newUrl = global.polliLib.mcp.generateImageUrl(global.polliClient, {
          prompt, width, height, seed: newSeed, nologo: true, model
        });
      } else {
        urlObj.searchParams.set('seed', String(newSeed));
        newUrl = urlObj.toString();
      }
    } catch (e) {
      console.warn('polliLib generateImageUrl failed; falling back to seed swap', e);
      urlObj.searchParams.set('seed', String(newSeed));
      newUrl = urlObj.toString();
    }
    const newUrlObj = new URL(newUrl);
    if (!newUrlObj.searchParams.has('referrer') && global.polliClient?.referrer) {
      newUrlObj.searchParams.set('referrer', global.polliClient.referrer);
    }
    return { url: newUrlObj.toString() };
  }
  global.refreshPolliImage = refreshPolliImage;
})(window);
