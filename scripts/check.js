import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const files = ['src', 'scripts', 'test', 'public', 'e2e'].flatMap((dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => resolve(dir, name)),
);
files.push(resolve('playwright.config.js'));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax verified: ${files.length} JavaScript files.`);
