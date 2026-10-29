# CLAUDE.md

## Pull requests
After opening a pull request, subscribe to its activity and drive it to green: fix failing checks, answer review comments, and resolve merge conflicts until it is merged or closed.

## Project
- Cloudflare Worker `csa-tennis` + D1 database `csa-tennis`. See README.md for architecture, security and deployment.
- `main` auto-deploys via Workers Builds (`npx wrangler deploy`). Pull-request branches build Previews (`npx wrangler preview`) against the separate `csa-tennis-preview` D1 database (`previews` block in `wrangler.jsonc`); apply schema changes to both databases. Schema changes are applied by hand (`wrangler d1 execute csa-tennis --remote --file=...`), because the build token has no D1 permission.
- Profile pictures: Cloudflare Images binding (`IMAGES`, also in `previews`) resizes uploads; WebP bytes are stored in the D1 `avatars` table. `wrangler dev` uses an offline Images stand-in (resize only).
- No client JavaScript; strict CSP (`default-src 'none'`). Keep interactions in HTML/CSS. The one exception (agreed with the owner) is `public/crop-v1.js`, the profile-picture cropper: only the Account page loads it, with `CSP_WITH_SCRIPT`. It must stay a progressive enhancement, so the plain upload works without it.
- Changing `public/crop-vN.js` means renaming it to the next N (cached for a year) and updating `CROP_SCRIPT` in `src/views.js`.
- Changing `public/app-vN.css` means renaming it to the next N (it is cached for a year) and updating the link in `src/views.js`.
- Schedule: the weekly default lives in the D1 `settings` table (key `schedule`). Each `events` row snapshots its own times (`start_min`, `end_min`, `opens_offset`, `closes_offset`); the current session is the earliest row dated today or later. Never derive past or current session times from the default.
- Admins: `users.is_admin`, plus the `ADMIN_EMAIL` owner, who is always admin and protected from other admins.
- Migrations `0003+` use `ALTER TABLE ... ADD COLUMN`, so apply each one exactly once per database.
- Checks before pushing: `npm test` and `npx wrangler deploy --dry-run`.
