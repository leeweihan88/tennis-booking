// Server-rendered pages. Every value passes through html`` and is escaped.
import { html } from './http.js';
import { formatManila, MAX_GUESTS } from './schedule.js';
import { QUESTIONS } from './rating.js';

// Flash messages are looked up by key so no user input is ever reflected.
const MESSAGES = {
  welcome: ['ok', 'Welcome! Your account is ready.'],
  registered: ['ok', 'You are registered.'],
  guest_added: ['ok', 'Guest added.'],
  withdrawn: ['ok', 'Withdrawn. The spot has gone to the next person on the waitlist, if any.'],
  closed: ['error', 'Registration is not open right now.'],
  already: ['error', 'You are already registered.'],
  guest_limit: ['error', `Register yourself first. You can bring up to ${MAX_GUESTS} guests.`],
  bad_input: ['error', 'Please check the form and try again.'],
  login_failed: ['error', 'Wrong email or password.'],
  locked: ['error', 'Too many failed attempts. Try again in 15 minutes.'],
  email_taken: ['error', 'That email already has an account. Log in instead.'],
  match_saved: ['ok', 'Match saved. It counts once an opponent confirms it.'],
  match_confirmed: ['ok', 'Match confirmed and ratings updated.'],
  match_rejected: ['ok', 'Match rejected.'],
  password_changed: ['ok', 'Password changed. Other devices have been logged out.'],
  wrong_password: ['error', 'Current password is wrong.'],
  saved: ['ok', 'Saved.'],
  not_found: ['error', 'That item no longer exists.'],
};

export const peso = (cents) => '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtRating = (r) => r.toFixed(2);

export function layout({ title, user, admin, flash }, body) {
  const msg = MESSAGES[flash];
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · CSA Tennis</title>
<link rel="stylesheet" href="/app-v1.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head>
<body>
<header>
  <nav>
    <a class="brand" href="/">CSA Tennis</a>
    ${user ? html`
      <a href="/players">Players</a>
      <a href="/matches">Matches</a>
      <a href="/account">Account</a>
      ${admin ? html`<a href="/admin">Admin</a>` : ''}
      <form method="post" action="/logout"><button class="link">Log out</button></form>`
    : html`<a href="/login">Log in</a><a href="/register">Join</a>`}
  </nav>
</header>
<main>
${msg ? html`<p class="flash ${msg[0]}" role="status">${msg[1]}</p>` : ''}
${body}
</main>
</body>
</html>`;
}

const STATUS_TEXT = {
  upcoming: (ev) => `Registration opens ${formatManila(ev.opensAt)}.`,
  open: (ev) => `Registration is open until ${formatManila(ev.closesAt)}.`,
  closed: () => 'Registration is closed.',
  cancelled: () => 'This session is cancelled.',
};

function playerLabel(r) {
  return r.guest_name
    ? html`${r.guest_name} <span class="muted">(guest of ${r.name})</span>`
    : html`${r.name} <span class="muted">${fmtRating(r.rating)}</span>`;
}

export function homePage(d) {
  const { ev, event, status, user, confirmed, waitlist, cap, share } = d;
  const mine = user ? [...confirmed, ...waitlist].filter((r) => r.user_id === user.id) : [];
  const self = mine.find((r) => !r.guest_name);
  const guests = mine.filter((r) => r.guest_name);
  const myConfirmed = mine.filter((r) => confirmed.includes(r)).length;
  const open = status === 'open';

  const withdrawBtn = (r, label) => html`
    <form method="post" action="/withdraw" class="inline">
      <input type="hidden" name="id" value="${r.id}">
      <button class="secondary">${label}</button>
    </form>`;

  const list = (rows, start) => html`<ol start="${start}">${rows.map((r) => html`
    <li class="${user && r.user_id === user.id ? 'me' : ''}">${playerLabel(r)}${
      open && user && r.user_id === user.id && r.guest_name ? withdrawBtn(r, 'Remove') : ''}</li>`)}</ol>`;

  return html`
<section class="card">
  <h1>Monday tennis</h1>
  <p class="big">${formatManila(ev.startsAt)} – 9:30 PM</p>
  <p>${event.courts} courts · ${confirmed.length}/${cap} spots taken${waitlist.length ? html` · ${waitlist.length} on waitlist` : ''}</p>
  <p class="status ${status}">${STATUS_TEXT[status](ev)}</p>
  ${share ? html`<p>Court cost ${peso(event.cost_cents)} ÷ ${confirmed.length} players = <strong>${peso(share)}</strong> each.</p>` : ''}
</section>

${!user ? html`<p><a class="button" href="/login">Log in to register</a> or <a href="/register">create an account</a>.</p>` : html`
<section class="card">
  <h2>You</h2>
  ${self
    ? html`<p>You are <strong>${confirmed.includes(self) ? 'confirmed' : 'on the waitlist'}</strong>.
        ${share && myConfirmed ? html`You owe ${peso(share * myConfirmed)} for ${myConfirmed} spot${myConfirmed > 1 ? 's' : ''}.` : ''}</p>
      ${open ? withdrawBtn(self, guests.length ? 'Withdraw me and my guests' : 'Withdraw') : ''}
      ${open && guests.length < MAX_GUESTS ? html`
      <form method="post" action="/guests" class="row">
        <label>Bring a friend <input name="guest_name" required maxlength="50" placeholder="Friend's name"></label>
        <button>Add guest</button>
      </form>
      <p class="muted">Guests take their own spot in sign-up order. Up to ${MAX_GUESTS} per member.</p>` : ''}`
    : open
      ? html`<form method="post" action="/signup"><button>Register for this session</button></form>`
      : html`<p class="muted">You are not registered.</p>`}
</section>

<section class="card">
  <h2>Confirmed (${confirmed.length}/${cap})</h2>
  ${confirmed.length ? list(confirmed, 1) : html`<p class="muted">Nobody yet.</p>`}
  ${waitlist.length ? html`<h2>Waitlist</h2>${list(waitlist, 1)}` : ''}
</section>`}`;
}

export function loginPage(next) {
  return html`
<section class="card narrow">
  <h1>Log in</h1>
  <form method="post" action="/login">
    <input type="hidden" name="next" value="${next}">
    <label>Email <input type="email" name="email" required maxlength="254" autocomplete="email"></label>
    <label>Password <input type="password" name="password" required maxlength="128" autocomplete="current-password"></label>
    <button>Log in</button>
  </form>
  <p class="muted">Forgot your password? Ask the admin to reset it.</p>
  <p>New here? <a href="/register">Create an account</a></p>
</section>`;
}

export function registerPage() {
  return html`
<section class="card narrow">
  <h1>Join CSA Tennis</h1>
  <form method="post" action="/register">
    <label>Name <input name="name" required maxlength="50" autocomplete="name"></label>
    <label>Email <input type="email" name="email" required maxlength="254" autocomplete="email"></label>
    <label>Password (at least 10 characters) <input type="password" name="password" required minlength="10" maxlength="128" autocomplete="new-password"></label>
    <h2>Your level</h2>
    <p class="muted">These answers set your starting rating (1.0–4.0 on a 0–7 scale). Match results adjust it after that.</p>
    ${QUESTIONS.map(([key, q, answers]) => html`
    <label>${q}
      <select name="${key}" required>
        <option value="">Choose…</option>
        ${answers.map((a, i) => html`<option value="${i}">${a}</option>`)}
      </select>
    </label>`)}
    <button>Create account</button>
  </form>
</section>`;
}

export function playersPage(players) {
  return html`
<h1>Players</h1>
<div class="table-wrap"><table>
  <thead><tr><th>#</th><th>Name</th><th>Rating</th><th>Rated matches</th></tr></thead>
  <tbody>${players.map((p, i) => html`
    <tr><td>${i + 1}</td><td>${p.name}</td><td>${fmtRating(p.rating)}</td><td>${p.rated_matches}</td></tr>`)}
  </tbody>
</table></div>`;
}

function matchLine(m, names) {
  const team = (a, b) => (b ? `${names[a]} & ${names[b]}` : names[a]);
  const t1 = team(m.p1, m.p2);
  const t2 = team(m.p3, m.p4);
  return html`${m.played_on}: <strong>${m.winner === 1 ? t1 : t2}</strong> beat ${m.winner === 1 ? t2 : t1}${m.score ? ` (${m.score})` : ''}`;
}

export function matchesPage({ user, members, toConfirm, mine, names, today }) {
  const others = members.filter((p) => p.id !== user.id);
  const pick = (name, required) => html`
    <select name="${name}" ${required ? 'required' : ''}>
      <option value="">${required ? 'Choose…' : 'None (singles)'}</option>
      ${others.map((p) => html`<option value="${p.id}">${p.name}</option>`)}
    </select>`;
  return html`
<h1>Matches</h1>
${toConfirm.length ? html`
<section class="card">
  <h2>Waiting for your confirmation</h2>
  <ul>${toConfirm.map((m) => html`
    <li>${matchLine(m, names)}
      <form method="post" action="/matches/confirm" class="inline"><input type="hidden" name="id" value="${m.id}"><button>Confirm</button></form>
      <form method="post" action="/matches/reject" class="inline"><input type="hidden" name="id" value="${m.id}"><button class="secondary">Reject</button></form>
    </li>`)}
  </ul>
</section>` : ''}
<section class="card">
  <h2>Record a match</h2>
  <form method="post" action="/matches">
    <label>Date played <input type="date" name="played_on" required max="${today}" value="${today}"></label>
    <label>Your partner ${pick('p2', false)}</label>
    <label>Opponent ${pick('p3', true)}</label>
    <label>Opponent's partner ${pick('p4', false)}</label>
    <fieldset>
      <legend>Result</legend>
      <label class="check"><input type="radio" name="winner" value="1" required> My team won</label>
      <label class="check"><input type="radio" name="winner" value="2"> My team lost</label>
    </fieldset>
    <label>Score (optional) <input name="score" maxlength="40" placeholder="6-4 3-6 10-8"></label>
    <button>Save match</button>
  </form>
  <p class="muted">Leave both partner fields empty for singles, or fill both for doubles. An opponent must confirm before ratings change.</p>
</section>
<section class="card">
  <h2>Your recent matches</h2>
  ${mine.length ? html`<ul>${mine.map((m) => html`<li>${matchLine(m, names)} <span class="tag ${m.status}">${m.status}</span></li>`)}</ul>`
    : html`<p class="muted">No matches yet.</p>`}
</section>`;
}

export function accountPage(user) {
  return html`
<h1>Account</h1>
<section class="card narrow">
  <p><strong>${user.name}</strong><br><span class="muted">${user.email}</span></p>
  <p>Rating <strong>${fmtRating(user.rating)}</strong> after ${user.rated_matches} rated matches.</p>
</section>
<section class="card narrow">
  <h2>Change password</h2>
  <form method="post" action="/account/password">
    <label>Current password <input type="password" name="current" required maxlength="128" autocomplete="current-password"></label>
    <label>New password (at least 10 characters) <input type="password" name="password" required minlength="10" maxlength="128" autocomplete="new-password"></label>
    <button>Change password</button>
  </form>
</section>`;
}

export function adminPage({ ev, event, confirmed, waitlist, share, users, tempPassword }) {
  const row = (r, waiting) => html`
    <tr>
      <td>${r.guest_name ? html`${r.guest_name} <span class="muted">(guest of ${r.name})</span>` : r.name}</td>
      <td>${waiting ? 'Waitlist' : 'Confirmed'}</td>
      <td>${waiting ? '' : html`
        <form method="post" action="/admin/paid" class="inline">
          <input type="hidden" name="id" value="${r.id}">
          <input type="hidden" name="paid" value="${r.paid ? 0 : 1}">
          <button class="${r.paid ? '' : 'secondary'}">${r.paid ? 'Paid ✓' : 'Mark paid'}</button>
        </form>`}</td>
      <td><form method="post" action="/admin/remove" class="inline">
        <input type="hidden" name="id" value="${r.id}"><button class="secondary">Remove</button></form></td>
    </tr>`;
  return html`
<h1>Admin</h1>
${tempPassword ? html`<p class="flash ok" role="status">Temporary password for ${tempPassword.name}: <code>${tempPassword.password}</code> — share it privately; they should change it after logging in.</p>` : ''}
<section class="card">
  <h2>Session ${formatManila(ev.startsAt)}</h2>
  <form method="post" action="/admin/event" class="row">
    <input type="hidden" name="date" value="${event.date}">
    <label>Courts <input type="number" name="courts" min="1" max="6" required value="${event.courts}"></label>
    <label>Total court cost (₱) <input type="number" name="cost" min="0" max="1000000" step="0.01" value="${event.cost_cents == null ? '' : (event.cost_cents / 100).toFixed(2)}"></label>
    <label class="check"><input type="checkbox" name="cancelled" value="1" ${event.cancelled ? 'checked' : ''}> Cancelled</label>
    <button>Save</button>
  </form>
  ${share ? html`<p>${peso(share)} per confirmed player.</p>` : ''}
  <div class="table-wrap"><table>
    <thead><tr><th>Player</th><th>Status</th><th>Paid</th><th></th></tr></thead>
    <tbody>${confirmed.map((r) => row(r, false))}${waitlist.map((r) => row(r, true))}</tbody>
  </table></div>
</section>
<section class="card">
  <h2>Members (${users.length})</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Name</th><th>Email</th><th>Rating</th><th></th></tr></thead>
    <tbody>${users.map((u) => html`
      <tr><td>${u.name}</td><td>${u.email}</td><td>${fmtRating(u.rating)}</td>
        <td><form method="post" action="/admin/reset-password" class="inline">
          <input type="hidden" name="id" value="${u.id}"><button class="secondary">Reset</button></form></td></tr>`)}
    </tbody>
  </table></div>
</section>`;
}

export function errorPage(status, text) {
  return html`<section class="card narrow"><h1>${status}</h1><p>${text}</p><p><a href="/">Back to the session</a></p></section>`;
}
