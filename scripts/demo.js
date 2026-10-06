import assert from 'node:assert/strict';

const base = process.env.ATLAS_URL ?? 'http://127.0.0.1:8080';
async function request(path, cookie, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Atlas-Request': 'true',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(`${method} ${path}: ${result.error?.message ?? response.status}`);
  return { data: result.data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function signIn(username) {
  return (await request('/api/login', null, 'POST', { username, password: 'AtlasDemo!2026' }))
    .cookie;
}
const editor = await signIn('steward');
const reviewer = await signIn('reviewer');
const suffix = Date.now().toString(36).toUpperCase();
let { data: product } = await request('/api/products', editor, 'POST', {
  sku: `DEMO-${suffix}`,
  name: 'Demo 20 A thermal circuit breaker',
  manufacturer: 'Portfolio Electric',
  mpn: `PE-${suffix}`,
  supplierId: 'SUP-001',
  categoryId: 'CIRCUIT_BREAKERS',
  uom: 'EA',
  voltage: 120,
  gtin: '',
  source: 'Automated demo walkthrough',
});
for (const [action, cookie] of [
  ['submit', editor],
  ['approve', reviewer],
  ['publish', reviewer],
]) {
  ({ data: product } = await request(`/api/products/${product.id}/transitions`, cookie, 'POST', {
    action,
    version: product.version,
  }));
}
assert.equal(product.status, 'Published');
let delivered = false;
for (let attempt = 0; attempt < 20; attempt++) {
  const { data } = await request('/api/jobs', reviewer);
  if (data.some((job) => job.productId === product.id && job.status === 'Delivered')) {
    delivered = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.ok(delivered, 'ERP delivery did not complete in 10 seconds.');
const { data: materials } = await request('/api/erp/materials', reviewer);
assert.ok(
  materials.some(
    (material) => material.MATNR === product.sku && material.sourceVersion === product.version,
  ),
);
const { data: events } = await request(`/api/audit?productId=${product.id}`, reviewer);
assert.deepEqual(events.map((event) => event.action).sort(), [
  'approve',
  'create',
  'publish',
  'submit',
]);
await request('/api/logout', editor, 'POST');
await request('/api/logout', reviewer, 'POST');
console.log(
  `Demo passed: ${product.sku} created, submitted, independently approved, published, delivered, and audited.`,
);
