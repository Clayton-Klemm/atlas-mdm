import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const EDITABLE = [
  'sku',
  'name',
  'manufacturer',
  'mpn',
  'supplierId',
  'categoryId',
  'uom',
  'voltage',
  'gtin',
  'source',
];
const STATUSES = ['Draft', 'InReview', 'Approved', 'Published'];
const SUPPLIERS = [
  { id: 'SUP-001', name: 'Prairie Supply Cooperative', code: 'PRAIRIE' },
  { id: 'SUP-002', name: 'Northline Electrical Wholesale', code: 'NORTHLINE' },
  { id: 'SUP-003', name: 'Redwood Industrial Distribution', code: 'REDWOOD' },
];
const CATEGORIES = [
  { id: 'CIRCUIT_BREAKERS', name: 'Circuit breakers', erpCode: 'CBRK' },
  { id: 'WIRE_CABLE', name: 'Wire and cable', erpCode: 'WIRE' },
  { id: 'LIGHTING', name: 'Lighting', erpCode: 'LGHT' },
];
const identity = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();
const clean = (value) => value.normalize('NFC').trim().replace(/\s+/gu, ' ');
const timestamp = () => new Date().toISOString();

export class DomainError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const fail = (status, code, message, details) => {
  throw new DomainError(status, code, message, details);
};

function validGtin(value) {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop();
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Deterministic, inspectable business rules; drafts may carry these issues. */
export function evaluateQuality(product) {
  const issues = [];
  const add = (rule, field, message, severity = 'error') =>
    issues.push({ rule, field, message, severity });
  for (const field of ['sku', 'name', 'manufacturer', 'mpn', 'supplierId', 'categoryId', 'uom']) {
    if (typeof product[field] !== 'string' || !product[field].trim())
      add('required', field, `${field} is required.`);
  }
  if (product.sku && !/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(product.sku))
    add(
      'sku-format',
      'sku',
      'SKU must contain 3–32 uppercase letters, numbers or hyphens and start with a letter or number.',
    );
  if (product.name && product.name.length < 5)
    add('descriptive-name', 'name', 'Use a descriptive product name of at least 5 characters.');
  if (product.supplierId && !SUPPLIERS.some((item) => item.id === product.supplierId))
    add('supplier-reference', 'supplierId', 'Choose an existing supplier.');
  if (product.categoryId && !CATEGORIES.some((item) => item.id === product.categoryId))
    add('category-reference', 'categoryId', 'Choose an existing category.');
  if (product.uom && !['EA', 'FT', 'M'].includes(product.uom))
    add('unit-reference', 'uom', 'Unit of measure must be EA, FT or M.');
  if (product.categoryId === 'WIRE_CABLE' && product.uom && !['FT', 'M'].includes(product.uom))
    add('category-unit', 'uom', 'Wire and cable must be measured in FT or M.');
  if (
    ['CIRCUIT_BREAKERS', 'LIGHTING'].includes(product.categoryId) &&
    product.uom &&
    product.uom !== 'EA'
  )
    add('category-unit', 'uom', 'Circuit breakers and lighting must use EA.');
  if (
    ['CIRCUIT_BREAKERS', 'LIGHTING'].includes(product.categoryId) &&
    (product.voltage === null || product.voltage === undefined)
  )
    add('voltage-required', 'voltage', 'Voltage is required for circuit breakers and lighting.');
  if (
    product.voltage !== null &&
    product.voltage !== undefined &&
    (!Number.isFinite(product.voltage) || product.voltage <= 0 || product.voltage > 100000)
  )
    add('voltage-range', 'voltage', 'Voltage must be greater than 0 and at most 100,000 V.');
  if (product.gtin && !validGtin(product.gtin))
    add('gtin-checksum', 'gtin', 'GTIN must have 8, 12, 13 or 14 digits and a valid check digit.');
  return {
    score: Math.max(
      0,
      100 - issues.reduce((total, issue) => total + (issue.severity === 'error' ? 15 : 5), 0),
    ),
    issues,
  };
}

function requireRole(actor, roles) {
  if (
    !actor ||
    typeof actor.id !== 'string' ||
    !actor.id ||
    typeof actor.username !== 'string' ||
    !actor.username
  )
    fail(401, 'AUTH_REQUIRED', 'An authenticated actor is required.');
  if (!roles.includes(actor.role)) fail(403, 'FORBIDDEN', 'Your role cannot perform this action.');
}

function normalizeInput(input, base = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail(400, 'INVALID_PRODUCT', 'Product input must be an object.');
  const unknown = Object.keys(input).filter((field) => !EDITABLE.includes(field));
  if (unknown.length)
    fail(400, 'UNKNOWN_FIELDS', 'Product input contains fields that cannot be edited.', {
      fields: unknown,
    });
  const result = base
    ? Object.fromEntries(EDITABLE.map((field) => [field, base[field]]))
    : Object.fromEntries(EDITABLE.map((field) => [field, field === 'voltage' ? null : '']));
  for (const [field, value] of Object.entries(input)) {
    if (field === 'voltage') {
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value)))
        fail(400, 'INVALID_FIELD', 'voltage must be a finite number or null.', { field });
      result[field] = value;
    } else {
      if (typeof value !== 'string')
        fail(400, 'INVALID_FIELD', `${field} must be a string.`, { field });
      if (value.length > (field === 'name' ? 240 : field === 'source' ? 200 : 120))
        fail(400, 'INVALID_FIELD', `${field} exceeds its maximum length.`, { field });
      if (
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value) ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
      )
        fail(400, 'INVALID_FIELD', `${field} contains unsupported control or Unicode characters.`, {
          field,
        });
      result[field] = clean(value);
      if (['sku', 'uom', 'supplierId', 'categoryId'].includes(field))
        result[field] = result[field].normalize('NFKC').toUpperCase();
    }
  }
  if (!result.source) result.source = 'Manual entry';
  return result;
}

function parseCsv(content) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false,
    afterQuote = false;
  const endCell = () => {
    row.push(cell);
    cell = '';
    afterQuote = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
  };
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        afterQuote = true;
      } else cell += char;
    } else if (char === '"') {
      if (cell || afterQuote) fail(400, 'INVALID_CSV', 'Unexpected quote in CSV field.');
      quoted = true;
    } else if (char === ',') endCell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[index + 1] === '\n') index++;
      endRow();
    } else if (afterQuote)
      fail(400, 'INVALID_CSV', 'Characters after a quoted CSV field are not allowed.');
    else cell += char;
  }
  if (quoted) fail(400, 'INVALID_CSV', 'Unclosed quoted CSV field.');
  if (cell || row.length || afterQuote) endRow();
  if (!rows.length)
    fail(400, 'INVALID_CSV', 'CSV must have a header and at least one product row.');
  const headers = rows.shift().map((value) => value.trim());
  if (
    new Set(headers).size !== headers.length ||
    headers.some((value) => !EDITABLE.includes(value))
  )
    fail(400, 'INVALID_CSV', 'CSV headers must be unique editable product field names.');
  return rows.map((values, index) => {
    if (values.length !== headers.length)
      fail(400, 'INVALID_CSV', 'CSV row does not match its header.', {
        rows: [
          {
            row: index + 1,
            message: `Expected ${headers.length} columns, received ${values.length}.`,
          },
        ],
      });
    return Object.fromEntries(
      headers.map((field, position) => [
        field,
        field === 'voltage'
          ? values[position].trim() === ''
            ? null
            : Number(values[position])
          : values[position],
      ]),
    );
  });
}

function parseImport(content, format) {
  if (!['json', 'csv', 'xml'].includes(format))
    fail(400, 'INVALID_FORMAT', 'Supported import formats are json, csv and xml.');
  if (typeof content !== 'string' || !content.trim())
    fail(400, 'EMPTY_IMPORT', 'Import content is required.');
  if (Buffer.byteLength(content, 'utf8') > 1024 * 1024)
    fail(413, 'IMPORT_TOO_LARGE', 'Import content must be at most 1 MiB.');
  const text = content.replace(/^\uFEFF/u, '');
  let records;
  try {
    if (format === 'json') {
      const parsed = JSON.parse(text);
      records = Array.isArray(parsed)
        ? parsed
        : parsed && Object.keys(parsed).length === 1
          ? parsed.products
          : undefined;
    } else if (format === 'csv') records = parseCsv(text);
    else {
      if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text))
        fail(400, 'UNSAFE_XML', 'XML document types and entity declarations are not allowed.');
      const validation = XMLValidator.validate(text);
      if (validation !== true)
        fail(400, 'INVALID_XML', 'XML is not well formed.', { message: validation.err.msg });
      const parsed = new XMLParser({
        ignoreAttributes: false,
        parseTagValue: false,
        trimValues: true,
        processEntities: true,
        isArray: (name) => name === 'product',
      }).parse(text);
      const keys = Object.keys(parsed).filter((key) => key !== '?xml');
      if (
        keys.length !== 1 ||
        keys[0] !== 'products' ||
        !parsed.products ||
        Object.keys(parsed.products).some((key) => key !== 'product')
      )
        fail(400, 'INVALID_XML', 'XML must contain a products root with product elements.');
      records = parsed.products.product;
      if (Array.isArray(records))
        records = records.map((record) => {
          if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
          return Object.fromEntries(
            Object.entries(record).map(([field, value]) => [
              field,
              field === 'voltage' && typeof value === 'string'
                ? value.trim() === ''
                  ? null
                  : Number(value)
                : value,
            ]),
          );
        });
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    fail(400, 'INVALID_IMPORT', `Could not parse ${format.toUpperCase()} import.`);
  }
  if (!Array.isArray(records) || records.length < 1 || records.length > 100)
    fail(400, 'INVALID_BATCH', 'An import must contain 1–100 product records.');
  return records;
}

export class Store {
  constructor({ path, seed = true }) {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      'PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;',
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, erp_code TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, sku TEXT NOT NULL, sku_key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL, manufacturer TEXT NOT NULL, manufacturer_key TEXT NOT NULL, mpn TEXT NOT NULL, mpn_key TEXT NOT NULL,
        supplier_id TEXT NOT NULL, category_id TEXT NOT NULL, uom TEXT NOT NULL, voltage REAL, gtin TEXT NOT NULL, source TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('Draft','InReview','Approved','Published')), version INTEGER NOT NULL CHECK(version > 0),
        created_by TEXT NOT NULL, created_by_id TEXT NOT NULL, updated_by TEXT NOT NULL, updated_by_id TEXT NOT NULL, approved_by TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS product_manufacturer_mpn ON products(manufacturer_key, mpn_key) WHERE manufacturer_key <> '' AND mpn_key <> '';
      CREATE INDEX IF NOT EXISTS product_status ON products(status);
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
        before_json TEXT, after_json TEXT, comment TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audit_product ON audit_events(product_id, created_at);
      CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit records are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit records are immutable'); END;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL, product_version INTEGER NOT NULL, payload TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('Pending','Retry','Delivered','DeadLetter')), attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, delivered_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS job_product_version ON jobs(product_id, product_version);
      CREATE INDEX IF NOT EXISTS job_schedule ON jobs(status, next_attempt_at);
    `);
    this._transaction(() => {
      for (const item of SUPPLIERS)
        this.db
          .prepare('INSERT OR IGNORE INTO suppliers (id,name,code) VALUES (?,?,?)')
          .run(item.id, item.name, item.code);
      for (const item of CATEGORIES)
        this.db
          .prepare('INSERT OR IGNORE INTO categories (id,name,erp_code) VALUES (?,?,?)')
          .run(item.id, item.name, item.erpCode);
      if (seed && this.db.prepare('SELECT COUNT(*) AS count FROM products').get().count === 0)
        this._seed();
    });
  }

  close() {
    this.db.close();
  }

  _transaction(work) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  _map(row) {
    if (!row) return null;
    const product = {
      id: row.id,
      sku: row.sku,
      name: row.name,
      manufacturer: row.manufacturer,
      mpn: row.mpn,
      supplierId: row.supplier_id,
      categoryId: row.category_id,
      uom: row.uom,
      voltage: row.voltage,
      gtin: row.gtin,
      source: row.source,
      status: row.status,
      version: row.version,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      approvedBy: row.approved_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    product.quality = evaluateQuality(product);
    return product;
  }

  getProduct(id) {
    const product = this._map(this.db.prepare('SELECT * FROM products WHERE id = ?').get(id));
    if (!product) fail(404, 'PRODUCT_NOT_FOUND', 'Product was not found.');
    return product;
  }

  listProducts({ search = '', status = '' } = {}) {
    if (status && !STATUSES.includes(status))
      fail(400, 'INVALID_STATUS', 'Unknown product status.');
    if (typeof search !== 'string') fail(400, 'INVALID_SEARCH', 'Search must be a string.');
    let products = this.db
      .prepare('SELECT * FROM products ORDER BY updated_at DESC, sku')
      .all()
      .map((row) => this._map(row));
    if (status) products = products.filter((product) => product.status === status);
    if (search.trim()) {
      const term = identity(search);
      products = products.filter((product) =>
        ['sku', 'name', 'manufacturer', 'mpn'].some((field) =>
          identity(product[field]).includes(term),
        ),
      );
    }
    return products;
  }

  _checkIdentity(product, excludeId = '') {
    const duplicate = this.db
      .prepare(
        `SELECT id, sku FROM products WHERE id <> ? AND (sku_key = ? OR (manufacturer_key = ? AND mpn_key = ? AND manufacturer_key <> '' AND mpn_key <> '')) LIMIT 1`,
      )
      .get(excludeId, identity(product.sku), identity(product.manufacturer), identity(product.mpn));
    if (duplicate)
      fail(
        409,
        'DUPLICATE_IDENTITY',
        'A product with this SKU or manufacturer and part number already exists.',
        { productId: duplicate.id, sku: duplicate.sku },
      );
  }

  _audit(productId, actor, action, before, after, comment = '') {
    this.db
      .prepare(
        'INSERT INTO audit_events (id,product_id,actor,action,before_json,after_json,comment,created_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        randomUUID(),
        productId,
        JSON.stringify(actor),
        action,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        comment,
        timestamp(),
      );
  }

  _create(
    product,
    actor,
    { id = randomUUID(), status = 'Draft', comment = '', createdAt = timestamp() } = {},
  ) {
    this._checkIdentity(product);
    this.db
      .prepare(
        `INSERT INTO products (id,sku,sku_key,name,manufacturer,manufacturer_key,mpn,mpn_key,supplier_id,category_id,uom,voltage,gtin,source,status,version,created_by,created_by_id,updated_by,updated_by_id,approved_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        product.sku,
        identity(product.sku),
        product.name,
        product.manufacturer,
        identity(product.manufacturer),
        product.mpn,
        identity(product.mpn),
        product.supplierId,
        product.categoryId,
        product.uom,
        product.voltage,
        product.gtin,
        product.source,
        status,
        actor.username,
        actor.id,
        actor.username,
        actor.id,
        ['Approved', 'Published'].includes(status) ? 'reviewer' : null,
        createdAt,
        createdAt,
      );
    const result = this.getProduct(id);
    this._audit(id, actor, 'create', null, result, comment);
    return result;
  }

  createProduct(input, actor) {
    requireRole(actor, ['steward', 'admin']);
    const product = normalizeInput(input);
    return this._transaction(() => this._create(product, actor));
  }

  _checkVersion(product, expectedVersion) {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
      fail(400, 'VERSION_REQUIRED', 'A positive integer version is required.');
    if (product.version !== expectedVersion)
      fail(409, 'VERSION_CONFLICT', 'This product changed. Refresh it before saving.', {
        expectedVersion,
        currentVersion: product.version,
      });
  }

  updateProduct(id, input, expectedVersion, actor) {
    requireRole(actor, ['steward', 'admin']);
    return this._transaction(() => {
      const before = this.getProduct(id);
      this._checkVersion(before, expectedVersion);
      if (before.status !== 'Draft')
        fail(409, 'INVALID_STATE', 'Only Draft products can be edited. Reopen the record first.');
      const next = normalizeInput(input, before);
      this._checkIdentity(next, id);
      this.db
        .prepare(
          `UPDATE products SET sku=?,sku_key=?,name=?,manufacturer=?,manufacturer_key=?,mpn=?,mpn_key=?,supplier_id=?,category_id=?,uom=?,voltage=?,gtin=?,source=?,version=version+1,updated_by=?,updated_by_id=?,approved_by=NULL,updated_at=? WHERE id=?`,
        )
        .run(
          next.sku,
          identity(next.sku),
          next.name,
          next.manufacturer,
          identity(next.manufacturer),
          next.mpn,
          identity(next.mpn),
          next.supplierId,
          next.categoryId,
          next.uom,
          next.voltage,
          next.gtin,
          next.source,
          actor.username,
          actor.id,
          timestamp(),
          id,
        );
      const after = this.getProduct(id);
      this._audit(id, actor, 'update', before, after);
      return after;
    });
  }

  transition(id, action, expectedVersion, actor, comment = '') {
    const rules = {
      submit: { from: ['Draft'], to: 'InReview', roles: ['steward', 'admin'] },
      approve: { from: ['InReview'], to: 'Approved', roles: ['reviewer', 'admin'] },
      reject: { from: ['InReview'], to: 'Draft', roles: ['reviewer', 'admin'] },
      publish: { from: ['Approved'], to: 'Published', roles: ['reviewer', 'admin'] },
      reopen: { from: ['Approved', 'Published'], to: 'Draft', roles: ['steward', 'admin'] },
    };
    const rule = Object.hasOwn(rules, action) ? rules[action] : null;
    if (!rule) fail(400, 'INVALID_ACTION', 'Unknown workflow action.');
    requireRole(actor, rule.roles);
    if (typeof comment !== 'string' || comment.length > 2000)
      fail(400, 'INVALID_COMMENT', 'Comment must be text of at most 2,000 characters.');
    comment = comment.normalize('NFC').trim();
    if (action === 'reject' && !comment)
      fail(400, 'COMMENT_REQUIRED', 'A rejection comment is required.');
    return this._transaction(() => {
      const before = this.getProduct(id);
      this._checkVersion(before, expectedVersion);
      if (!rule.from.includes(before.status))
        fail(409, 'INVALID_STATE', `Cannot ${action} a product in ${before.status}.`);
      if (
        ['submit', 'approve', 'publish'].includes(action) &&
        before.quality.issues.some((issue) => issue.severity === 'error')
      )
        fail(422, 'QUALITY_GATE', `Resolve the quality issues before you ${action} this product.`, {
          quality: before.quality,
        });
      if (action === 'approve') {
        const row = this.db
          .prepare('SELECT created_by_id, updated_by_id FROM products WHERE id = ?')
          .get(id);
        if (
          actor.id === row.created_by_id ||
          actor.id === row.updated_by_id ||
          actor.username === before.createdBy ||
          actor.username === before.updatedBy
        )
          fail(
            403,
            'MAKER_CHECKER',
            'The creator and last editor cannot approve their own product.',
          );
      }
      const approvedBy =
        action === 'approve'
          ? actor.username
          : ['reopen', 'reject'].includes(action)
            ? null
            : before.approvedBy;
      this.db
        .prepare(
          'UPDATE products SET status=?,version=version+1,approved_by=?,updated_at=? WHERE id=?',
        )
        .run(rule.to, approvedBy, timestamp(), id);
      const after = this.getProduct(id);
      this._audit(id, actor, action, before, after, comment);
      if (action === 'publish') this._enqueue(after);
      return after;
    });
  }

  _enqueue(product) {
    const now = timestamp();
    this.db
      .prepare(
        'INSERT INTO jobs (id,product_id,product_version,payload,status,attempts,next_attempt_at,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?,?)',
      )
      .run(
        randomUUID(),
        product.id,
        product.version,
        JSON.stringify(product),
        'Pending',
        now,
        now,
        now,
      );
  }

  referenceData() {
    return {
      suppliers: this.db.prepare('SELECT id,name,code FROM suppliers ORDER BY id').all(),
      categories: this.db
        .prepare('SELECT id,name,erp_code AS erpCode FROM categories ORDER BY id')
        .all(),
      units: ['EA', 'FT', 'M'],
    };
  }

  dashboard() {
    const products = this.listProducts();
    const byStatus = Object.fromEntries(
      STATUSES.map((status) => [
        status,
        products.filter((product) => product.status === status).length,
      ]),
    );
    return {
      totalProducts: products.length,
      averageQuality: products.length
        ? Math.round(
            products.reduce((total, product) => total + product.quality.score, 0) / products.length,
          )
        : 0,
      byStatus,
      pendingJobs: this.db
        .prepare("SELECT COUNT(*) AS count FROM jobs WHERE status IN ('Pending','Retry')")
        .get().count,
      failedJobs: this.db
        .prepare("SELECT COUNT(*) AS count FROM jobs WHERE status = 'DeadLetter'")
        .get().count,
    };
  }

  audit({ productId } = {}) {
    const rows = productId
      ? this.db
          .prepare(
            'SELECT * FROM audit_events WHERE product_id = ? ORDER BY created_at DESC, rowid DESC',
          )
          .all(productId)
      : this.db.prepare('SELECT * FROM audit_events ORDER BY created_at DESC, rowid DESC').all();
    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      actor: JSON.parse(row.actor),
      action: row.action,
      before: row.before_json ? JSON.parse(row.before_json) : null,
      after: row.after_json ? JSON.parse(row.after_json) : null,
      comment: row.comment,
      createdAt: row.created_at,
    }));
  }

  importProducts(content, format, actor, { dryRun = false } = {}) {
    requireRole(actor, ['steward', 'admin']);
    if (typeof dryRun !== 'boolean') fail(400, 'INVALID_DRY_RUN', 'dryRun must be a boolean.');
    const records = parseImport(content, format);
    const products = [],
      errors = [],
      skuKeys = new Set(),
      partKeys = new Set();
    for (let index = 0; index < records.length; index++) {
      try {
        const product = normalizeInput(records[index]);
        this._checkIdentity(product);
        const skuKey = identity(product.sku),
          partKey = `${identity(product.manufacturer)}\u0000${identity(product.mpn)}`;
        if (skuKeys.has(skuKey) || (product.manufacturer && product.mpn && partKeys.has(partKey)))
          fail(
            409,
            'DUPLICATE_IDENTITY',
            'This batch contains a duplicate SKU or manufacturer and part number.',
          );
        skuKeys.add(skuKey);
        if (product.manufacturer && product.mpn) partKeys.add(partKey);
        products.push(product);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        errors.push({
          row: index + 1,
          code: error.code,
          message: error.message,
          details: error.details,
        });
      }
    }
    if (errors.length)
      fail(
        errors.some((error) => error.code === 'DUPLICATE_IDENTITY') ? 409 : 400,
        'IMPORT_REJECTED',
        'The entire import was rejected. Correct the reported rows and try again.',
        { rows: errors },
      );
    const rows = products.map((product, index) => ({
      row: index + 1,
      sku: product.sku,
      quality: evaluateQuality(product),
    }));
    if (!dryRun)
      this._transaction(() => {
        for (const product of products)
          this._create(product, actor, { comment: `Imported from ${format.toUpperCase()}` });
      });
    return { total: products.length, created: dryRun ? 0 : products.length, dryRun, rows };
  }

  exportProducts(format) {
    if (!['json', 'csv', 'xml'].includes(format))
      fail(400, 'INVALID_FORMAT', 'Supported export formats are json, csv and xml.');
    const fields = ['id', ...EDITABLE, 'status', 'version'];
    const products = this.listProducts({ status: 'Published' }).map((product) =>
      Object.fromEntries(fields.map((field) => [field, product[field]])),
    );
    if (format === 'json') return JSON.stringify(products, null, 2);
    if (format === 'csv') {
      const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      return `${fields.map(quote).join(',')}\r\n${products
        .map((product) =>
          fields
            .map((field) => {
              let value = product[field];
              // Prevent spreadsheet formulas in an export opened by a recruiter.
              if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) value = `'${value}`;
              return quote(value);
            })
            .join(','),
        )
        .join('\r\n')}\r\n`;
    }
    const escape = (value) =>
      String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<products>\n${products.map((product) => `  <product>\n${fields.map((field) => `    <${field}>${escape(product[field])}</${field}>`).join('\n')}\n  </product>`).join('\n')}\n</products>\n`;
  }

  _seed() {
    const actor = { id: 'steward', username: 'steward', role: 'steward' };
    const seeds = [
      {
        id: 'PRD-1001',
        status: 'Published',
        sku: 'CB-20A-1P',
        name: '20 A single-pole thermal circuit breaker',
        manufacturer: 'PrairieVolt',
        mpn: 'PV-CB20-1P',
        supplierId: 'SUP-001',
        categoryId: 'CIRCUIT_BREAKERS',
        uom: 'EA',
        voltage: 120,
      },
      {
        id: 'PRD-1002',
        status: 'Published',
        sku: 'WIRE-THHN-12',
        name: '12 AWG black THHN copper building wire',
        manufacturer: 'Northstar Cableworks',
        mpn: 'NC-THHN12-BK',
        supplierId: 'SUP-002',
        categoryId: 'WIRE_CABLE',
        uom: 'FT',
        voltage: 600,
      },
      {
        id: 'PRD-1003',
        status: 'Approved',
        sku: 'LED-HB-150',
        name: '150 W LED industrial high-bay fixture',
        manufacturer: 'LumenForge',
        mpn: 'LF-HB150-5K',
        supplierId: 'SUP-003',
        categoryId: 'LIGHTING',
        uom: 'EA',
        voltage: 277,
      },
      {
        id: 'PRD-1004',
        status: 'InReview',
        sku: 'CB-60A-2P',
        name: '60 A double-pole molded case circuit breaker',
        manufacturer: 'PrairieVolt',
        mpn: 'PV-CB60-2P',
        supplierId: 'SUP-001',
        categoryId: 'CIRCUIT_BREAKERS',
        uom: 'EA',
        voltage: 240,
      },
      {
        id: 'PRD-1005',
        status: 'Draft',
        sku: 'LED-PNL-40',
        name: '40 W LED recessed panel, neutral white',
        manufacturer: 'LumenForge',
        mpn: 'LF-PNL40-4K',
        supplierId: 'SUP-003',
        categoryId: 'LIGHTING',
        uom: 'EA',
        voltage: 120,
      },
      {
        id: 'PRD-1006',
        status: 'Draft',
        sku: 'WIRE-BARE-4',
        name: 'Wire',
        manufacturer: 'Northstar Cableworks',
        mpn: 'NC-BARE4',
        supplierId: 'SUP-002',
        categoryId: 'WIRE_CABLE',
        uom: 'EA',
        voltage: null,
        gtin: '123456789012',
      },
    ];
    for (const [index, seed] of seeds.entries()) {
      const { id, status, ...input } = seed;
      const product = this._create(
        normalizeInput({ ...input, gtin: input.gtin ?? '', source: 'Fictional demo seed' }),
        actor,
        {
          id,
          status,
          comment: 'Demo seed: fictional product and supplier data.',
          createdAt: new Date(Date.now() - (seeds.length - index) * 3600000).toISOString(),
        },
      );
      if (status === 'Published') this._enqueue(product);
    }
  }
}
