import { DatabaseSync, backup } from 'node:sqlite';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const sourcePath = resolve(process.env.DB_PATH ?? 'data/atlas.sqlite');
if (!existsSync(sourcePath)) throw new Error('Database does not exist. Run the application first.');
const directory = mkdtempSync(join(tmpdir(), 'atlas-dr-'));
const source = new DatabaseSync(sourcePath, { readOnly: true });
let restored;
try {
  const first = join(directory, 'backup.sqlite');
  await backup(source, first);
  const saved = new DatabaseSync(first, { readOnly: true });
  try {
    await backup(saved, join(directory, 'restored.sqlite'));
  } finally {
    saved.close();
  }
  restored = new DatabaseSync(join(directory, 'restored.sqlite'));
  assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  for (const table of ['products', 'audit_events', 'jobs']) {
    // Compare against the snapshot, so concurrent live changes do not create false failures.
    const snapshot = new DatabaseSync(first, { readOnly: true });
    try {
      assert.deepEqual(
        restored.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
        snapshot.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
      );
    } finally {
      snapshot.close();
    }
  }
  console.log(
    'DR rehearsal passed: consistent snapshot restored; products, audit events, and integration jobs match.',
  );
} finally {
  restored?.close();
  source.close();
  // Only remove the exact directory returned by mkdtemp under the OS temporary directory.
  rmSync(directory, { recursive: true, force: true });
}
