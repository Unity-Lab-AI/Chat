import fs from 'fs/promises';
import path from 'path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const files = await fs.readdir(dir);
for (const file of files) {
  if (file.endsWith('.mjs') && !['run-all.mjs','_helpers.mjs'].includes(file)) {
    console.log('Running', file);
    await import(`./${file}`);
  }
}
console.log('All test scripts executed');
