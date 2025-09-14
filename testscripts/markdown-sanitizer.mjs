import assert from 'node:assert/strict';
import { sanitizeMarkdown } from '../js/chat/markdown-sanitizer.js';

const md = 'Hello\n```image\na\n```\n```code\nx\n```';
const res = sanitizeMarkdown(md);
assert.ok(!res.includes('image'));
assert.ok(res.includes('```code')); 
