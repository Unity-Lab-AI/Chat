export function repairJson(raw) {
    if (typeof raw !== 'string') return { text: '' };
    let text = raw.trim();
    if (!text) return { text: '' };
    const attempts = [];
    attempts.push(text);
    // Attempt: replace single quotes with double quotes
    attempts.push(text.replace(/'/g, '"'));
    // Attempt: quote unquoted keys, replace single quotes, remove trailing commas
    attempts.push(
        text
            .replace(/([,{]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
            .replace(/'/g, '"')
            .replace(/,\s*([}\]])/g, '$1')
    );
    for (const str of attempts) {
        try {
            return JSON.parse(str);
        } catch {}
    }
    // Fallback: treat as plain text
    return { text };
}

if (typeof window !== 'undefined') {
    window.repairJson = repairJson;
}
