// Passwords (PBKDF2-SHA256) and cookie sessions. Only token hashes are stored.
const ITERATIONS = 100_000; // Workers' Web Crypto maximum for PBKDF2.
const SESSION_MS = 30 * 24 * 3600_000;
const COOKIE = '__Host-sid';
const FAIL_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;

const enc = new TextEncoder();
const DUMMY_USER = { pw_salt: '00'.repeat(16), pw_hash: '' };
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

export async function hashPassword(password, saltHex = randomHex(16)) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/../g), (h) => parseInt(h, 16));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return { hash: hex(bits), salt: saltHex };
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Constant-time check of a password against a user row.
export async function verifyPassword(password, user) {
  const { hash } = await hashPassword(password, user.pw_salt);
  return equal(hash, user.pw_hash);
}

const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

// Returns the user row, or null. Hashes even for unknown emails so timing reveals nothing.
export async function checkLogin(db, email, password, now) {
  const { n } = await db.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE email = ? AND at > ?')
    .bind(email, now - FAIL_WINDOW_MS).first();
  if (n >= MAX_FAILURES) return { locked: true };

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (await verifyPassword(password, user || DUMMY_USER) && user) return { user };

  await db.batch([
    db.prepare('INSERT INTO login_failures (email, at) VALUES (?, ?)').bind(email, now),
    db.prepare('DELETE FROM login_failures WHERE at < ?').bind(now - 24 * 3600_000),
  ]);
  return {};
}

export async function createSession(db, userId, now) {
  const token = randomHex(32);
  await db.batch([
    db.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256(token), userId, now + SESSION_MS),
    db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').bind(now),
  ]);
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`;
}

function readToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)__Host-sid=([0-9a-f]{64})(?:;|$)/);
  return m ? m[1] : null;
}

export async function currentUser(db, request, now) {
  const token = readToken(request);
  if (!token) return null;
  return db.prepare(
    `SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), now).first();
}

export async function destroySession(db, request) {
  const token = readToken(request);
  if (token) await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// Used when a password changes: log the user out everywhere.
export const revokeAll = (db, userId) =>
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(userId);

export const randomPassword = () => randomHex(6);
