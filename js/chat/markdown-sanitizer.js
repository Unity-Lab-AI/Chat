export const defaultBlockedFenceTypes = ['image', 'audio', 'ui'];

export function sanitizeMarkdown(content, blocked = defaultBlockedFenceTypes) {
  if (!content) return '';
  const pattern = /```(\w+)\n[\s\S]*?```/g;
  return content.replace(pattern, (match, type) => {
    return blocked.includes(type.toLowerCase()) ? '' : match;
  });
}

if (typeof window !== 'undefined') {
  window.sanitizeMarkdown = sanitizeMarkdown;
  if (!window.blockedFenceTypes) {
    window.blockedFenceTypes = [...defaultBlockedFenceTypes];
  }
}
