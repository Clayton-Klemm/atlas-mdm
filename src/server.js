import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Store } from './domain.js';
import { Auth, readCookie, sessionCookie } from './auth.js';
import { JobWorker } from './jobs.js';
import { HttpError, json, jsonBody } from './http.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['public/favicon.svg', 'image/svg+xml']],
  ...['json', 'csv', 'xml'].map((format) => [
    `/samples/supplier-products.${format}`,
    [`samples/supplier-products.${format}`, 'text/plain; charset=utf-8'],
  ]),
]);

export function createApplication({
  path = ':memory:',
  seed = true,
  demoMode = true,
  erpUrl = 'http://127.0.0.1:8081',
  erpToken = 'atlas-local-demo-token',
  workerInterval = 1500,
  startWorker = true,
  secureCookies = false,
  adminPassword,
  logger = () => {},
} = {}) {
  if (!demoMode && seed) throw new Error('SEED_DEMO must be false when DEMO_MODE is false.');
  if (!demoMode && (erpToken === 'atlas-local-demo-token' || erpToken.length < 32))
    throw new Error('Without DEMO_MODE, set a unique ERP_TOKEN with at least 32 characters.');
  const store = new Store({ path, seed });
  const auth = new Auth(store.db, { demoMode, adminPassword });
  const worker = new JobWorker(store.db, { erpUrl, erpToken, interval: workerInterval });
  const attempts = new Map();
  const metrics = { requests: 0, errors: 0 };
  async function erpRequest(route, method = 'GET', body) {
    const response = await fetch(`${erpUrl}${route}`, {
      method,
      headers: { Authorization: `Bearer ${erpToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok)
      throw new HttpError(
        502,
        'ERP_UNAVAILABLE',
        `ERP returned HTTP ${response.status}. Check integration jobs.`,
      );
    return (await response.json()).data;
  }
  const server = createServer(async (req, res) => {
    const requestId = randomUUID();
    const started = Date.now();
    metrics.requests++;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    res.on('finish', () =>
      logger({
        event: 'request',
        requestId,
        method: req.method,
        path: req.url?.split('?')[0],
        status: res.statusCode,
        durationMs: Date.now() - started,
      }),
    );
    try {
      const url = new URL(req.url, 'http://atlas');
      const route = url.pathname;
      if (req.method === 'GET' && route === '/health/live') return json(res, 200, { status: 'ok' });
      if (req.method === 'GET' && route === '/health/ready') {
        store.db.prepare('SELECT COUNT(*) FROM products').get();
        return json(res, 200, { status: 'ready', database: 'ok' });
      }
      if (req.method === 'GET' && route === '/metrics') {
        const states = store.db
          .prepare('SELECT status, COUNT(*) AS count FROM jobs GROUP BY status')
          .all();
        const lines = [
          '# TYPE atlas_http_requests_total counter',
          `atlas_http_requests_total ${metrics.requests}`,
          '# TYPE atlas_http_errors_total counter',
          `atlas_http_errors_total ${metrics.errors}`,
          '# TYPE atlas_erp_deliveries_total counter',
          `atlas_erp_deliveries_total ${worker.counters.delivered}`,
          '# TYPE atlas_erp_failures_total counter',
          `atlas_erp_failures_total ${worker.counters.failed}`,
          '# TYPE atlas_jobs gauge',
          ...['Pending', 'Retry', 'Delivered', 'DeadLetter'].map(
            (status) =>
              `atlas_jobs{status="${status}"} ${states.find((s) => s.status === status)?.count ?? 0}`,
          ),
        ];
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
        return res.end(lines.join('\n') + '\n');
      }
      if (req.method === 'GET' && route === '/api/spec') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(readFileSync(resolve(root, 'docs/openapi.json')));
      }
      if (req.method === 'GET' && assets.has(route)) {
        const [file, type] = assets.get(route);
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        return res.end(readFileSync(resolve(root, file)));
      }
      if (!route.startsWith('/api/')) throw new HttpError(404, 'NOT_FOUND', 'Page not found.');
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.headers['x-atlas-request'] !== 'true')
          throw new HttpError(403, 'CSRF_CHECK', 'Send X-Atlas-Request: true on mutations.');
        if (req.headers.origin) {
          let origin;
          try {
            origin = new URL(req.headers.origin);
          } catch {
            throw new HttpError(403, 'CSRF_CHECK', 'Origin is invalid.');
          }
          if (
            origin.host !== req.headers.host ||
            origin.protocol !== (secureCookies ? 'https:' : 'http:')
          )
            throw new HttpError(403, 'CSRF_CHECK', 'Cross-origin mutations are blocked.');
        }
      }
      if (route === '/api/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        const now = Date.now();
        for (const [key, value] of attempts) if (value.reset <= now) attempts.delete(key);
        const entry = attempts.get(ip) ?? { count: 0, reset: now + 15 * 60 * 1000 };
        if (entry.count >= 10)
          throw new HttpError(
            429,
            'RATE_LIMIT',
            'Too many login attempts. Try again in 15 minutes.',
          );
        entry.count++;
        attempts.set(ip, entry);
        const body = await jsonBody(req);
        const login = await auth.login(body.username, body.password);
        if (!login)
          throw new HttpError(401, 'INVALID_CREDENTIALS', 'Username or password is incorrect.');
        // Successful demo role switching should not count as a failed attempt.
        attempts.delete(ip);
        res.setHeader('Set-Cookie', sessionCookie(login.token, secureCookies));
        return json(res, 200, { data: login.actor });
      }
      const token = readCookie(req);
      const actor = auth.session(token);
      if (!actor) throw new HttpError(401, 'UNAUTHORIZED', 'Sign in to continue.');
      if (route === '/api/session' && req.method === 'GET') return json(res, 200, { data: actor });
      if (route === '/api/logout' && req.method === 'POST') {
        auth.logout(token);
        res.setHeader('Set-Cookie', sessionCookie('', secureCookies));
        return json(res, 200, { data: { loggedOut: true } });
      }
      if (route === '/api/dashboard' && req.method === 'GET')
        return json(res, 200, { data: store.dashboard() });
      if (route === '/api/reference' && req.method === 'GET')
        return json(res, 200, { data: store.referenceData() });
      if (route === '/api/products' && req.method === 'GET')
        return json(res, 200, {
          data: store.listProducts({
            search: url.searchParams.get('search') ?? '',
            status: url.searchParams.get('status') ?? '',
          }),
        });
      if (route === '/api/products' && req.method === 'POST')
        return json(res, 201, { data: store.createProduct(await jsonBody(req), actor) });
      const product = route.match(/^\/api\/products\/([^/]+)$/);
      if (product && req.method === 'GET')
        return json(res, 200, { data: store.getProduct(product[1]) });
      if (product && req.method === 'PUT') {
        const { version, ...input } = await jsonBody(req);
        return json(res, 200, { data: store.updateProduct(product[1], input, version, actor) });
      }
      const transition = route.match(/^\/api\/products\/([^/]+)\/transitions$/);
      if (transition && req.method === 'POST') {
        const { action, version, comment } = await jsonBody(req);
        return json(res, 200, {
          data: store.transition(transition[1], action, version, actor, comment),
        });
      }
      if (route === '/api/imports' && req.method === 'POST') {
        const { format, content, dryRun = false } = await jsonBody(req);
        if (typeof content !== 'string' || typeof dryRun !== 'boolean')
          throw new HttpError(422, 'INVALID_IMPORT', 'content must be text and dryRun a boolean.');
        return json(res, 200, { data: store.importProducts(content, format, actor, { dryRun }) });
      }
      if (route === '/api/exports' && req.method === 'GET') {
        const format = url.searchParams.get('format') ?? 'json';
        const output = store.exportProducts(format);
        const type = { json: 'application/json', csv: 'text/csv', xml: 'application/xml' }[format];
        res.writeHead(200, {
          'Content-Type': `${type}; charset=utf-8`,
          'Content-Disposition': `attachment; filename="atlas-published.${format}"`,
          'Cache-Control': 'no-store',
        });
        return res.end(output);
      }
      if (route === '/api/audit' && req.method === 'GET')
        return json(res, 200, {
          data: store.audit({ productId: url.searchParams.get('productId') ?? undefined }),
        });
      if (route === '/api/jobs' && req.method === 'GET')
        return json(res, 200, { data: worker.list() });
      const retry = route.match(/^\/api\/jobs\/([^/]+)\/retry$/);
      if (retry && req.method === 'POST') {
        if (actor.role !== 'admin')
          throw new HttpError(403, 'FORBIDDEN', 'Only an admin can replay integration jobs.');
        const job = worker.retry(retry[1], actor);
        if (!job) throw new HttpError(404, 'NOT_FOUND', 'Job not found.');
        if (job.error)
          throw new HttpError(
            409,
            'JOB_STATE',
            job.error === 'busy'
              ? 'The worker is processing. Try again shortly.'
              : 'Only retrying or dead-letter jobs can be replayed.',
          );
        return json(res, 200, { data: job });
      }
      if (route === '/api/erp/materials' && req.method === 'GET')
        return json(res, 200, { data: await erpRequest('/materials') });
      if (route === '/api/demo/erp' && req.method === 'POST') {
        if (!demoMode) throw new HttpError(404, 'NOT_FOUND', 'Demo controls are disabled.');
        if (actor.role !== 'admin')
          throw new HttpError(403, 'FORBIDDEN', 'Only an admin can simulate an outage.');
        const body = await jsonBody(req);
        if (!Number.isInteger(body.failNext) || body.failNext < 0 || body.failNext > 5)
          throw new HttpError(422, 'INVALID_CONTROL', 'failNext must be 0 to 5.');
        return json(res, 200, {
          data: await erpRequest('/control', 'POST', { failNext: body.failNext }),
        });
      }
      throw new HttpError(404, 'NOT_FOUND', 'Endpoint not found.');
    } catch (error) {
      metrics.errors++;
      const status =
        error.status ??
        (error.name === 'TimeoutError' ||
        (error instanceof TypeError && error.message.includes('fetch'))
          ? 502
          : 500);
      if (status >= 500)
        logger({
          event: 'error',
          requestId,
          code: error.code ?? 'INTERNAL_ERROR',
          message: error.message,
        });
      if (!res.headersSent)
        json(res, status, {
          error: {
            code: error.code ?? (status === 502 ? 'ERP_UNAVAILABLE' : 'INTERNAL_ERROR'),
            message: error.status
              ? error.message
              : status === 502
                ? 'ERP connection unavailable.'
                : 'An internal error occurred.',
            details: error.details ?? null,
          },
          requestId,
        });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  if (startWorker) worker.start();
  return {
    server,
    store,
    auth,
    worker,
    close: async () => {
      await worker.stop();
      await new Promise((resolveClose) => server.close(resolveClose));
      store.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = createApplication({
    path: process.env.DB_PATH ?? 'data/atlas.sqlite',
    seed: process.env.SEED_DEMO !== 'false',
    demoMode: process.env.DEMO_MODE !== 'false',
    erpUrl: process.env.ERP_URL ?? 'http://127.0.0.1:8081',
    erpToken: process.env.ERP_TOKEN ?? 'atlas-local-demo-token',
    workerInterval: Number(process.env.WORKER_INTERVAL_MS ?? 1500),
    secureCookies: process.env.SECURE_COOKIES === 'true',
    adminPassword: process.env.ADMIN_PASSWORD,
    logger: (value) => console.log(JSON.stringify(value)),
  });
  const port = Number(process.env.PORT ?? 8080);
  app.server.listen(port, process.env.HOST ?? '127.0.0.1', () =>
    console.log(
      JSON.stringify({ event: 'atlas_started', port, demoMode: process.env.DEMO_MODE !== 'false' }),
    ),
  );
  const shutdown = () => app.close().then(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
