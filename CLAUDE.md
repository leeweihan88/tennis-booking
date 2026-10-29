# CLAUDE.md

## Pull requests
After opening a pull request, subscribe to its activity and drive it to green: fix failing checks, answer review comments, and resolve merge conflicts until it is merged or closed.

## Project
- Cloudflare Worker `csa-tennis` + D1 database `csa-tennis`. See README.md for architecture, security and deployment.
- `main` auto-deploys via Workers Builds (`npx wrangler deploy`). Schema changes are applied by hand (`wrangler d1 execute csa-tennis --remote --file=...`), because the build token has no D1 permission.
- No client JavaScript; strict CSP (`default-src 'none'`). Keep interactions in HTML/CSS.
- Changing `public/app-vN.css` means renaming it to the next N (it is cached for a year) and updating the link in `src/views.js`.
- Checks before pushing: `npm test` and `npx wrangler deploy --dry-run`.
