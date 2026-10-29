# CSA Tennis

Weekly tennis registration for the Monday session, plus player ratings.

- **Session:** every Monday 7:30–9:30 PM, Philippine time (UTC+8).
- **Registration:** opens Wednesday 10:00 AM, closes Monday 12:00 PM. Players can withdraw until it closes.
- **Capacity:** 4 players per court. The admin sets the number of courts each week (default 2 → 8 spots; 3 → 12). Extra sign-ups join a waitlist, which moves up automatically when someone withdraws.
- **Guests:** members can bring up to 3 friends without accounts. Each guest takes their own spot in sign-up order. Withdrawing yourself also withdraws your guests.
- **Court cost:** the admin enters the total cost in PHP. Each confirmed spot owes an equal share, and the admin ticks off who has paid. No money is handled online.
- **Ratings (0–7):** a 4-question sign-up questionnaire sets the starting rating (1.0–4.0). Players record singles or doubles results, and ratings change (Elo-style) once an opponent confirms.
- **Accounts:** email + password. There is no email sending, so the admin resets forgotten passwords from `/admin`.

## Architecture

```
Browser ──► Cloudflare edge (TLS, DDoS protection, CDN)
              └─► Worker "csa-tennis" (src/index.js, no runtime dependencies)
                    ├─ static assets: public/ (CSS, icon), cached at the edge
                    ├─ server-rendered HTML pages, no client JavaScript
                    ├─ read-only JSON API: /api/event, /api/players, /api/me
                    └─ D1 database "csa-tennis" (SQLite)
```

| Path | Purpose |
|---|---|
| `src/index.js` | Router, request guards, all handlers |
| `src/views.js` | HTML pages (auto-escaped `html` template) |
| `src/auth.js` | PBKDF2 passwords, cookie sessions, login lockout |
| `src/schedule.js` | Weekly schedule maths (Manila time) |
| `src/rating.js` | Rating algorithm and questionnaire |
| `src/http.js` | Escaping, security headers, origin check, safe redirects |
| `public/` | Static assets; `_headers` sets their security and cache headers |
| `migrations/0001_init.sql` | Database schema (idempotent) |
| `test/` | Unit tests (`npm test`, Node's built-in test runner) |

## Local development

```bash
npm install
```

```bash
echo "ADMIN_EMAIL=you@example.com" > .dev.vars
```

```bash
npm run db:local
```

```bash
npm run dev
```

The site then runs at http://localhost:8787. Run the tests with:

```bash
npm test
```

## Deploying to Cloudflare (one-time setup)

The D1 schema is already applied to the production database `csa-tennis`.

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository**. Pick `leeweihan88/tennis-booking`, branch `main`.
   - Project name: `csa-tennis` (must match `name` in `wrangler.jsonc`)
   - Build command: *(leave empty)*
   - Deploy command: `npx wrangler deploy`
2. After the first deploy, open the Worker: **Settings → Variables & Secrets → Add**. Type: *Text*, name `ADMIN_EMAIL`, value: the admin's email. `keep_vars` in `wrangler.jsonc` stops later deploys from wiping it.
3. Open `https://csa-tennis.<your-subdomain>.workers.dev`, then register with the admin email. The **Admin** link appears in the menu.

From then on, every push to `main` deploys automatically.

### Pull-request previews

Each pull request branch builds a Preview: a separate public URL that Cloudflare's bot posts on the PR. Previews use the `csa-tennis-preview` D1 database (the `previews` block in `wrangler.jsonc`), so testing never touches real members' data. `ADMIN_EMAIL` isn't set for Previews, so there is no admin there unless you add it under **Settings → Variables & Secrets → Previews Base**.

### Schema changes

The API token Workers Builds creates automatically can deploy the Worker but has no D1 permission. So schema changes are applied by hand before deploying the code that needs them:

```bash
npx wrangler d1 execute csa-tennis --remote --file=migrations/000N_name.sql
```

Run the same command with `csa-tennis-preview` so Previews stay in step.

## Security

| Control | Where |
|---|---|
| CSP `default-src 'none'`, no inline code, no third-party scripts | `src/http.js` |
| HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy | `src/http.js` (pages), `public/_headers` (assets) |
| Cross-site request forgery: POSTs must carry this site's `Origin` header; cookies are `SameSite=Lax` | `src/http.js`, `src/auth.js` |
| Open redirect: `?next=` only accepts local paths (`/x`, not `//x` or `/\x`) | `safePath` in `src/http.js` |
| Passwords: PBKDF2-SHA256, 100,000 iterations, per-user salt, constant-time compare | `src/auth.js` |
| Sessions: random 256-bit token in an `HttpOnly; Secure; __Host-` cookie; only its SHA-256 is stored; 30-day expiry; password change or reset logs out every device | `src/auth.js` |
| Brute force: 10 failed logins per email per 15 minutes locks that email | `src/auth.js` |
| SQL injection: bound parameters only | everywhere |
| XSS: every value goes through the auto-escaping `html` template | `src/views.js` |
| Double booking, guest limit, rating applied once: enforced by the database (unique indexes, single-statement checks, transactional batch) | `src/index.js`, schema |
| `/admin` returns 404 to non-admins | `src/index.js` |
| DDoS protection | Cloudflare, always on |

Search engines are asked not to index the site (`public/robots.txt`), because pages list member names.

**On workers.dev**, zone-level tools are not available: Bot Fight Mode, WAF custom rules and rate-limiting rules. When you add your own domain, turn on **Security → Bots → Bot Fight Mode**. Also add a rate-limiting rule for `POST /login` and `POST /register` (the Free plan includes one rule).

## Performance

- No client JavaScript. Each page is one HTML response plus one ~2 KB (compressed) stylesheet. Interactive bits use plain HTML and CSS: two-step `<details>` confirmations and a CSS `:has()` singles/doubles toggle (older browsers just show all fields).
- `app-v2.css` is cached for a year (`immutable`). To change styles, rename it to `app-v3.css` and update the link in `src/views.js`.
- Brotli/gzip compression is automatic at Cloudflare's edge. Cloudflare's Auto Minify feature has been retired, and the files are already small.
- HTML and the API are `no-store`, so the list of who's in is always live.
- Each page makes one to three D1 queries, using indexes on `registrations(event_id, id)` and `matches(status, id)`.

## Launch checklist

After the first deploy, with `URL=https://csa-tennis.<your-subdomain>.workers.dev`:

- [ ] **SSL:** `curl -sI $URL` shows `HTTP/2 200` and `strict-transport-security`.
- [ ] **Headers:** the same response has `content-security-policy`, `x-frame-options: DENY` and `x-content-type-options: nosniff`.
- [ ] **Caching:** `curl -sI $URL/app-v2.css` twice; the second shows `cf-cache-status: HIT` and `cache-control: public, max-age=31536000, immutable`.
- [ ] **Open redirect:** log in via `$URL/login?next=//example.com`; you land on `/`.
- [ ] **Admin:** registering with `ADMIN_EMAIL` shows the Admin link. Another account gets 404 on `/admin`.
- [ ] **Flow:** register → sign up → add a guest → withdraw → the waitlist moves up.
- [ ] **Ratings:** record a match → the opponent confirms → both ratings change on `/players`.
- [ ] **Speed:** PageSpeed Insights (mobile) ≥ 95.
- [ ] **Logs:** Worker → **Logs** shows requests, with no errors.
