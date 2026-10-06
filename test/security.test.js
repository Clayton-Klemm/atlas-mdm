import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/domain.js';
import { Auth } from '../src/auth.js';
import { JobWorker, mapMaterial } from '../src/jobs.js';
import { createApplication } from '../src/server.js';
import { createMockERP } from '../src/mock-erp.js';

const customPassword = 'Atlas-custom-test-password-2026';
const customToken = 'atlas-custom-internal-test-token-2026';
const steward = { id: 'steward', username: 'steward', role: 'steward' };
const reviewer = { id: 'reviewer', username: 'reviewer', role: 'reviewer' };
const productInput = {
  sku: 'SECURITY-CB-20',
  name: '20 A security regression test breaker',
  manufacturer: 'Test Electrical',
  mpn: 'SEC-CB20',
  supplierId: 'SUP-001',
  categoryId: 'CIRCUIT_BREAKERS',
  uom: 'EA',
  voltage: 120,
  gtin: '',
};
const temporaryStore = (context) => {
  const store = new Store({ path: ':memory:', seed: false });
  context.after(() => store.close());
  return store;
};

test('non-demo authentication refuses a database provisioned with demo identities', (context) => {
  const store = temporaryStore(context);
  new Auth(store.db, { demoMode: true });
  assert.throws(
    () => new Auth(store.db, { demoMode: false, adminPassword: customPassword }),
    /contains demo identities/,
  );
  assert.equal(
    store.db.prepare("SELECT value FROM auth_metadata WHERE key = 'mode'").get().value,
    'demo',
  );
});

test('non-demo authentication also refuses legacy demo identities without metadata', (context) => {
  const store = temporaryStore(context);
  new Auth(store.db, { demoMode: true });
  store.db.exec('DELETE FROM auth_metadata');
  assert.throws(
    () => new Auth(store.db, { demoMode: false, adminPassword: customPassword }),
    /contains demo identities/,
  );
});

test('fresh custom authentication provisions only the admin and rejects all demo passwords', async (context) => {
  const store = temporaryStore(context);
  const auth = new Auth(store.db, { demoMode: false, adminPassword: customPassword });
  assert.deepEqual(
    store.db
      .prepare('SELECT username, role FROM users')
      .all()
      .map((row) => ({ ...row })),
    [{ username: 'admin', role: 'admin' }],
  );
  assert.equal(
    store.db.prepare("SELECT value FROM auth_metadata WHERE key = 'mode'").get().value,
    'custom',
  );
  const login = await auth.login('admin', customPassword);
  assert.deepEqual(login.actor, { id: 'admin', username: 'admin', role: 'admin' });
  assert.deepEqual(auth.session(login.token), login.actor);
  assert.equal(await auth.login('admin', 'AtlasDemo!2026'), null);
  assert.equal(await auth.login('steward', 'AtlasDemo!2026'), null);
  assert.equal(await auth.login('reviewer', 'AtlasDemo!2026'), null);
});

test('custom application and ERP refuse the published demo integration credential', () => {
  assert.throws(
    () =>
      createApplication({
        seed: false,
        demoMode: false,
        startWorker: false,
        adminPassword: customPassword,
      }),
    /ERP_TOKEN/,
  );
  assert.throws(() => createMockERP({ demoMode: false }), /ERP_TOKEN/);
  assert.throws(() => createMockERP({ demoMode: false, token: 'too-short' }), /ERP_TOKEN/);
});

test('a mismatched ERP acknowledgement version remains Retry and never marks delivery', async (context) => {
  const store = temporaryStore(context);
  let product = store.createProduct(productInput, steward);
  product = store.transition(product.id, 'submit', product.version, steward);
  product = store.transition(product.id, 'approve', product.version, reviewer);
  product = store.transition(product.id, 'publish', product.version, reviewer);
  const worker = new JobWorker(store.db, {
    erpUrl: 'http://unused.example',
    erpToken: customToken,
    fetchFn: async (_url, options) =>
      new Response(
        JSON.stringify({
          data: {
            MATNR: product.sku,
            idempotencyKey: options.headers['Idempotency-Key'],
            sourceVersion: product.version + 1,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  });
  await worker.tick();
  const [job] = worker.list();
  assert.equal(job.status, 'Retry');
  assert.equal(job.attempts, 1);
  assert.equal(job.deliveredAt, null);
  assert.equal(job.lastError, 'ERP acknowledgement mismatch');
  assert.equal(worker.counters.delivered, 0);
  assert.equal(worker.counters.failed, 1);
  assert.equal(store.audit().length, 4);
});

test('the ERP rejects invalid mapped voltage and GTIN without storing a material or receipt', async (context) => {
  const erp = createMockERP({ demoMode: false, token: customToken });
  await new Promise((resolve) => erp.server.listen(0, '127.0.0.1', resolve));
  context.after(() => erp.close());
  const endpoint = `http://127.0.0.1:${erp.server.address().port}/materials`;
  const material = mapMaterial({ ...productInput, version: 4 });
  const invalid = [
    { VOLTAGE: 'not a voltage' },
    { VOLTAGE: 0 },
    { VOLTAGE: -10 },
    { VOLTAGE: 100001 },
    { VOLTAGE: null },
    { GTIN: { unexpected: true } },
    { GTIN: 'invalid' },
    { GTIN: 12345678 },
  ];
  for (const [index, patch] of invalid.entries()) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `invalid-material-${index}`,
      },
      body: JSON.stringify({ ...material, ...patch }),
    });
    assert.equal(response.status, 422, `Unexpected acceptance of ${JSON.stringify(patch)}`);
    assert.equal((await response.json()).error.code, 'INVALID_MATERIAL');
  }
  assert.equal(erp.db.prepare('SELECT COUNT(*) AS count FROM materials').get().count, 0);
  assert.equal(erp.db.prepare('SELECT COUNT(*) AS count FROM receipts').get().count, 0);
  const valid = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${customToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'valid-material',
    },
    body: JSON.stringify(material),
  });
  assert.equal(valid.status, 200);
  assert.equal(erp.db.prepare('SELECT COUNT(*) AS count FROM materials').get().count, 1);
  assert.equal(erp.db.prepare('SELECT COUNT(*) AS count FROM receipts').get().count, 1);
});
