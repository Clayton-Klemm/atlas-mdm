import { randomUUID } from 'node:crypto';

export function mapMaterial(product) {
  return {
    MATNR: product.sku,
    MAKTX: product.name,
    MEINS: product.uom,
    MATKL: product.categoryId,
    MFRNR: product.manufacturer,
    MFRPN: product.mpn,
    VOLTAGE: product.voltage,
    GTIN: product.gtin,
    sourceVersion: product.version,
  };
}

export function jobView(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productVersion: row.product_version,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deliveredAt: row.delivered_at,
  };
}

export class JobWorker {
  constructor(db, { erpUrl, erpToken, interval = 1500, maxAttempts = 5, fetchFn = fetch }) {
    this.db = db;
    this.erpUrl = erpUrl;
    this.erpToken = erpToken;
    this.interval = interval;
    this.maxAttempts = maxAttempts;
    this.fetchFn = fetchFn;
    this.busy = false;
    this.counters = { delivered: 0, failed: 0 };
  }
  start() {
    this.timer = setInterval(
      () =>
        this.tick().catch((error) =>
          console.error(
            JSON.stringify({ level: 'error', event: 'worker_error', message: error.message }),
          ),
        ),
      this.interval,
    );
    this.timer.unref();
  }
  async stop() {
    clearInterval(this.timer);
    if (this.active) await this.active;
  }
  tick() {
    if (this.busy) return Promise.resolve();
    this.busy = true;
    this.active = this.process().finally(() => {
      this.busy = false;
    });
    return this.active;
  }
  async process() {
    const rows = this.db
      .prepare(
        `SELECT * FROM jobs WHERE status IN ('Pending', 'Retry')
      AND next_attempt_at <= ? ORDER BY created_at LIMIT 10`,
      )
      .all(new Date().toISOString());
    for (const row of rows) {
      const now = new Date().toISOString();
      const attempts = row.attempts + 1;
      // Retain Pending/Retry until acknowledgement. A crash is safe to replay with the same key.
      this.db
        .prepare('UPDATE jobs SET attempts = ?, updated_at = ? WHERE id = ?')
        .run(attempts, now, row.id);
      try {
        const response = await this.fetchFn(`${this.erpUrl}/materials`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.erpToken}`,
            'Idempotency-Key': row.id,
          },
          body: JSON.stringify(mapMaterial(JSON.parse(row.payload))),
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) throw new Error(`ERP HTTP ${response.status}`);
        const result = await response.json();
        if (
          result.data?.idempotencyKey !== row.id ||
          result.data?.MATNR !== JSON.parse(row.payload).sku ||
          result.data?.sourceVersion !== row.product_version
        )
          throw new Error('ERP acknowledgement mismatch');
        const delivered = new Date().toISOString();
        this.db
          .prepare(
            `UPDATE jobs SET status = 'Delivered', delivered_at = ?, updated_at = ?, last_error = NULL WHERE id = ?`,
          )
          .run(delivered, delivered, row.id);
        this.counters.delivered++;
      } catch (error) {
        const status = attempts >= this.maxAttempts ? 'DeadLetter' : 'Retry';
        const next = new Date(Date.now() + Math.min(30000, 1000 * 2 ** attempts)).toISOString();
        const message = error.message.startsWith('ERP ')
          ? error.message
          : 'ERP connection unavailable or timed out';
        this.db
          .prepare(
            `UPDATE jobs SET status = ?, next_attempt_at = ?, last_error = ?, updated_at = ? WHERE id = ?`,
          )
          .run(status, next, message, new Date().toISOString(), row.id);
        this.counters.failed++;
      }
    }
  }
  list() {
    return this.db
      .prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 200')
      .all()
      .map(jobView);
  }
  retry(id, actor) {
    if (this.busy) return { error: 'busy' };
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    if (!row) return null;
    if (!['Retry', 'DeadLetter'].includes(row.status)) return { error: 'state' };
    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `UPDATE jobs SET status = 'Pending', attempts = 0, last_error = NULL, next_attempt_at = ?, updated_at = ? WHERE id = ?`,
        )
        .run(now, now, id);
      this.db
        .prepare(
          'INSERT INTO audit_events (id, product_id, actor, action, before_json, after_json, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          randomUUID(),
          row.product_id,
          JSON.stringify(actor),
          'IntegrationRetry',
          null,
          JSON.stringify({ jobId: id }),
          'Operator requested replay with original idempotency key.',
          now,
        );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return jobView(this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id));
  }
}
