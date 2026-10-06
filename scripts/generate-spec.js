import { writeFileSync } from 'node:fs';

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const string = { type: 'string' };
const integer = { type: 'integer' };
const response = (name, array = false) => ({
  description: 'Success',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: { data: array ? { type: 'array', items: ref(name) } : ref(name) },
        required: ['data'],
      },
    },
  },
});
const body = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 413, 415, 422, 429, 502].map((status) => [
    status,
    { description: 'Structured error', content: { 'application/json': { schema: ref('Error') } } },
  ]),
);
const header = {
  in: 'header',
  name: 'X-Atlas-Request',
  required: true,
  schema: { type: 'string', const: 'true' },
  description: 'CSRF protection; required on mutations, including login.',
};
const id = { in: 'path', name: 'id', required: true, schema: string };
const query = (name, schema = string) => ({ in: 'query', name, schema });
const operation = (summary, tag, schema, extra = {}) => ({
  summary,
  tags: [tag],
  responses: { 200: response(schema), ...errors },
  ...extra,
});
const productFields = Object.fromEntries(
  ['sku', 'name', 'manufacturer', 'mpn', 'supplierId', 'categoryId', 'gtin', 'source'].map(
    (field) => [field, string],
  ),
);
productFields.uom = { type: 'string', enum: ['EA', 'FT', 'M'] };
productFields.voltage = { type: ['number', 'null'] };
const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Atlas MDM API',
    version: '1.0.0',
    description:
      'Local portfolio demo. Cookie sessions. Mutations require X-Atlas-Request: true. Domain draft records may retain quality errors; workflow gates enforce correctness. ERP is a simulation.',
  },
  servers: [{ url: 'http://localhost:8080' }],
  security: [{ session: [] }],
  paths: {
    '/api/login': {
      post: operation('Sign in', 'Session', 'Actor', {
        security: [],
        parameters: [header],
        requestBody: body({
          type: 'object',
          required: ['username', 'password'],
          properties: { username: string, password: { type: 'string', format: 'password' } },
        }),
      }),
    },
    '/api/session': { get: operation('Current identity', 'Session', 'Actor') },
    '/api/logout': {
      post: operation('Invalidate the session', 'Session', 'Object', { parameters: [header] }),
    },
    '/api/dashboard': { get: operation('Catalog quality and job summary', 'Catalog', 'Dashboard') },
    '/api/reference': {
      get: operation('Supplier/category reference data and units', 'Catalog', 'Reference'),
    },
    '/api/products': {
      get: operation('Search the catalog', 'Catalog', 'Product', {
        parameters: [
          query('search'),
          query('status', { type: 'string', enum: ['Draft', 'InReview', 'Approved', 'Published'] }),
        ],
        responses: { 200: response('Product', true), ...errors },
      }),
      post: operation('Create a Draft (steward/admin)', 'Catalog', 'Product', {
        parameters: [header],
        requestBody: body(ref('ProductInput')),
        responses: { 201: response('Product'), ...errors },
      }),
    },
    '/api/products/{id}': {
      get: operation('Get product with calculated quality', 'Catalog', 'Product', {
        parameters: [id],
      }),
      put: operation(
        'Edit a Draft using optimistic version (steward/admin)',
        'Catalog',
        'Product',
        {
          parameters: [id, header],
          requestBody: body({
            type: 'object',
            additionalProperties: false,
            required: ['version'],
            properties: { ...productFields, version: { type: 'integer', minimum: 1 } },
          }),
        },
      ),
    },
    '/api/products/{id}/transitions': {
      post: operation('Apply a governed workflow transition', 'Workflow', 'Product', {
        parameters: [id, header],
        requestBody: body({
          type: 'object',
          required: ['action', 'version'],
          properties: {
            action: { type: 'string', enum: ['submit', 'approve', 'reject', 'publish', 'reopen'] },
            version: { type: 'integer', minimum: 1 },
            comment: { type: 'string', maxLength: 2000, description: 'Required for rejection.' },
          },
        }),
      }),
    },
    '/api/imports': {
      post: operation(
        'Atomic supplier import or preview (steward/admin)',
        'Integration',
        'ImportResult',
        {
          parameters: [header],
          requestBody: body({
            type: 'object',
            required: ['format', 'content'],
            properties: {
              format: { type: 'string', enum: ['json', 'csv', 'xml'] },
              content: string,
              dryRun: { type: 'boolean', default: false },
            },
          }),
        },
      ),
    },
    '/api/exports': {
      get: {
        summary: 'Download Published products only',
        tags: ['Integration'],
        parameters: [
          query('format', { type: 'string', enum: ['json', 'csv', 'xml'], default: 'json' }),
        ],
        responses: {
          200: {
            description: 'Attachment',
            content: Object.fromEntries(
              ['application/json', 'text/csv', 'application/xml'].map((type) => [
                type,
                { schema: string },
              ]),
            ),
          },
          ...errors,
        },
      },
    },
    '/api/audit': {
      get: operation('Immutable change history', 'Governance', 'Audit', {
        parameters: [query('productId')],
        responses: { 200: response('Audit', true), ...errors },
      }),
    },
    '/api/jobs': {
      get: operation('Recent 200 outbox jobs', 'Operations', 'Job', {
        responses: { 200: response('Job', true), ...errors },
      }),
    },
    '/api/jobs/{id}/retry': {
      post: operation(
        'Replay Retry/DeadLetter job with its original key (admin)',
        'Operations',
        'Job',
        { parameters: [id, header] },
      ),
    },
    '/api/erp/materials': {
      get: operation('Inspect the simulated ERP receiver', 'Integration', 'Material', {
        responses: { 200: response('Material', true), ...errors },
      }),
    },
    '/api/demo/erp': {
      post: operation('Fail the next N ERP deliveries (admin, demo mode)', 'Operations', 'Object', {
        parameters: [header],
        requestBody: body({
          type: 'object',
          required: ['failNext'],
          properties: { failNext: { type: 'integer', minimum: 0, maximum: 5 } },
        }),
      }),
    },
    '/health/live': {
      get: { summary: 'Process liveness', security: [], responses: { 200: response('Object') } },
    },
    '/health/ready': {
      get: {
        summary: 'Database readiness (ERP tracked independently in jobs)',
        security: [],
        responses: { 200: response('Object'), 500: errors[502] },
      },
    },
    '/metrics': {
      get: {
        summary: 'Prometheus text metrics; counters reset on restart',
        security: [],
        responses: {
          200: { description: 'Metrics', content: { 'text/plain': { schema: string } } },
        },
      },
    },
    '/api/spec': {
      get: {
        summary: 'This OpenAPI document',
        security: [],
        responses: {
          200: {
            description: 'OpenAPI 3.1',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'atlas_session' } },
    schemas: {
      Object: { type: 'object' },
      Actor: {
        type: 'object',
        properties: {
          id: string,
          username: string,
          role: { type: 'string', enum: ['steward', 'reviewer', 'admin'] },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: { code: string, message: string, details: {} },
            required: ['code', 'message'],
          },
          requestId: string,
        },
      },
      Quality: {
        type: 'object',
        properties: {
          score: { type: 'number', minimum: 0, maximum: 100 },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rule: string,
                field: string,
                message: string,
                severity: { type: 'string', enum: ['error', 'warning'] },
              },
            },
          },
        },
      },
      ProductInput: {
        type: 'object',
        additionalProperties: false,
        properties: productFields,
        description:
          'Blank catalog fields are retained as Draft quality issues. Wrong types and unknown properties are rejected.',
      },
      Product: {
        type: 'object',
        properties: {
          ...productFields,
          id: string,
          status: { type: 'string', enum: ['Draft', 'InReview', 'Approved', 'Published'] },
          version: integer,
          createdBy: string,
          updatedBy: string,
          approvedBy: { type: ['string', 'null'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          quality: ref('Quality'),
        },
      },
      Dashboard: {
        type: 'object',
        properties: {
          totalProducts: integer,
          averageQuality: integer,
          byStatus: {
            type: 'object',
            properties: {
              Draft: integer,
              InReview: integer,
              Approved: integer,
              Published: integer,
            },
          },
          pendingJobs: integer,
          failedJobs: integer,
        },
      },
      Reference: {
        type: 'object',
        properties: {
          suppliers: {
            type: 'array',
            items: { type: 'object', properties: { id: string, name: string, code: string } },
          },
          categories: {
            type: 'array',
            items: { type: 'object', properties: { id: string, name: string, erpCode: string } },
          },
          units: { type: 'array', items: string },
        },
      },
      ImportResult: {
        type: 'object',
        properties: {
          total: integer,
          created: integer,
          dryRun: { type: 'boolean' },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              properties: { row: integer, sku: string, quality: ref('Quality') },
            },
          },
        },
      },
      Audit: {
        type: 'object',
        properties: {
          id: string,
          productId: string,
          actor: ref('Actor'),
          action: string,
          before: { anyOf: [ref('Product'), { type: 'null' }] },
          after: { type: ['object', 'null'] },
          comment: string,
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Job: {
        type: 'object',
        properties: {
          id: string,
          productId: string,
          productVersion: integer,
          status: { type: 'string', enum: ['Pending', 'Retry', 'Delivered', 'DeadLetter'] },
          attempts: integer,
          nextAttemptAt: string,
          lastError: { type: ['string', 'null'] },
          createdAt: string,
          updatedAt: string,
          deliveredAt: { type: ['string', 'null'] },
        },
      },
      Material: {
        type: 'object',
        properties: {
          MATNR: string,
          MAKTX: string,
          MEINS: string,
          MATKL: string,
          MFRNR: string,
          MFRPN: string,
          VOLTAGE: { type: ['number', 'null'] },
          GTIN: string,
          sourceVersion: integer,
          receivedAt: string,
        },
      },
    },
  },
};
writeFileSync(
  new URL('../docs/openapi.json', import.meta.url),
  JSON.stringify(spec, null, 2) + '\n',
);
console.log('OpenAPI contract generated.');
