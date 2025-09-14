import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const files = (await fs.readdir(__dirname))
  .filter(f => f.endsWith('.mjs') && f !== 'run-all.mjs');

const groups = { pollilib: [], site: [] };
for (const f of files) {
  if (f.startsWith('pollilib-')) groups.pollilib.push(f);
  else if (f.startsWith('site-')) groups.site.push(f);
}

async function run(file) {
  return new Promise(resolve => {
    const proc = spawn(process.argv[0], [path.join(__dirname, file)], { stdio: 'inherit' });
    proc.on('close', code => resolve({ file, ok: code === 0 }));
  });
}

async function runGroup(list) {
  const out = [];
  for (const f of list) out.push(await run(f));
  return out;
}

const groupResults = {};
for (const [name, list] of Object.entries(groups)) {
  groupResults[name] = await runGroup(list);
}
const results = Object.values(groupResults).flat();
const passed = results.filter(r => r.ok).length;
const total = results.length;
const ratio = total === 0 ? 1 : passed / total;
let status = 'fail';
if (ratio >= 0.8) status = 'pass';
else if (ratio >= 0.5) status = 'partial';
const summary = {
  passed,
  total,
  ratio,
  status,
  groups: Object.fromEntries(
    Object.entries(groupResults).map(([k, v]) => [k, {
      passed: v.filter(r => r.ok).length,
      total: v.length
    }])
  )
};
await fs.writeFile(path.join(__dirname, 'test-results.json'), JSON.stringify(summary, null, 2));
if (status === 'fail') process.exit(1);
