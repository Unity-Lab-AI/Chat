import assert from 'assert/strict';
import { trackPlaceholder, _configure, _setImageFn } from '../js/ui/imagePoller.js';

let calls = 0;
_setImageFn(async () => {
    calls++;
    if (calls === 1) return {}; // still pending
    return { url: 'https://example.com/final.png' };
});

_configure({ intervalMs: 5, timeout: 100 });

const img = {
    src: 'about:blank',
    classList: {
        set: new Set(['placeholder']),
        remove(cls) { this.set.delete(cls); },
        contains(cls) { return this.set.has(cls); }
    }
};

trackPlaceholder(img, { prompt: 'test', model: 'foo' });

// wait long enough for two polling cycles
await new Promise(r => setTimeout(r, 30));
await new Promise(r => setTimeout(r, 30));

assert.equal(img.src, 'https://example.com/final.png');
assert.equal(img.classList.contains('placeholder'), false);

console.log('image-poller test passed');
