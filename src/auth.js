import { randomBytes, scryptSync, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const ttl = 8 * 60 * 60 * 1000;

export class Auth {
  constructor(db, { demoMode = true, adminPassword } = {}) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, role TEXT NOT NULL,
      password_hash TEXT NOT NULL, salt TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
    ); CREATE TABLE IF NOT EXISTS auth_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    const previousMode = db
      .prepare("SELECT value FROM auth_metadata WHERE key = 'mode'")
      .get()?.value;
    if (
      !demoMode &&
      (previousMode === 'demo' ||
        db.prepare("SELECT id FROM users WHERE username IN ('steward', 'reviewer') LIMIT 1").get())
    ) {
      throw new Error(
        'This database contains demo identities. Use a fresh database with DEMO_MODE=false.',
      );
    }
    db.prepare("INSERT OR IGNORE INTO auth_metadata VALUES ('mode', ?)").run(
      demoMode ? 'demo' : 'custom',
    );
    if (demoMode) {
      for (const role of ['steward', 'reviewer', 'admin'])
        this.addUser(role, role, 'AtlasDemo!2026');
    } else if (adminPassword && adminPassword.length >= 16) {
      this.addUser('admin', 'admin', adminPassword);
    } else if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
      throw new Error('Without DEMO_MODE, provision ADMIN_PASSWORD with at least 16 characters.');
    }
  }
  addUser(username, role, password) {
    if (this.db.prepare('SELECT id FROM users WHERE username = ?').get(username)) return;
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    this.db
      .prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)')
      .run(username, username, role, hash, salt);
  }
  async login(username, password) {
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      username.length > 80 ||
      password.length > 256
    )
      return null;
    const user = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    // Perform the same costly derivation even for unknown users.
    const candidate = await derive(password, user?.salt ?? 'atlas-unknown-user', 64);
    const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
    if (!timingSafeEqual(candidate, expected) || !user) return null;
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    this.db
      .prepare('INSERT INTO sessions VALUES (?, ?, ?)')
      .run(digest(token), user.id, Date.now() + ttl);
    return { token, actor: { id: user.id, username: user.username, role: user.role } };
  }
  session(token) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const user = this.db
      .prepare(
        `SELECT u.id, u.username, u.role FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(digest(token), Date.now());
    return user ? { ...user } : null;
  }
  logout(token) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
  }
}

export function readCookie(req) {
  const match = (req.headers.cookie ?? '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('atlas_session='));
  return match?.slice('atlas_session='.length) ?? '';
}

export function sessionCookie(token, secure = false) {
  return `atlas_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? ttl / 1000 : 0}${secure ? '; Secure' : ''}`;
}
