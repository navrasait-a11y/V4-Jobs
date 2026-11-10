# End-to-end tests (Playwright)

```bash
npm run test:e2e        # headless, desktop + mobile (tests tagged @mobile)
npm run test:e2e:ui     # interactive runner
```

Playwright starts its own isolated stack, so nothing touches a real database or sends real SMS:

- `backend/scripts/e2e-stack.js`: in-memory MongoDB, master data + demo data seed, API on port 5055 with `OTP_DEV_BYPASS` (every OTP is `123456`).
- Vite on port 3055 pointed at that API.

Covered flows: spelling-corrected search, disjunctive filters, SEO landing pages and 404, guest Post Job (6 steps + OTP), guest Apply (3 steps + OTP, success screen), employer stepped Post Job (no auto-publish on the review step), sort by best match, job boost.

First run on a new machine: `npx playwright install chromium`.

Admin-panel tests sign in as a throwaway admin that `e2e-stack.js` creates in the in-memory database (`e2e.admin@example.test`, password `E2e-Admin-Local-1`, override with `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`). It never exists anywhere else.
