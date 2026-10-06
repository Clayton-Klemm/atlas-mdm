import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, DomainError, evaluateQuality } from '../src/domain.js';

const steward = { id: 'steward', username: 'steward', role: 'steward' };
const reviewer = { id: 'reviewer', username: 'reviewer', role: 'reviewer' };
const admin = { id: 'admin', username: 'admin', role: 'admin' };
const catalog = (overrides = {}) => ({
  sku: 'TEST-CB-20',
  name: '20 A single-pole circuit breaker',
  manufacturer: 'Test Electrical',
  mpn: 'T-20',
  supplierId: 'SUP-001',
  categoryId: 'CIRCUIT_BREAKERS',
  uom: 'EA',
  voltage: 120,
  gtin: '',
  source: 'Unit test',
  ...overrides,
});
const storeFor = (context) => {
  const store = new Store({ path: ':memory:', seed: false });
  context.after(() => store.close());
  return store;
};
const errorCode = (code) => (error) => error instanceof DomainError && error.code === code;

test('draft quality failures are visible and submission is blocked', (context) => {
  const store = storeFor(context);
  const product = store.createProduct(catalog({ name: 'Bad', voltage: null, uom: 'FT' }), steward);
  assert.equal(product.status, 'Draft');
  assert.equal(product.quality.issues.length, 3);
  assert.throws(
    () => store.transition(product.id, 'submit', 1, steward),
    errorCode('QUALITY_GATE'),
  );
  assert.equal(store.getProduct(product.id).version, 1);
  assert.equal(store.audit().length, 1);
});

test('workflow enforces maker/checker and publishes an atomic snapshot', (context) => {
  const store = storeFor(context);
  let product = store.createProduct(catalog(), admin);
  product = store.transition(product.id, 'submit', product.version, admin);
  assert.throws(
    () => store.transition(product.id, 'approve', product.version, admin),
    errorCode('MAKER_CHECKER'),
  );
  product = store.transition(product.id, 'approve', product.version, reviewer);
  assert.equal(product.approvedBy, 'reviewer');
  product = store.transition(product.id, 'publish', product.version, reviewer);
  const job = store.db.prepare('SELECT * FROM jobs').get();
  assert.equal(job.status, 'Pending');
  assert.equal(job.product_version, product.version);
  assert.deepEqual(JSON.parse(job.payload), product);
  assert.equal(store.audit({ productId: product.id }).length, 4);
  assert.throws(
    () => store.updateProduct(product.id, { name: 'Changed product' }, product.version, admin),
    errorCode('INVALID_STATE'),
  );
  product = store.transition(product.id, 'reopen', product.version, admin);
  assert.equal(product.status, 'Draft');
  assert.equal(product.approvedBy, null);
  assert.equal(JSON.parse(job.payload).status, 'Published');
});

test('last editor also cannot approve, even after a different creator', (context) => {
  const store = storeFor(context);
  let product = store.createProduct(catalog(), steward);
  product = store.updateProduct(
    product.id,
    { name: 'An edited circuit breaker' },
    product.version,
    admin,
  );
  product = store.transition(product.id, 'submit', product.version, steward);
  assert.throws(
    () => store.transition(product.id, 'approve', product.version, admin),
    errorCode('MAKER_CHECKER'),
  );
});

test('approval and publication re-evaluate the current quality rules', (context) => {
  const store = storeFor(context);
  let product = store.createProduct(catalog(), steward);
  product = store.transition(product.id, 'submit', product.version, steward);
  // Represent a record invalidated after submission by changed source data or rules.
  store.db.prepare('UPDATE products SET name = ? WHERE id = ?').run('Bad', product.id);
  assert.throws(
    () => store.transition(product.id, 'approve', product.version, reviewer),
    errorCode('QUALITY_GATE'),
  );
  assert.equal(store.getProduct(product.id).status, 'InReview');
  store.db
    .prepare('UPDATE products SET name = ? WHERE id = ?')
    .run('Corrected circuit breaker', product.id);
  product = store.transition(product.id, 'approve', product.version, reviewer);
  store.db.prepare('UPDATE products SET voltage = NULL WHERE id = ?').run(product.id);
  assert.throws(
    () => store.transition(product.id, 'publish', product.version, reviewer),
    errorCode('QUALITY_GATE'),
  );
  assert.equal(store.getProduct(product.id).status, 'Approved');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 0);
  assert.equal(store.audit().length, 3);
});

test('a new on-disk database creates its missing parent directories', (context) => {
  const temporary = mkdtempSync(join(tmpdir(), 'atlas-domain-'));
  const store = new Store({
    path: join(temporary, 'missing', 'nested', 'atlas.sqlite'),
    seed: false,
  });
  context.after(() => {
    store.close();
    rmSync(temporary, { recursive: true, force: true });
  });
  const product = store.createProduct(catalog(), steward);
  assert.equal(store.getProduct(product.id).sku, 'TEST-CB-20');
});

test('stale versions, malformed versions and arbitrary fields never overwrite a record', (context) => {
  const store = storeFor(context);
  const product = store.createProduct(catalog(), steward);
  store.updateProduct(product.id, { name: 'A newer product description' }, 1, steward);
  assert.throws(
    () => store.updateProduct(product.id, { name: 'Stale change' }, 1, steward),
    errorCode('VERSION_CONFLICT'),
  );
  assert.throws(
    () => store.updateProduct(product.id, { name: 'Missing version' }, undefined, steward),
    errorCode('VERSION_REQUIRED'),
  );
  assert.throws(
    () => store.updateProduct(product.id, { approvedBy: 'admin' }, 2, steward),
    errorCode('UNKNOWN_FIELDS'),
  );
  assert.equal(store.getProduct(product.id).name, 'A newer product description');
});

test('roles and transitions enforce the complete workflow', (context) => {
  const store = storeFor(context);
  assert.throws(() => store.createProduct(catalog(), reviewer), errorCode('FORBIDDEN'));
  const product = store.createProduct(catalog(), steward);
  assert.throws(
    () => store.transition(product.id, 'approve', 1, reviewer),
    errorCode('INVALID_STATE'),
  );
  assert.throws(() => store.transition(product.id, 'submit', 1, reviewer), errorCode('FORBIDDEN'));
  const inReview = store.transition(product.id, 'submit', 1, steward);
  assert.throws(
    () => store.transition(product.id, 'reject', inReview.version, reviewer),
    errorCode('COMMENT_REQUIRED'),
  );
  const rejected = store.transition(
    product.id,
    'reject',
    inReview.version,
    reviewer,
    'Please correct the source catalog.',
  );
  assert.equal(rejected.status, 'Draft');
  assert.equal(store.audit()[0].comment, 'Please correct the source catalog.');
});

test('normalization and duplicate checks cover case and compatibility characters', (context) => {
  const store = storeFor(context);
  const product = store.createProduct(
    catalog({ sku: '  test-cb-20  ', manufacturer: ' Test  Electrical ', mpn: 'Ｔ-２０' }),
    steward,
  );
  assert.equal(product.sku, 'TEST-CB-20');
  assert.equal(product.manufacturer, 'Test Electrical');
  assert.throws(
    () =>
      store.createProduct(
        catalog({ sku: 'OTHER-CB-20', manufacturer: 'test electrical', mpn: 't-20' }),
        steward,
      ),
    errorCode('DUPLICATE_IDENTITY'),
  );
  assert.throws(
    () => store.createProduct(catalog({ sku: 'ＴＥＳＴ-CB-20', mpn: 'OTHER-20' }), steward),
    errorCode('DUPLICATE_IDENTITY'),
  );
});

test('audit rows are immutable at the database layer', (context) => {
  const store = storeFor(context);
  store.createProduct(catalog(), steward);
  assert.throws(
    () => store.db.prepare("UPDATE audit_events SET comment = 'tampered'").run(),
    /immutable/,
  );
  assert.throws(() => store.db.prepare('DELETE FROM audit_events').run(), /immutable/);
  assert.equal(store.audit().length, 1);
});

test('publication and its audit roll back if the outbox insert fails', (context) => {
  const store = storeFor(context);
  let product = store.createProduct(catalog(), steward);
  product = store.transition(product.id, 'submit', product.version, steward);
  product = store.transition(product.id, 'approve', product.version, reviewer);
  store.db.exec(
    "CREATE TRIGGER reject_job BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
  );
  assert.throws(
    () => store.transition(product.id, 'publish', product.version, reviewer),
    /test failure/,
  );
  assert.equal(store.getProduct(product.id).status, 'Approved');
  assert.equal(store.getProduct(product.id).version, 3);
  assert.equal(store.audit().length, 3);
});

test('dry-run previews quality without creating products or audit records', (context) => {
  const store = storeFor(context);
  const preview = store.importProducts(
    JSON.stringify([catalog(), catalog({ sku: 'TEST-BAD', mpn: 'T-BAD', voltage: null })]),
    'json',
    steward,
    { dryRun: true },
  );
  assert.equal(preview.created, 0);
  assert.equal(preview.total, 2);
  assert.equal(preview.rows[1].quality.issues[0].rule, 'voltage-required');
  assert.equal(store.listProducts().length, 0);
  assert.equal(store.audit().length, 0);
});

test('all sample import formats produce the same products and quality', (context) => {
  const result = [];
  for (const format of ['json', 'csv', 'xml']) {
    const store = storeFor(context);
    const content = readFileSync(
      new URL(`../samples/supplier-products.${format}`, import.meta.url),
      'utf8',
    );
    const imported = store.importProducts(content, format, steward);
    assert.equal(imported.created, 3);
    assert.equal(imported.rows[2].quality.score, 70);
    result.push(
      store
        .listProducts()
        .sort((a, b) => a.sku.localeCompare(b.sku))
        .map(({ id, createdAt, updatedAt, ...product }) => product),
    );
  }
  assert.deepEqual(result[0], result[1]);
  assert.deepEqual(result[1], result[2]);
});

test('invalid and duplicate rows reject the entire import with row details', (context) => {
  const store = storeFor(context);
  let caught;
  try {
    store.importProducts(
      JSON.stringify([catalog(), catalog({ sku: 'OTHER-SKU', voltage: '120' })]),
      'json',
      steward,
    );
  } catch (error) {
    caught = error;
  }
  assert.equal(caught.code, 'IMPORT_REJECTED');
  assert.equal(caught.details.rows[0].row, 2);
  assert.equal(store.listProducts().length, 0);
  assert.throws(
    () =>
      store.importProducts(
        JSON.stringify([catalog(), catalog({ sku: 'OTHER-SKU' })]),
        'json',
        steward,
      ),
    errorCode('IMPORT_REJECTED'),
  );
  assert.equal(store.audit().length, 0);
});

test('an import rolls back all created rows if a later insert fails', (context) => {
  const store = storeFor(context);
  store.db.exec(
    "CREATE TRIGGER reject_second BEFORE INSERT ON products WHEN NEW.sku = 'FAIL-SKU' BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
  );
  assert.throws(
    () =>
      store.importProducts(
        JSON.stringify([catalog(), catalog({ sku: 'FAIL-SKU', mpn: 'T-FAIL' })]),
        'json',
        steward,
      ),
    /test failure/,
  );
  assert.equal(store.listProducts().length, 0);
  assert.equal(store.audit().length, 0);
});

test('XML rejects document types, entities, malformed markup and nested field objects', (context) => {
  const store = storeFor(context);
  for (const xml of [
    '<!DOCTYPE products [<!ENTITY leak SYSTEM "file:///etc/passwd">]><products><product><sku>&leak;</sku></product></products>',
    '<!DOCTYPE products><products/>',
  ]) {
    assert.throws(() => store.importProducts(xml, 'xml', steward), errorCode('UNSAFE_XML'));
  }
  assert.throws(
    () => store.importProducts('<products><product></products>', 'xml', steward),
    errorCode('INVALID_XML'),
  );
  assert.throws(
    () =>
      store.importProducts(
        '<products><product><sku><nested>BAD</nested></sku></product></products>',
        'xml',
        steward,
      ),
    errorCode('IMPORT_REJECTED'),
  );
});

test('CSV handles quotes, commas and newlines and rejects malformed rows', (context) => {
  const store = storeFor(context);
  const csv =
    'sku,name,manufacturer,mpn,supplierId,categoryId,uom,voltage\r\nCSV-CB-20,"Breaker, \"\"heavy duty\"\"\nseries",Test,T-CSV,SUP-001,CIRCUIT_BREAKERS,EA,120\r\n';
  store.importProducts(csv, 'csv', steward);
  assert.equal(store.listProducts()[0].name, 'Breaker, "heavy duty" series');
  for (const invalid of [
    'sku,sku\nA,B',
    'sku,name\nA',
    'sku,name\nA,"Unclosed',
    'sku,name\nA,"value"junk',
  ]) {
    assert.throws(() => store.importProducts(invalid, 'csv', steward), errorCode('INVALID_CSV'));
  }
});

test('structural validation rejects control characters, non-finite data and oversized batches', (context) => {
  const store = storeFor(context);
  assert.throws(
    () => store.createProduct(catalog({ name: 'Bad\u0000name' }), steward),
    errorCode('INVALID_FIELD'),
  );
  assert.throws(
    () => store.createProduct(catalog({ voltage: Infinity }), steward),
    errorCode('INVALID_FIELD'),
  );
  assert.throws(
    () => store.createProduct(catalog({ manufacturer: '\uD800' }), steward),
    errorCode('INVALID_FIELD'),
  );
  assert.throws(
    () =>
      store.importProducts(
        JSON.stringify(
          Array.from({ length: 101 }, (_, i) => catalog({ sku: `SKU-${i}`, mpn: `MPN-${i}` })),
        ),
        'json',
        steward,
      ),
    errorCode('INVALID_BATCH'),
  );
});

test('GTIN checksum, category references and unit rules are deterministic', () => {
  assert.equal(evaluateQuality(catalog({ gtin: '00012345600012' })).issues.length, 0);
  assert.equal(
    evaluateQuality(catalog({ gtin: '00012345600013' })).issues[0].rule,
    'gtin-checksum',
  );
  assert.ok(
    evaluateQuality(catalog({ supplierId: 'UNKNOWN' })).issues.some(
      (issue) => issue.rule === 'supplier-reference',
    ),
  );
  assert.ok(
    evaluateQuality(catalog({ categoryId: 'WIRE_CABLE', uom: 'EA' })).issues.some(
      (issue) => issue.rule === 'category-unit',
    ),
  );
});

test('exports include only Published records and neutralize CSV formulas', (context) => {
  const store = storeFor(context);
  store.createProduct(catalog({ sku: 'DRAFT-CB-20' }), steward);
  let product = store.createProduct(
    catalog({ sku: 'PUB-CB-20', mpn: 'T-PUB', name: '=HYPERLINK("https://example.test")' }),
    steward,
  );
  product = store.transition(product.id, 'submit', product.version, steward);
  product = store.transition(product.id, 'approve', product.version, reviewer);
  store.transition(product.id, 'publish', product.version, reviewer);
  const exported = JSON.parse(store.exportProducts('json'));
  assert.equal(exported.length, 1);
  assert.equal(exported[0].sku, 'PUB-CB-20');
  assert.match(store.exportProducts('csv'), /'=HYPERLINK/);
  assert.match(store.exportProducts('xml'), /<status>Published<\/status>/);
});

test('demo seeds cover each workflow status and contain an actionable quality issue', (context) => {
  const store = new Store({ path: ':memory:' });
  context.after(() => store.close());
  const summary = store.dashboard();
  assert.equal(summary.totalProducts, 6);
  assert.ok(Object.values(summary.byStatus).every((count) => count > 0));
  assert.ok(store.listProducts({ status: 'Draft' }).some((product) => product.quality.score < 100));
  assert.ok(store.audit().every((event) => event.comment.includes('Demo seed')));
  assert.equal(summary.pendingJobs, 2);
});
