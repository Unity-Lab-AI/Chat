import { image as polliImage } from '../polliLib/src/image.js';

let imageFn = polliImage;
let pollIntervalMs = 2000;
let timeoutMs = 20000;
let fallbackSrc = 'https://via.placeholder.com/512?text=Image+Unavailable';

const pending = new Map();
let timer = null;

export function trackPlaceholder(img, { prompt, model, width, height } = {}) {
    if (!img) return;
    pending.set(img, { prompt, model, width, height, start: Date.now() });
    if (!timer) {
        timer = setInterval(() => {
            checkPending().catch(() => {});
        }, pollIntervalMs);
    }
}

async function checkPending() {
    for (const [img, info] of pending) {
        if (Date.now() - info.start > timeoutMs) {
            img.src = fallbackSrc;
            img.classList?.remove?.('placeholder');
            pending.delete(img);
            continue;
        }
        try {
            const data = await imageFn(info.prompt, { model: info.model, width: info.width, height: info.height, json: true });
            if (data && data.url) {
                img.src = data.url;
                img.classList?.remove?.('placeholder');
                pending.delete(img);
            }
        } catch (err) {
            img.src = fallbackSrc;
            img.classList?.remove?.('placeholder');
            pending.delete(img);
        }
    }
    if (pending.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
    }
}

export function _setImageFn(fn) {
    imageFn = fn;
}

export function _configure({ intervalMs, timeout, fallback } = {}) {
    if (intervalMs != null) pollIntervalMs = intervalMs;
    if (timeout != null) timeoutMs = timeout;
    if (fallback != null) fallbackSrc = fallback;
    if (timer) {
        clearInterval(timer);
        timer = setInterval(() => {
            checkPending().catch(() => {});
        }, pollIntervalMs);
    }
}
