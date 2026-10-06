import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync(resolve('.env'))) loadEnvFile(resolve('.env'));

const processes = ['src/mock-erp.js', 'src/server.js'].map((file) =>
  spawn(process.execPath, [resolve(file)], {
    stdio: 'inherit',
    env: { ...process.env, HOST: '127.0.0.1' },
  }),
);
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) child.kill('SIGTERM');
  Promise.all(
    processes.map((child) =>
      child.exitCode === null
        ? new Promise((resolveExit) => child.once('exit', resolveExit))
        : Promise.resolve(),
    ),
  ).then(() => process.exit(code));
}
for (const child of processes) {
  child.on('error', (error) => {
    console.error(error.message);
    shutdown(1);
  });
  child.on('exit', (code) => {
    if (!shuttingDown) shutdown(code || 1);
  });
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
