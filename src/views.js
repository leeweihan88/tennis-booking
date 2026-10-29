// Server-rendered pages. Every value passes through html`` and is escaped.
import { html } from './http.js';
import { formatDate, formatManila, MAX_GUESTS } from './schedule.js';
import { QUESTIONS } from './rating.js';
import { avatarPath, colourIndex, initials, MAX_UPLOAD_BYTES } from './avatar.js';

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
  password_mismatch: ['error', 'The two new passwords do not match.'],
  name_changed: ['ok', 'Name updated.'],
  session_cancelled: ['ok', 'Session cancelled. Players see it as cancelled on the home page.'],
  session_restored: ['ok', 'Session restored.'],
  saved: ['ok', 'Saved.'],
  not_found: ['error', 'That item no longer exists.'],
  photo_saved: ['ok', 'Profile picture updated.'],
  photo_removed: ['ok', 'Profile picture removed; initials are shown instead.'],
  photo_too_big: ['error', `That photo is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Please choose a smaller one.`],
  bad_photo: ['error', 'That file is not a photo we can use. Try a JPEG, PNG or WebP.'],
  photo_failed: ['error', 'Could not process that photo. Please try another one.'],
  photo_limit: ['error', 'You have changed your photo 5 times today. Try again tomorrow.'],
  photo_unavailable: ['error', 'Photo uploads are not available right now. Please tell the admin.'],
};

export const peso = (cents) => '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtRating = (r) => r.toFixed(2);
const ratingPill = (r) => html`<span class="rating" title="Skill rating, 0–7">${fmtRating(r)}</span>`;

// Profile picture, or 2-letter initials on a colour picked from the name. Guests pass no id.
// alt is empty because the name is always shown next to it.
const AVATAR_PX = { sm: 28, lg: 96 };
export const avatar = (name, id, version, size = 'sm') => {
  const src = id && avatarPath(id, version);
  const px = AVATAR_PX[size];
  return src
    ? html`<img class="avatar ${size}" src="${src}" alt="" width="${px}" height="${px}" loading="lazy" decoding="async">`
    : html`<span class="avatar ${size} c${colourIndex(name)}" aria-hidden="true">${initials(name)}</span>`;
};
const person = (name, id, version, extra = '') =>
  html`<span class="person">${avatar(name, id, version)}<span>${name}${extra}</span></span>`;

// Destructive actions need a second click: the summary reveals the real button.
const confirmAction = (label, action, fields, confirmLabel) => html`
  <details class="confirm">
    <summary>${label}</summary>
    <form method="post" action="${action}">
      ${Object.entries(fields).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
      <button class="danger">${confirmLabel}</button>
    </form>
  </details>`;

export function layout({ title, user, admin, flash, path }, body) {
  const msg = MESSAGES[flash];
  const link = (href, label) => html`<a href="${href}" ${href === path ? html`aria-current="page"` : ''}>${label}</a>`;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · CSA Tennis</title>
<link rel="stylesheet" href="/app-v3.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head>
<body>
<header>
  <nav>
    <a class="brand" href="/" ${path === '/' ? html`aria-current="page"` : ''}>CSA Tennis</a>
    ${user ? html`
      ${link('/players', 'Players')}
      ${link('/matches', 'Matches')}
      <a href="/account" class="me-link" ${path === '/account' ? html`aria-current="page"` : ''}>${avatar(user.name, user.id, user.avatar_v)}Account</a>
      ${admin ? link('/admin', 'Admin') : ''}
      <form method="post" action="/logout"><button class="link">Log out</button></form>`
    : html`${link('/login', 'Log in')}${link('/register', 'Join')}`}
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
    ? person(r.guest_name, null, null, html` <span class="muted">(guest of ${r.name})</span>`)
    : person(r.name, r.user_id, r.avatar_v, ratingPill(r.rating));
}

const payTag = (r) => html`<span class="tag ${r.paid ? 'paid' : 'unpaid'}">${r.paid ? 'Paid' : 'Unpaid'}</span>`;

export function homePage(d) {
  const { ev, event, status, user, confirmed, waitlist, cap, share } = d;
  const all = [...confirmed, ...waitlist];
  const mine = user ? all.filter((r) => r.user_id === user.id) : [];
  const self = mine.find((r) => !r.guest_name);
  const guests = mine.filter((r) => r.guest_name);
  const myConfirmed = mine.filter((r) => confirmed.includes(r));
  const open = status === 'open';
  const place = (r) => (confirmed.includes(r) ? 'Confirmed' : `Waitlist #${waitlist.indexOf(r) + 1}`);

  const list = (rows) => html`<ol>${rows.map((r) => html`
    <li class="${user && r.user_id === user.id ? 'me' : ''}">${playerLabel(r)}</li>`)}</ol>`;

  const youCard = () => {
    if (!self) {
      return open
        ? html`<form method="post" action="/signup"><button>Register for this session</button></form>`
        : html`<p class="muted">You are not registered for this session.</p>`;
    }
    return html`
      <ul class="plain">${mine.map((r) => html`
        <li>
          ${r.guest_name ? person(r.guest_name, null, null, html` <span class="muted">(your guest)</span>`)
            : html`<span class="person">${avatar(r.name, r.user_id, r.avatar_v)}<strong>You</strong></span>`}
          <span class="actions">
            <span class="tag">${place(r)}</span>
            ${share && confirmed.includes(r) ? payTag(r) : ''}
            ${open && r.guest_name ? confirmAction('Remove', '/withdraw', { id: r.id }, `Remove ${r.guest_name}`) : ''}
          </span>
        </li>`)}
      </ul>
      ${share && myConfirmed.length ? html`
        <p>Your share: <strong>${peso(share * myConfirmed.length)}</strong>
          ${myConfirmed.length > 1 ? html`<span class="muted">(${peso(share)} × ${myConfirmed.length} spots)</span>` : ''}.
          Pay the organiser directly; they mark it paid here.</p>` : ''}
      ${open ? html`
        <div class="actions">${confirmAction(
          guests.length ? 'Withdraw me and my guests' : 'Withdraw', '/withdraw', { id: self.id },
          guests.length ? 'Yes, withdraw all of us' : 'Yes, withdraw')}</div>
        ${guests.length < MAX_GUESTS ? html`
        <div class="part">
          <h3>Bring a friend</h3>
          <form method="post" action="/guests" class="row">
            <label>Friend's name <input name="guest_name" required maxlength="50" autocomplete="off"></label>
            <button>Add guest</button>
          </form>
          <p class="muted">Guests take their own spot in sign-up order. Up to ${MAX_GUESTS} per member.</p>
        </div>` : ''}` : ''}`;
  };

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
  ${youCard()}
</section>

<section class="card">
  <h2>Confirmed (${confirmed.length}/${cap})</h2>
  ${confirmed.length ? list(confirmed) : html`<p class="muted">Nobody yet.</p>`}
  ${waitlist.length ? html`<div class="part"><h2>Waitlist (${waitlist.length})</h2>${list(waitlist)}</div>` : ''}
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
<div class="card table-wrap"><table>
  <thead><tr><th>#</th><th>Name</th><th>Rating</th><th>Rated matches</th></tr></thead>
  <tbody>${players.map((p, i) => html`
    <tr><td>${i + 1}</td><td>${person(p.name, p.id, p.avatar_v)}</td><td>${fmtRating(p.rating)}</td><td>${p.rated_matches}</td></tr>`)}
  </tbody>
</table></div>
<p class="muted">Ratings run from 0 to 7 and change only when an opponent confirms a match result.</p>`;
}

function matchLine(m, names) {
  const team = (a, b) => (b ? `${names[a]} & ${names[b]}` : names[a]);
  const t1 = team(m.p1, m.p2);
  const t2 = team(m.p3, m.p4);
  return html`<span class="muted">${formatDate(m.played_on)}</span> <strong>${m.winner === 1 ? t1 : t2}</strong> beat ${m.winner === 1 ? t2 : t1}${m.score ? ` (${m.score})` : ''}`;
}

const choice = (name, options, checked) => html`
  <div class="choice">${options.map(([value, label]) => html`
    <label><input type="radio" name="${name}" value="${value}" required ${value === checked ? 'checked' : ''}><span>${label}</span></label>`)}
  </div>`;

export function matchesPage({ user, members, toConfirm, mine, names, today }) {
  const others = members.filter((p) => p.id !== user.id);
  const pick = (name) => html`
    <select name="${name}">
      <option value="">Choose…</option>
      ${others.map((p) => html`<option value="${p.id}">${p.name}</option>`)}
    </select>`;
  return html`
<h1>Matches</h1>
<p class="note"><strong>Ratings change only after an opponent confirms.</strong> Record a match below; your opponent then sees it under “Waiting for your confirmation” on this page.</p>
${toConfirm.length ? html`
<section class="card">
  <h2>Waiting for your confirmation (${toConfirm.length})</h2>
  <ul class="plain">${toConfirm.map((m) => html`
    <li><span>${matchLine(m, names)}</span>
      <span class="actions">
        <form method="post" action="/matches/confirm"><input type="hidden" name="id" value="${m.id}"><button>Confirm</button></form>
        <form method="post" action="/matches/reject"><input type="hidden" name="id" value="${m.id}"><button class="secondary">Reject</button></form>
      </span>
    </li>`)}
  </ul>
</section>` : ''}
<section class="card">
  <h2>Record a match</h2>
  <form method="post" action="/matches">
    <fieldset><legend>Match type</legend>${choice('type', [['singles', 'Singles'], ['doubles', 'Doubles']], 'singles')}</fieldset>
    <label>Date played <input type="date" name="played_on" required max="${today}" value="${today}"></label>
    <label class="doubles-only">Your partner ${pick('p2')}</label>
    <label>Opponent ${pick('p3')}</label>
    <label class="doubles-only">Opponent's partner ${pick('p4')}</label>
    <fieldset><legend>Result</legend>${choice('winner', [['1', 'We won'], ['2', 'We lost']], null)}</fieldset>
    <label>Score (optional) <input name="score" maxlength="40" placeholder="e.g. 6-4 3-6 10-8"></label>
    <button>Save match</button>
  </form>
</section>
<section class="card">
  <h2>Your recent matches</h2>
  ${mine.length ? html`<ul class="plain">${mine.map((m) => html`<li><span>${matchLine(m, names)}</span> <span class="tag ${m.status}">${m.status}</span></li>`)}</ul>`
    : html`<p class="muted">No matches yet.</p>`}
</section>`;
}

export function accountPage(user) {
  return html`
<h1>Account</h1>
<section class="card">
  <h2>Profile</h2>
  <div class="profile">
    ${avatar(user.name, user.id, user.avatar_v, 'lg')}
    <div>
      <p><strong>${user.name}</strong><br><span class="muted">${user.email}</span></p>
      ${user.avatar_v ? confirmAction('Remove photo', '/account/photo/remove', {}, 'Yes, use my initials') : ''}
    </div>
  </div>
  <form method="post" action="/account/photo" enctype="multipart/form-data" class="row part">
    <label>${user.avatar_v ? 'Change profile picture' : 'Add a profile picture'}
      <input type="file" name="photo" accept="image/*" required></label>
    <button>Upload</button>
  </form>
  <p class="muted">Any photo up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. It is cropped to a square and only members who are logged in can see it. Without one, your initials are shown.</p>
  <form method="post" action="/account/name" class="row part">
    <label>Name <input name="name" required maxlength="50" value="${user.name}" autocomplete="name"></label>
    <button>Save name</button>
  </form>
</section>
<section class="card">
  <h2>Your rating ${ratingPill(user.rating)}</h2>
  <p>Ratings run from <strong>0</strong> (beginner) to <strong>7</strong> (elite). Your starting rating came from your sign-up answers.
    You have ${user.rated_matches} rated match${user.rated_matches === 1 ? '' : 'es'}.</p>
  <ul>
    <li>Each match counts once an opponent confirms it.</li>
    <li>Beating a stronger player raises it more; losing to a weaker one lowers it more. For doubles, team averages are compared.</li>
    <li>Your first 10 rated matches move it twice as fast, so it settles quickly.</li>
  </ul>
</section>
<section class="card">
  <h2>Change password</h2>
  <form method="post" action="/account/password">
    <label>Current password <input type="password" name="current" required maxlength="128" autocomplete="current-password"></label>
    <label>New password (at least 10 characters) <input type="password" name="password" required minlength="10" maxlength="128" autocomplete="new-password"></label>
    <label>Repeat new password <input type="password" name="password2" required minlength="10" maxlength="128" autocomplete="new-password"></label>
    <button>Change password</button>
  </form>
</section>`;
}

export function adminPage({ ev, event, confirmed, waitlist, share, users, tempPassword }) {
  const paidCount = confirmed.filter((r) => r.paid).length;
  const row = (r, waiting) => html`
    <tr>
      <td>${r.guest_name ? person(r.guest_name, null, null, html`<br><span class="muted">guest of ${r.name}</span>`) : person(r.name, r.user_id, r.avatar_v)}
        ${waiting ? html`<br><span class="tag">Waitlist #${waitlist.indexOf(r) + 1}</span>` : ''}</td>
      <td>${waiting ? '' : html`<span class="actions">${payTag(r)}
        <form method="post" action="/admin/paid">
          <input type="hidden" name="id" value="${r.id}">
          <input type="hidden" name="paid" value="${r.paid ? 0 : 1}">
          <button class="secondary">${r.paid ? 'Undo' : 'Mark paid'}</button>
        </form></span>`}</td>
      <td>${confirmAction('Remove', '/admin/remove', { id: r.id }, r.guest_name ? 'Confirm remove' : 'Remove (and any guests)')}</td>
    </tr>`;
  return html`
<h1>Admin</h1>
${tempPassword ? html`<p class="flash ok" role="status">Temporary password for ${tempPassword.name}: <code>${tempPassword.password}</code> — share it privately; they should change it after logging in.</p>` : ''}
<section class="card">
  <h2>Session ${formatManila(ev.startsAt)}</h2>
  ${event.cancelled ? html`<p class="status cancelled">This session is cancelled.</p>` : ''}
  <form method="post" action="/admin/event" class="row">
    <input type="hidden" name="date" value="${event.date}">
    <label>Courts <input type="number" name="courts" min="1" max="6" required value="${event.courts}"></label>
    <label>Total court cost (₱) <input type="number" name="cost" min="0" max="1000000" step="0.01" value="${event.cost_cents == null ? '' : (event.cost_cents / 100).toFixed(2)}"></label>
    <button>Save</button>
  </form>
  ${share ? html`<p>${peso(share)} per confirmed player · <strong>${paidCount} of ${confirmed.length} paid</strong>.</p>`
    : html`<p class="muted">Enter the total court cost to show each player's share.</p>`}
  <div class="table-wrap part"><table>
    <thead><tr><th>Player</th><th>Payment</th><th></th></tr></thead>
    <tbody>${confirmed.map((r) => row(r, false))}${waitlist.map((r) => row(r, true))}</tbody>
  </table></div>
  ${confirmed.length + waitlist.length ? '' : html`<p class="muted">No registrations yet.</p>`}
  <div class="part">
    ${event.cancelled
      ? html`<form method="post" action="/admin/cancel"><input type="hidden" name="date" value="${event.date}"><input type="hidden" name="cancelled" value="0"><button class="secondary">Restore session</button></form>`
      : html`${confirmAction('Cancel this session', '/admin/cancel', { date: event.date, cancelled: 1 }, 'Yes, cancel the session')}
        <p class="muted">Registrations are kept, so restoring brings everyone back in the same order.</p>`}
  </div>
</section>
<section class="card">
  <h2>Members (${users.length})</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Member</th><th>Rating</th><th></th></tr></thead>
    <tbody>${users.map((u) => html`
      <tr><td>${person(u.name, u.id, u.avatar_v, html`<br><span class="muted email">${u.email}</span>`)}</td><td>${fmtRating(u.rating)}</td>
        <td><span class="actions">${confirmAction('Reset password', '/admin/reset-password', { id: u.id }, 'Yes, reset')}
          ${u.avatar_v ? confirmAction('Remove photo', '/admin/remove-photo', { id: u.id }, 'Yes, remove photo') : ''}</span></td></tr>`)}
    </tbody>
  </table></div>
  <p class="muted">Resetting a password only replaces the password (ratings and history are kept) and logs that member out.</p>
</section>`;
}

export function errorPage(status, text) {
  return html`<section class="card narrow"><h1>${status}</h1><p>${text}</p><p><a href="/">Back to the session</a></p></section>`;
}
