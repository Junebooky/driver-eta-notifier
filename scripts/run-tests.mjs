import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync('utils').filter(f => f.endsWith('.test.ts')).sort();
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--require', './scripts/test-safety.cjs', '--import', 'tsx', `utils/${file}`], { encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) { failures++; console.error(`FAIL ${file}\n${result.stdout}\n${result.stderr}`); }
  else console.log(`PASS ${file}`);
}
console.log(`${files.length - failures}/${files.length} test files passed`);
process.exitCode = failures ? 1 : 0;
