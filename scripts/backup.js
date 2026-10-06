import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source = resolve(process.env.DB_PATH ?? 'data/atlas.sqlite');
const flag = process.argv.indexOf('--output');
const output = resolve(flag >= 0 ? process.argv[flag + 1] : 'data/backups/atlas.sqlite');
if (!existsSync(source)) throw new Error('Database does not exist. Run the application first.');
if (source === output) throw new Error('Backup must have a different path from the live database.');
mkdirSync(dirname(output), { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, output);
  console.log(`Consistent SQLite backup created: ${output}`);
} finally {
  db.close();
}
