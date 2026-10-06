import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../src/server.js';
import { createMockERP } from '../src/mock-erp.js';
import { mapMaterial } from '../src/jobs.js';
import { Store } from '../src/domain.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const steward = { id: 'steward', username: 'steward', role: 'steward' };
const reviewer = { id: 'reviewer', username: 'reviewer', role: 'reviewer' };
const admin = { id: 'admin', username: 'admin', role: 'admin' };
const product = () => ({
  sku: 'INT-CB-20',
  name: '20 A single-pole circuit breaker',
  manufacturer: 'Fictional Testworks',
  mpn: 'FT-20',
  supplierId: 'SUP-001',
  categoryId: 'CIRCUIT_BREAKERS',
  uom: 'EA',
  voltage: 120,
  gtin: '',
  source: 'Integration test',
});

async function listening(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(context, options = {}) {
  const erp = createMockERP();
  const erpUrl = await listening(erp.server);
  const app = createApplication({ seed: false, startWorker: false, erpUrl, ...options });
  const url = await listening(app.server);
  context.after(async () => {
    await app.close();
    await erp.close();
  });
  return { app, erp, url, erpUrl };
}
async function login(url, username = 'steward') {
  const response = await fetch(`${url}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Atlas-Request': 'true' },
    body: JSON.stringify({ username, password: 'AtlasDemo!2026' }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}
async function api(url, cookie, path, method = 'GET', body, headers = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
      'X-Atlas-Request': 'true',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  return { status: response.status, data, response };
}
function publish(store) {
  let record = store.createProduct(product(), steward);
  record = store.transition(record.id, 'submit', record.version, steward);
  record = store.transition(record.id, 'approve', record.version, reviewer);
  return store.transition(record.id, 'publish', record.version, reviewer);
}

test('REST workflow enforces authentication, roles and optimistic concurrency', async (context) => {
  const { url, app } = await fixture(context);
  assert.equal((await fetch(`${url}/api/products`)).status, 401);
  const edit = await login(url);
  const review = await login(url, 'reviewer');
  let result = await api(url, edit, '/api/products', 'POST', product());
  assert.equal(result.status, 201);
  let record = result.data.data;
  result = await api(url, edit, `/api/products/${record.id}`, 'PUT', {
    version: record.version,
    name: 'An updated circuit breaker',
  });
  assert.equal(result.status, 200);
  record = result.data.data;
  assert.equal(
    (
      await api(url, edit, `/api/products/${record.id}`, 'PUT', {
        version: 1,
        name: 'A stale name',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(url, review, `/api/products/${record.id}`, 'PUT', {
        version: record.version,
        name: 'Unauthorized',
      })
    ).status,
    403,
  );
  for (const [action, cookie] of [
    ['submit', edit],
    ['approve', review],
    ['publish', review],
  ]) {
    result = await api(url, cookie, `/api/products/${record.id}/transitions`, 'POST', {
      action,
      version: record.version,
    });
    assert.equal(result.status, 200);
    record = result.data.data;
  }
  assert.equal(record.status, 'Published');
  await app.worker.tick();
  const downstream = await api(url, review, '/api/erp/materials');
  assert.equal(downstream.data.data[0].MATNR, product().sku);
  assert.equal(downstream.data.data[0].sourceVersion, record.version);
  const exported = await fetch(`${url}/api/exports?format=json`, { headers: { Cookie: edit } });
  assert.equal((await exported.json())[0].status, 'Published');
  assert.equal(app.worker.list()[0].status, 'Delivered');
});

test('CSRF, safe errors, cookie flags and logout protect the session boundary', async (context) => {
  const { url } = await fixture(context);
  const bad = await fetch(`${url}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AtlasDemo!2026' }),
  });
  assert.equal(bad.status, 403);
  const cookie = await login(url);
  const origin = await api(url, cookie, '/api/products', 'POST', product(), {
    Origin: 'https://attacker.example',
  });
  assert.equal(origin.status, 403);
  const missing = await api(url, cookie, '/api/products/missing');
  assert.equal(missing.status, 404);
  assert.ok(missing.data.requestId);
  assert.equal(missing.data.error.code, 'PRODUCT_NOT_FOUND');
  const signedIn = await fetch(`${url}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Atlas-Request': 'true' },
    body: JSON.stringify({ username: 'reviewer', password: 'AtlasDemo!2026' }),
  });
  assert.match(signedIn.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  await api(url, cookie, '/api/logout', 'POST');
  assert.equal((await api(url, cookie, '/api/session')).status, 401);
  assert.ok(
    (await fetch(`${url}/health/ready`)).headers
      .get('content-security-policy')
      .includes("script-src 'self'"),
  );
});

test('malformed JSON, oversized bodies and brute-force logins are bounded', async (context) => {
  const { url } = await fixture(context);
  const headers = { 'Content-Type': 'application/json', 'X-Atlas-Request': 'true' };
  const malformed = await fetch(`${url}/api/login`, { method: 'POST', headers, body: '{broken' });
  assert.equal(malformed.status, 400);
  const oversized = await fetch(`${url}/api/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: 'x', password: 'x'.repeat(270000) }),
  });
  assert.equal(oversized.status, 413);
  for (let i = 0; i < 8; i++)
    assert.equal(
      (
        await fetch(`${url}/api/login`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ username: 'unknown', password: 'wrong' }),
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await fetch(`${url}/api/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ username: 'unknown', password: 'wrong' }),
      })
    ).status,
    429,
  );
});

test('transient ERP failure retries with the same key and operator replay is audited', async (context) => {
  const { app, url, erpUrl } = await fixture(context);
  const record = publish(app.store);
  const job = app.worker.list()[0];
  await fetch(`${erpUrl}/control`, {
    method: 'POST',
    headers: { Authorization: 'Bearer atlas-local-demo-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ failNext: 1 }),
  });
  await app.worker.tick();
  assert.equal(app.worker.list()[0].status, 'Retry');
  assert.equal(app.worker.list()[0].attempts, 1);
  const edit = await login(url);
  assert.equal((await api(url, edit, `/api/jobs/${job.id}/retry`, 'POST', {})).status, 403);
  const operator = await login(url, 'admin');
  assert.equal((await api(url, operator, `/api/jobs/${job.id}/retry`, 'POST', {})).status, 200);
  await app.worker.tick();
  assert.equal(app.worker.list()[0].status, 'Delivered');
  assert.equal(app.worker.list()[0].id, job.id);
  assert.ok(
    app.store.audit({ productId: record.id }).some((event) => event.action === 'IntegrationRetry'),
  );
});

test('repeated failures become dead letter and manual replay can recover', async (context) => {
  const { app, erpUrl } = await fixture(context);
  publish(app.store);
  await fetch(`${erpUrl}/control`, {
    method: 'POST',
    headers: { Authorization: 'Bearer atlas-local-demo-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ failNext: 5 }),
  });
  for (let i = 0; i < 5; i++) {
    app.store.db.prepare('UPDATE jobs SET next_attempt_at = ?').run('2000-01-01T00:00:00.000Z');
    await app.worker.tick();
  }
  const job = app.worker.list()[0];
  assert.equal(job.status, 'DeadLetter');
  assert.equal(job.attempts, 5);
  app.worker.retry(job.id, admin);
  await app.worker.tick();
  assert.equal(app.worker.list()[0].status, 'Delivered');
});

test('ERP deduplicates replay, rejects key reuse and prevents older version overwrite', async (context) => {
  const { erpUrl } = await fixture(context);
  const material = mapMaterial({ ...product(), version: 4 });
  const key = randomUUID();
  const send = (value, id) =>
    fetch(`${erpUrl}/materials`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer atlas-local-demo-token',
        'Content-Type': 'application/json',
        'Idempotency-Key': id,
      },
      body: JSON.stringify(value),
    });
  const first = await (await send(material, key)).json();
  assert.deepEqual(await (await send(material, key)).json(), first);
  assert.equal((await send({ ...material, MAKTX: 'Different' }, key)).status, 409);
  const stale = await (await send({ ...material, sourceVersion: 2 }, randomUUID())).json();
  assert.equal(stale.data.stale, true);
  const list = await (
    await fetch(`${erpUrl}/materials`, {
      headers: { Authorization: 'Bearer atlas-local-demo-token' },
    })
  ).json();
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].sourceVersion, 4);
});

test('a crash after ERP acceptance is safely replayed after worker restart', async (context) => {
  const { app, erpUrl } = await fixture(context);
  publish(app.store);
  const job = app.store.db.prepare('SELECT * FROM jobs').get();
  await fetch(`${erpUrl}/materials`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer atlas-local-demo-token',
      'Content-Type': 'application/json',
      'Idempotency-Key': job.id,
    },
    body: JSON.stringify(mapMaterial(JSON.parse(job.payload))),
  });
  // Local job was never marked delivered; restart replays the exact accepted message.
  await app.worker.tick();
  assert.equal(app.worker.list()[0].status, 'Delivered');
  const downstream = await (
    await fetch(`${erpUrl}/materials`, {
      headers: { Authorization: 'Bearer atlas-local-demo-token' },
    })
  ).json();
  assert.equal(downstream.data.length, 1);
});

test('file-backed data, approval history and pending messages survive store reopen', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-test-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'atlas.sqlite');
  const original = new Store({ path, seed: false });
  const record = publish(original);
  original.close();
  const restored = new Store({ path, seed: false });
  assert.equal(restored.getProduct(record.id).status, 'Published');
  assert.equal(restored.audit().length, 4);
  assert.equal(restored.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 1);
  restored.close();
});
