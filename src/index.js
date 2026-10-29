// CSA Tennis: one Worker serving pages, a read-only JSON API and D1.
import { htmlResponse, jsonResponse, redirect, safePath, sameOrigin, readForm } from './http.js';
import { checkLogin, createSession, currentUser, destroySession, hashPassword, randomPassword, revokeAll, verifyPassword } from './auth.js';
import { currentEvent, eventStatus, manilaDate, MAX_GUESTS, PLAYERS_PER_COURT } from './schedule.js';
import { QUESTIONS, ratingDeltas, startingRating } from './rating.js';
import * as view from './views.js';

const DAY = 24 * 3600_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCORE_RE = /^[0-9\-\s(),/]*$/;

// ---------- input helpers ----------

const text = (form, key, max) => {
  const v = (form.get(key) || '').trim().replace(/\s+/g, ' ');
  return v.length > 0 && v.length <= max ? v : null;
};
const int = (form, key, min, max) => {
  const s = form.get(key);
  if (!s || !/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
};
const email = (form) => {
  const v = (form.get('email') || '').trim().toLowerCase();
  return v.length <= 254 && EMAIL_RE.test(v) ? v : null;
};
const password = (form, key) => {
  const v = form.get(key) || '';
  return v.length >= 10 && v.length <= 128 ? v : null;
};
const isConstraintError = (e) => String(e && e.message).includes('UNIQUE constraint failed');

// ---------- data ----------

async function loadEventView(db, now) {
  const ev = currentEvent(now);
  const [, sel] = await db.batch([
    db.prepare('INSERT OR IGNORE INTO events (date) VALUES (?)').bind(ev.date),
    db.prepare('SELECT * FROM events WHERE date = ?').bind(ev.date),
  ]);
  const event = sel.results[0];
  const { results: regs } = await db.prepare(
    `SELECT r.id, r.user_id, r.guest_name, r.paid, u.name, u.rating
     FROM registrations r JOIN users u ON u.id = r.user_id
     WHERE r.event_id = ? ORDER BY r.id`,
  ).bind(event.id).all();
  const cap = event.courts * PLAYERS_PER_COURT;
  const confirmed = regs.slice(0, cap);
  const waitlist = regs.slice(cap);
  const share = event.cost_cents && confirmed.length ? Math.ceil(event.cost_cents / confirmed.length) : 0;
  return { ev, event, status: eventStatus(ev, event.cancelled, now), confirmed, waitlist, cap, share };
}

// Withdrawing yourself also withdraws your guests.
function removeRegistration(db, reg) {
  return reg.guest_name === null
    ? db.prepare('DELETE FROM registrations WHERE event_id = ? AND user_id = ?').bind(reg.event_id, reg.user_id).run()
    : db.prepare('DELETE FROM registrations WHERE id = ?').bind(reg.id).run();
}

// ---------- pages: public ----------

async function home(c) {
  const d = await loadEventView(c.db, c.now);
  return c.page('Monday tennis', view.homePage({ ...d, user: c.user }));
}

function loginPage(c) {
  if (c.user) return redirect('/');
  return c.page('Log in', view.loginPage(safePath(c.url.searchParams.get('next'))));
}

async function login(c) {
  const next = safePath(c.form.get('next'));
  const addr = email(c.form);
  const pw = c.form.get('password') || '';
  const back = (m) => redirect(`/login?m=${m}&next=${encodeURIComponent(next)}`);
  if (!addr || pw.length > 128) return back('login_failed');
  const result = await checkLogin(c.db, addr, pw, c.now);
  if (result.locked) return back('locked');
  if (!result.user) return back('login_failed');
  return redirect(next, { 'Set-Cookie': await createSession(c.db, result.user.id, c.now) });
}

function registerPage(c) {
  if (c.user) return redirect('/');
  return c.page('Join', view.registerPage());
}

async function register(c) {
  const name = text(c.form, 'name', 50);
  const addr = email(c.form);
  const pw = password(c.form, 'password');
  const answers = QUESTIONS.map(([key]) => int(c.form, key, 0, 3));
  if (!name || !addr || !pw || answers.includes(null)) return redirect('/register?m=bad_input');

  const { hash, salt } = await hashPassword(pw);
  let user;
  try {
    user = await c.db.prepare(
      'INSERT INTO users (email, name, pw_hash, pw_salt, rating, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    ).bind(addr, name, hash, salt, startingRating(answers), c.now).first();
  } catch (e) {
    if (isConstraintError(e)) return redirect('/register?m=email_taken');
    throw e;
  }
  return redirect('/?m=welcome', { 'Set-Cookie': await createSession(c.db, user.id, c.now) });
}

async function logout(c) {
  return redirect('/', { 'Set-Cookie': await destroySession(c.db, c.request) });
}

// ---------- pages: session registration ----------

async function openEvent(c) {
  const d = await loadEventView(c.db, c.now);
  return d.status === 'open' ? d.event : null;
}

async function signup(c) {
  const event = await openEvent(c);
  if (!event) return redirect('/?m=closed');
  try {
    await c.db.prepare('INSERT INTO registrations (event_id, user_id, guest_name, created_at) VALUES (?, ?, NULL, ?)')
      .bind(event.id, c.user.id, c.now).run();
  } catch (e) {
    if (isConstraintError(e)) return redirect('/?m=already');
    throw e;
  }
  return redirect('/?m=registered');
}

async function addGuest(c) {
  const name = text(c.form, 'guest_name', 50);
  if (!name) return redirect('/?m=bad_input');
  const event = await openEvent(c);
  if (!event) return redirect('/?m=closed');
  // One statement, so the "registered and under the guest limit" check is atomic.
  const { meta } = await c.db.prepare(
    `INSERT INTO registrations (event_id, user_id, guest_name, created_at)
     SELECT ?1, ?2, ?3, ?4
     WHERE EXISTS (SELECT 1 FROM registrations WHERE event_id = ?1 AND user_id = ?2 AND guest_name IS NULL)
       AND (SELECT COUNT(*) FROM registrations WHERE event_id = ?1 AND user_id = ?2 AND guest_name IS NOT NULL) < ?5`,
  ).bind(event.id, c.user.id, name, c.now, MAX_GUESTS).run();
  return redirect(meta.changes ? '/?m=guest_added' : '/?m=guest_limit');
}

async function withdraw(c) {
  const id = int(c.form, 'id', 1, Number.MAX_SAFE_INTEGER);
  const event = await openEvent(c);
  if (!event) return redirect('/?m=closed');
  const reg = id && await c.db.prepare('SELECT * FROM registrations WHERE id = ? AND user_id = ? AND event_id = ?')
    .bind(id, c.user.id, event.id).first();
  if (!reg) return redirect('/?m=not_found');
  await removeRegistration(c.db, reg);
  return redirect('/?m=withdrawn');
}

// ---------- pages: players & matches ----------

const listPlayers = (db) =>
  db.prepare('SELECT id, name, rating, rated_matches FROM users ORDER BY rating DESC, name').all();

async function players(c) {
  const { results } = await listPlayers(c.db);
  return c.page('Players', view.playersPage(results));
}

async function matchesPage(c) {
  const uid = c.user.id;
  const [members, toConfirm, mine] = await c.db.batch([
    c.db.prepare('SELECT id, name FROM users ORDER BY name'),
    c.db.prepare("SELECT * FROM matches WHERE status = 'pending' AND (p3 = ?1 OR p4 = ?1) ORDER BY id DESC LIMIT 50").bind(uid),
    c.db.prepare('SELECT * FROM matches WHERE ?1 IN (p1, p2, p3, p4) ORDER BY id DESC LIMIT 20').bind(uid),
  ]);
  const names = Object.fromEntries(members.results.map((m) => [m.id, m.name]));
  return c.page('Matches', view.matchesPage({
    user: c.user, members: members.results, toConfirm: toConfirm.results, mine: mine.results, names,
    today: manilaDate(c.now),
  }));
}

async function recordMatch(c) {
  const bad = () => redirect('/matches?m=bad_input');
  const max = Number.MAX_SAFE_INTEGER;
  const p1 = c.user.id;
  const p2 = c.form.get('p2') ? int(c.form, 'p2', 1, max) : null;
  const p3 = int(c.form, 'p3', 1, max);
  const p4 = c.form.get('p4') ? int(c.form, 'p4', 1, max) : null;
  const winner = int(c.form, 'winner', 1, 2);
  const score = (c.form.get('score') || '').trim();
  const playedOn = c.form.get('played_on') || '';

  const ids = [p1, p2, p3, p4].filter((x) => x !== null);
  const doubles = p2 !== null || p4 !== null;
  if (!p3 || !winner || (doubles && (p2 === null || p4 === null))) return bad();
  if ((c.form.get('p2') && p2 === null) || (c.form.get('p4') && p4 === null)) return bad();
  if (new Set(ids).size !== ids.length) return bad();
  if (score.length > 40 || !SCORE_RE.test(score)) return bad();
  const today = manilaDate(c.now);
  const oldest = manilaDate(c.now - 60 * DAY);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playedOn) || Number.isNaN(Date.parse(playedOn))
    || playedOn > today || playedOn < oldest) return bad();

  const { n } = await c.db.prepare(`SELECT COUNT(*) AS n FROM users WHERE id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids).first();
  if (n !== ids.length) return bad();

  await c.db.prepare(
    'INSERT INTO matches (played_on, p1, p2, p3, p4, winner, score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(playedOn, p1, p2, p3, p4, winner, score, c.now).run();
  return redirect('/matches?m=match_saved');
}

async function confirmMatch(c) {
  const id = int(c.form, 'id', 1, Number.MAX_SAFE_INTEGER);
  const uid = c.user.id;
  const m = id && await c.db.prepare("SELECT * FROM matches WHERE id = ?1 AND status = 'pending' AND (p3 = ?2 OR p4 = ?2)")
    .bind(id, uid).first();
  if (!m) return redirect('/matches?m=not_found');

  const ids = [m.p1, m.p2, m.p3, m.p4].filter((x) => x !== null);
  const { results } = await c.db.prepare(`SELECT id, rating, rated_matches FROM users WHERE id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids).all();
  const byId = Object.fromEntries(results.map((p) => [p.id, p]));
  const team = (...xs) => xs.filter((x) => x !== null).map((x) => byId[x]);
  const deltas = ratingDeltas(team(m.p1, m.p2), team(m.p3, m.p4), m.winner);

  // One transaction. rating_history's UNIQUE(match_id, user_id) makes a second
  // concurrent confirmation fail and roll back, so ratings change exactly once.
  const db = c.db;
  try {
    await db.batch([
      db.prepare("UPDATE matches SET status = 'confirmed', confirmed_by = ?2 WHERE id = ?1 AND status = 'pending' AND (p3 = ?2 OR p4 = ?2)")
        .bind(m.id, uid),
      ...deltas.map((d) => db.prepare(
        `INSERT INTO rating_history (match_id, user_id, delta, created_at)
         SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM matches WHERE id = ?1 AND status = 'confirmed')`,
      ).bind(m.id, d.id, d.delta, c.now)),
      ...deltas.map((d) => db.prepare(
        `UPDATE users SET rating = MIN(7.0, MAX(0.0, rating + ?1)), rated_matches = rated_matches + 1
         WHERE id = ?2 AND EXISTS (SELECT 1 FROM rating_history WHERE match_id = ?3 AND user_id = ?2)`,
      ).bind(d.delta, d.id, m.id)),
    ]);
  } catch (e) {
    if (isConstraintError(e)) return redirect('/matches?m=not_found');
    throw e;
  }
  return redirect('/matches?m=match_confirmed');
}

async function rejectMatch(c) {
  const id = int(c.form, 'id', 1, Number.MAX_SAFE_INTEGER);
  const { meta } = await c.db.prepare(
    "UPDATE matches SET status = 'rejected', confirmed_by = ?2 WHERE id = ?1 AND status = 'pending' AND (p3 = ?2 OR p4 = ?2)",
  ).bind(id || 0, c.user.id).run();
  return redirect(meta.changes ? '/matches?m=match_rejected' : '/matches?m=not_found');
}

// ---------- pages: account ----------

function accountPage(c) {
  return c.page('Account', view.accountPage(c.user));
}

async function changePassword(c) {
  const current = c.form.get('current') || '';
  const pw = password(c.form, 'password');
  if (!pw) return redirect('/account?m=bad_input');
  if (current.length > 128 || !(await verifyPassword(current, c.user))) return redirect('/account?m=wrong_password');
  const { hash, salt } = await hashPassword(pw);
  await c.db.batch([
    c.db.prepare('UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(hash, salt, c.user.id),
    revokeAll(c.db, c.user.id),
  ]);
  return redirect('/account?m=password_changed', { 'Set-Cookie': await createSession(c.db, c.user.id, c.now) });
}

// ---------- pages: admin ----------

async function adminPage(c, tempPassword) {
  const d = await loadEventView(c.db, c.now);
  const { results: users } = await c.db.prepare('SELECT id, name, email, rating FROM users ORDER BY name').all();
  return c.page('Admin', view.adminPage({ ...d, users, tempPassword }));
}

async function adminEvent(c) {
  const ev = currentEvent(c.now);
  const courts = int(c.form, 'courts', 1, 6);
  const costRaw = (c.form.get('cost') || '').trim();
  const cost = costRaw === '' ? null : Number(costRaw);
  if (c.form.get('date') !== ev.date || !courts
    || (cost !== null && !(Number.isFinite(cost) && cost >= 0 && cost <= 1_000_000))) {
    return redirect('/admin?m=bad_input');
  }
  await c.db.prepare('UPDATE events SET courts = ?, cost_cents = ?, cancelled = ? WHERE date = ?')
    .bind(courts, cost === null ? null : Math.round(cost * 100), c.form.get('cancelled') === '1' ? 1 : 0, ev.date).run();
  return redirect('/admin?m=saved');
}

async function adminPaid(c) {
  const id = int(c.form, 'id', 1, Number.MAX_SAFE_INTEGER);
  const paid = int(c.form, 'paid', 0, 1);
  if (!id || paid === null) return redirect('/admin?m=bad_input');
  await c.db.prepare('UPDATE registrations SET paid = ? WHERE id = ?').bind(paid, id).run();
  return redirect('/admin?m=saved');
}

async function adminRemove(c) {
  const id = int(c.form, 'id', 1, Number.MAX_SAFE_INTEGER);
  const reg = id && await c.db.prepare('SELECT * FROM registrations WHERE id = ?').bind(id).first();
  if (!reg) return redirect('/admin?m=not_found');
  await removeRegistration(c.db, reg);
  return redirect('/admin?m=saved');
}

async function adminResetPassword(c) {
  const id = int(c.form, 'id', 1, Number.MAX_SAFE_INTEGER);
  const user = id && await c.db.prepare('SELECT id, name FROM users WHERE id = ?').bind(id).first();
  if (!user) return redirect('/admin?m=not_found');
  const temp = randomPassword();
  const { hash, salt } = await hashPassword(temp);
  await c.db.batch([
    c.db.prepare('UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(hash, salt, user.id),
    revokeAll(c.db, user.id),
  ]);
  return adminPage(c, { name: user.name, password: temp });
}

// ---------- JSON API (read-only, for future mobile apps) ----------

const iso = (ms) => new Date(ms).toISOString();
const apiReg = (r) => ({ id: r.id, name: r.guest_name || r.name, guestOf: r.guest_name ? r.name : null });

async function apiEvent(c) {
  const d = await loadEventView(c.db, c.now);
  return jsonResponse({
    date: d.event.date, status: d.status, courts: d.event.courts, capacity: d.cap,
    startsAt: iso(d.ev.startsAt), endsAt: iso(d.ev.endsAt), opensAt: iso(d.ev.opensAt), closesAt: iso(d.ev.closesAt),
    costCents: d.event.cost_cents, shareCents: d.share || null,
    confirmed: d.confirmed.map(apiReg), waitlist: d.waitlist.map(apiReg),
  });
}

async function apiPlayers(c) {
  const { results } = await listPlayers(c.db);
  return jsonResponse(results.map((p) => ({ id: p.id, name: p.name, rating: p.rating, ratedMatches: p.rated_matches })));
}

function apiMe(c) {
  const u = c.user;
  return jsonResponse({ id: u.id, name: u.name, email: u.email, rating: u.rating, ratedMatches: u.rated_matches, admin: c.admin });
}

// ---------- routing ----------

const PUBLIC = 0, USER = 1, ADMIN = 2;

const ROUTES = {
  'GET /': [home, PUBLIC],
  'GET /login': [loginPage, PUBLIC],
  'POST /login': [login, PUBLIC],
  'GET /register': [registerPage, PUBLIC],
  'POST /register': [register, PUBLIC],
  'POST /logout': [logout, PUBLIC],
  'POST /signup': [signup, USER],
  'POST /guests': [addGuest, USER],
  'POST /withdraw': [withdraw, USER],
  'GET /players': [players, USER],
  'GET /matches': [matchesPage, USER],
  'POST /matches': [recordMatch, USER],
  'POST /matches/confirm': [confirmMatch, USER],
  'POST /matches/reject': [rejectMatch, USER],
  'GET /account': [accountPage, USER],
  'POST /account/password': [changePassword, USER],
  'GET /admin': [(c) => adminPage(c), ADMIN],
  'POST /admin/event': [adminEvent, ADMIN],
  'POST /admin/paid': [adminPaid, ADMIN],
  'POST /admin/remove': [adminRemove, ADMIN],
  'POST /admin/reset-password': [adminResetPassword, ADMIN],
  'GET /api/event': [apiEvent, USER],
  'GET /api/players': [apiPlayers, USER],
  'GET /api/me': [apiMe, USER],
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method === 'HEAD' ? 'GET' : request.method;
    const route = ROUTES[`${method} ${url.pathname}`];
    const isApi = url.pathname.startsWith('/api/');
    const now = Date.now();
    const db = env.DB;

    const user = await currentUser(db, request, now);
    const adminEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
    const admin = Boolean(user && adminEmail && user.email === adminEmail);
    const page = (title, body, status = 200) =>
      htmlResponse(view.layout({ title, user, admin, flash: url.searchParams.get('m') }, body), status);
    const fail = (status, msg) => (isApi ? jsonResponse({ error: msg }, status) : page(String(status), view.errorPage(status, msg), status));

    // Admin routes look like any unknown page to everyone else.
    if (!route || (route[1] === ADMIN && !admin && user)) return fail(404, 'Page not found.');
    const [handler, access] = route;
    if (access !== PUBLIC && !user) {
      return isApi ? fail(401, 'Log in first.') : redirect(`/login?next=${encodeURIComponent(url.pathname)}`);
    }

    let form = null;
    if (method === 'POST') {
      if (!sameOrigin(request)) return fail(403, 'Request blocked.');
      form = await readForm(request);
      if (!form) return fail(400, 'Bad request.');
    }

    try {
      return await handler({ request, env, db, url, now, user, admin, form, page });
    } catch (e) {
      console.error(e);
      return fail(500, 'Something went wrong. Please try again.');
    }
  },
};
