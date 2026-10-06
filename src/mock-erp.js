import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HttpError, json, jsonBody } from './http.js';

export function createMockERP({
  path = ':memory:',
  token = 'atlas-local-demo-token',
  demoMode = true,
} = {}) {
  if (!demoMode && (token === 'atlas-local-demo-token' || token.length < 32))
    throw new Error('Without DEMO_MODE, set a unique ERP_TOKEN with at least 32 characters.');
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS materials (sku TEXT PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL, received_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS receipts (key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, response TEXT NOT NULL);
  `);
  let failNext = 0;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://erp');
      if (req.method === 'GET' && url.pathname === '/health/live')
        return json(res, 200, { status: 'ok' });
      if (req.headers.authorization !== `Bearer ${token}`)
        throw new HttpError(401, 'UNAUTHORIZED', 'An internal integration credential is required.');
      if (req.method === 'GET' && url.pathname === '/materials') {
        return json(res, 200, {
          data: db
            .prepare('SELECT payload, received_at FROM materials ORDER BY sku')
            .all()
            .map((row) => ({ ...JSON.parse(row.payload), receivedAt: row.received_at })),
        });
      }
      if (req.method === 'POST' && url.pathname === '/control') {
        if (!demoMode) throw new HttpError(404, 'NOT_FOUND', 'Demo controls are disabled.');
        const body = await jsonBody(req);
        if (!Number.isInteger(body.failNext) || body.failNext < 0 || body.failNext > 5)
          throw new HttpError(422, 'INVALID_CONTROL', 'failNext must be an integer from 0 to 5.');
        failNext = body.failNext;
        return json(res, 200, { data: { failNext } });
      }
      if (req.method === 'POST' && url.pathname === '/materials') {
        const key = req.headers['idempotency-key'];
        if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(key))
          throw new HttpError(422, 'IDEMPOTENCY_KEY', 'A valid Idempotency-Key is required.');
        const material = await jsonBody(req);
        if (
          typeof material.MATNR !== 'string' ||
          !/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(material.MATNR) ||
          typeof material.MAKTX !== 'string' ||
          !material.MAKTX.trim() ||
          material.MAKTX.length > 240 ||
          !['EA', 'FT', 'M'].includes(material.MEINS) ||
          !['CIRCUIT_BREAKERS', 'WIRE_CABLE', 'LIGHTING'].includes(material.MATKL) ||
          typeof material.MFRNR !== 'string' ||
          !material.MFRNR.trim() ||
          typeof material.MFRPN !== 'string' ||
          !material.MFRPN.trim() ||
          (material.VOLTAGE !== null &&
            (!Number.isFinite(material.VOLTAGE) ||
              material.VOLTAGE <= 0 ||
              material.VOLTAGE > 100000)) ||
          (['LIGHTING', 'CIRCUIT_BREAKERS'].includes(material.MATKL) &&
            material.VOLTAGE === null) ||
          typeof material.GTIN !== 'string' ||
          (material.GTIN !== '' && !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(material.GTIN)) ||
          !Number.isInteger(material.sourceVersion) ||
          material.sourceVersion < 1
        )
          throw new HttpError(
            422,
            'INVALID_MATERIAL',
            'Material mapping is incomplete or invalid.',
          );
        const payload = JSON.stringify(material);
        const hash = createHash('sha256').update(payload).digest('hex');
        const receipt = db.prepare('SELECT * FROM receipts WHERE key = ?').get(key);
        if (receipt) {
          if (receipt.payload_hash !== hash)
            throw new HttpError(
              409,
              'KEY_REUSED',
              'Idempotency key was already used for another payload.',
            );
          return json(res, 200, { data: JSON.parse(receipt.response) });
        }
        if (failNext > 0) {
          failNext--;
          throw new HttpError(503, 'SIMULATED_OUTAGE', 'A demo outage was requested.');
        }
        const previous = db
          .prepare('SELECT version FROM materials WHERE sku = ?')
          .get(material.MATNR);
        const now = new Date().toISOString();
        const result = {
          MATNR: material.MATNR,
          sourceVersion: material.sourceVersion,
          idempotencyKey: key,
          stale: Boolean(previous && previous.version >= material.sourceVersion),
          receivedAt: now,
        };
        db.exec('BEGIN IMMEDIATE');
        try {
          if (!result.stale)
            db.prepare(
              `INSERT INTO materials VALUES (?, ?, ?, ?)
            ON CONFLICT(sku) DO UPDATE SET version = excluded.version, payload = excluded.payload, received_at = excluded.received_at`,
            ).run(material.MATNR, material.sourceVersion, payload, now);
          db.prepare('INSERT INTO receipts VALUES (?, ?, ?)').run(
            key,
            hash,
            JSON.stringify(result),
          );
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
        return json(res, 200, { data: result });
      }
      throw new HttpError(404, 'NOT_FOUND', 'Endpoint not found.');
    } catch (error) {
      json(res, error.status ?? 500, {
        error: {
          code: error.code ?? 'INTERNAL_ERROR',
          message: error.status ? error.message : 'Internal ERP error.',
        },
      });
    }
  });
  server.requestTimeout = 10000;
  return {
    server,
    db,
    close: async () => {
      await new Promise((resolveClose) => server.close(resolveClose));
      db.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = createMockERP({
    path: process.env.ERP_DB_PATH ?? 'data/erp.sqlite',
    token: process.env.ERP_TOKEN ?? 'atlas-local-demo-token',
    demoMode: process.env.DEMO_MODE !== 'false',
  });
  const port = Number(process.env.ERP_PORT ?? 8081);
  app.server.listen(port, process.env.HOST ?? '127.0.0.1', () =>
    console.log(JSON.stringify({ event: 'mock_erp_started', port })),
  );
  const shutdown = () => app.close().then(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
