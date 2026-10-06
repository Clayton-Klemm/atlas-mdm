import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const flag = process.argv.indexOf('--input');
if (flag < 0 || !process.argv[flag + 1])
  throw new Error(
    'Usage: npm run restore -- --input data/backups/atlas.sqlite. Stop the application first.',
  );
const input = resolve(process.argv[flag + 1]);
const target = resolve(process.env.DB_PATH ?? 'data/atlas.sqlite');
if (input === target || !existsSync(input))
  throw new Error('Provide an existing backup distinct from the live database.');
mkdirSync(dirname(target), { recursive: true });
const source = new DatabaseSync(input, { readOnly: true });
try {
  if (source.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
    throw new Error('Backup integrity failed.');
  if (
    !source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").get()
  )
    throw new Error('Not an Atlas database backup.');
  await backup(source, target);
  console.log(`Restored database: ${target}. Restart the application now.`);
} finally {
  source.close();
}
