# Freejobwala Backend

Production backend for the Freejobwala job portal and recruitment marketplace (Naukri-style). It is a single REST and Socket.IO API used by both the **website** (candidate site, employer panel, super-admin panel) and the **Flutter app**.

* Stack: Node.js 20+, Express 5, MongoDB Atlas (Mongoose 8), Redis (Upstash, optional), BullMQ, Socket.IO 4.
* Integration guides for the client teams:
  * [Web frontend](docs/WEB_API_INTEGRATION.md)
  * [Mobile app](docs/MOBILE_APP_API_INTEGRATION.md)

---

## Architecture: modular monolith

```
src/
  server.js           HTTP + Socket.IO bootstrap, graceful shutdown
  worker.js           optional standalone queue worker (scale separately)
  app.js              Express app: security middleware, parsers, routes, error handling
  routes.js           API surface (all routers mounted under API_PREFIX)
  config/             env validation (Joi), logger (pino), MongoDB, Redis
  shared/
    constants/        roles, statuses, permissions, limits
    errors/, http/    ApiError + response envelope
    middleware/       auth/RBAC, validation, rate limits, uploads (magic-byte check), sanitisation, errors
    services/         storage (Cloudflare R2 / local), e-mail / SMS / WhatsApp / push / Arattai channels, queue, resume parser
    realtime/         Socket.IO server (JWT handshake, Redis adapter)
    utils/            pagination, timespan filters, Excel / CSV, crypto, CRUD factory
  modules/            one folder per business domain (model -> service -> routes)
    auth  users  candidates  employers  jobs  applications  talent  alerts  events  chat  notifications
    mailbox  billing  analytics  moderation  cms  masterdata  settings  activity  matching  admin  common
  jobs/               cron scheduler (with a Mongo distributed lock) + background tasks
scripts/              seed, create-admin, list-routes
tests/                end-to-end smoke tests (in-memory MongoDB replica set)
```

Rules the codebase follows:
* Modules talk to each other through **service functions**, never through another module's HTTP routes.
* Every request is validated with Joi. Unknown keys are stripped, so clients cannot mass-assign protected fields.
* Every response uses the same envelope `{ success, message, data, meta }` / `{ success:false, error:{code,message,details}, requestId }`.

### Main features

| Area | What is implemented |
|---|---|
| Auth | E-mail/password, mobile OTP, Google, JWT access tokens + rotating refresh tokens with reuse detection, 2FA (TOTP + backup codes), device/session management, account lockout, login statistics, admin "login as user" (audited) |
| Candidate | Full profile from the Excel forms, employment and education history, resume upload + parsing, resume builder data, profile completion matrix, saved jobs, follows, alerts, invites, deactivate/delete (PII scrub) |
| Employer | Company / consultancy organizations with `COMP-` / `CONS-` IDs, offices, KYC documents with admin verification, domain verification, team members (max 50) with roles, granular permissions and daily…yearly quotas |
| Jobs | Jobs and internships (`JOBS-` / `INTE-` IDs), drafts/auto-save, prefill and duplicate, publish with credits, refresh, close, collaborators, bulk Excel posting, post without login, Naukri-style search with facets, AI match score, recommendations, Google for Jobs JSON-LD, sitemap |
| ATS | Applications (also apply without login with auto-account), pipeline stages, screening / calling / messaging statuses, comments, forwarding, interviews with reminders, Excel export, ZIP resume export, funnel |
| Resume DB | Advanced candidate search (all PRD filters), masked contacts with credit-based unlock, resume download credits, saved / shared / recent searches, folders (custom + system), bulk invites that skip already-invited candidates |
| Engagement | Job alerts (registered + guest), job events with QR code, real-time chat (recruiter, candidate and support) with attachments, in-app/e-mail/SMS/WhatsApp/push/Arattai notifications, internal mailbox |
| Monetisation | Plans (employer + Profile Booster), Razorpay (UPI / cards / net banking / wallets), webhooks, GST invoices (CGST/SGST/IGST), coupons, referral rewards, wallet, auto-renew, admin package assignment, ads (banner / AdSense / AdMob) |
| Admin | Dashboards with timespan filters, candidate / employer / job management with bulk actions, Excel import (duplicate detection, rewrite, replace) and export, labels and situation tags, master data and location editor, CMS (pages, blogs, FAQs, policies), e-mail templates, bulk messaging (≤500), reports, comment moderation, blocklist, sales leads, chat dashboard, settings and API keys (encrypted), sub-admins with permissions, audit log |

---

## Getting started

```bash
cp .env.example .env        # fill MONGODB_URI, JWT_ACCESS_SECRET, ENCRYPTION_KEY at minimum
npm install
npm run seed                # master data from the client's Excel, plans, CMS pages, locations
SEED_ADMIN_EMAIL=admin@freejobwala.com SEED_ADMIN_PASSWORD='StrongPass@123' npm run seed:admin
npm run dev                 # http://localhost:5000/api/v1  (health: /health, readiness: /ready)
```

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The first value is for `JWT_ACCESS_SECRET`, the second for `ENCRYPTION_KEY` (64 hex characters).

Other scripts:

| Script | What it does |
|---|---|
| `npm test` | End-to-end smoke tests on an in-memory MongoDB replica set (18 flows) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run routes` | Print every endpoint (355 at the time of writing) |
| `npm run worker` | Standalone queue worker (needs `REDIS_URL`) |

Local development without third parties:
* `SMS_PROVIDER=console`, `WHATSAPP_PROVIDER=console`, and `EMAIL_PROVIDER=console` log messages instead of sending them.
* `OTP_DEV_BYPASS=true` makes every OTP `123456`. It is ignored in production.

---

## Production deployment

1. **MongoDB Atlas**:
   * Use a dedicated cluster (M10+ recommended). It is a replica set, so transactions are enabled.
   * Create a database user with least privilege.
   * Restrict Atlas network access to the server IPs.
   * Turn on Atlas continuous backups / point-in-time restore. This covers the backup & disaster recovery requirement.
2. **Redis (Upstash)**: optional but recommended. See "Redis (Upstash)" below. Set `REDIS_URL` to the `rediss://` connection string.
3. Set the production environment variables:
   * `NODE_ENV=production`
   * `COOKIE_SECURE=true` and `COOKIE_DOMAIN=.yourdomain.com`
   * `CORS_ORIGINS` = the exact web and admin origins
   * `TRUST_PROXY` = the number of proxies in front of the app
   * `STORAGE_DRIVER=r2` and the `R2_*` keys - see "Media storage (Cloudflare R2)" below. The app refuses to boot in production on local storage.
   * Brevo (e-mail) and APITxT (SMS) keys - see "E-mail (Brevo) & SMS (APITxT)" below
   * Meta WhatsApp, Firebase, Razorpay and Google client IDs
4. Run the app with one of these:
   * **Docker:** `docker compose up -d --build` (API only; Mongo is on Atlas, Redis on Upstash).
   * **PM2:** `pm2 start ecosystem.config.cjs --env production` (`WEB_CONCURRENCY` instances, default 1).
5. Put it behind HTTPS (Nginx, an ALB or Cloudflare). Enable WebSocket upgrade for `/socket.io`. Add DDoS / WAF protection at the edge (Cloudflare or AWS Shield).
6. Razorpay webhook:
   * URL: `https://<api>/api/v1/billing/webhooks/razorpay`
   * Events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`
   * Secret: `RAZORPAY_WEBHOOK_SECRET`
7. After the first deploy, set `MONGODB_AUTO_INDEX=false`. From then on, build indexes as part of releases.
8. Scheduled jobs run on every instance behind a Mongo lock, so each task runs only once per tick:
   * expire jobs
   * job alert digests
   * interview reminders
   * subscription expiry, reminders and auto-renew
   * profile completion nudges

   Scale e-mail and notification throughput by adding `npm run worker` processes.

### Render (API hosting)

`render.yaml` in the repo root describes the service (Blueprint). For an existing service set the same values by hand:

* **Settings:** Root directory `backend`, Build `npm ci --omit=dev`, Start `node src/server.js`, Health check path `/ready`, Node 22 (`NODE_VERSION=22`). Region close to Atlas (Singapore / Mumbai).
* **URLs:** `APP_URL=https://<api domain>` (no trailing slash; also used for the e-mail logo at `/brand/logo.png`), `WEB_URL=https://<website>`, `ADMIN_URL` = same as `WEB_URL`, `CORS_ORIGINS=https://<website>,https://www.<website>`.
* **Cookies:** `COOKIE_SECURE=true`. Set `COOKIE_DOMAIN=.yourdomain.com` only when the API and the website share that domain (api.freejobwala.com + freejobwala.com); leave it empty on `*.onrender.com` / `*.vercel.app`.
* **SMS:** `SMS_PROVIDER=apitxt`, `APITXT_API_KEY=<key>`, `APITXT_OTP_MODE=otp_api`. Remove any `APITXT_OTP_MODE=dlt` until all DLT ids are approved.
* **Payments:** live `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (step 6 above), `COMPANY_GSTIN`, `COMPANY_ADDRESS`, `COMPANY_LEGAL_NAME`.
* **Keep** `JWT_ACCESS_SECRET` and `ENCRYPTION_KEY` unchanged once live: a new JWT secret logs everyone out, a new encryption key makes settings saved from the admin panel unreadable.
* After deploy: open `https://<api>/ready` (should say `ready`), `https://<api>/brand/logo.png` (the logo), then Admin > Platform Health (warnings list) and Admin > Settings > Integrations > "Send a test OTP SMS".
* Free instances sleep after 15 minutes without traffic; the first request then takes ~1 minute and scheduled jobs pause. Use a paid instance for production.

### Redis (Upstash)

Copy the TCP connection string from Upstash (database > Details) into `REDIS_URL`. It must start with `rediss://`; the REST URL and token are not used. Keep eviction **off** on the database, because BullMQ jobs must not be evicted. Pick the Upstash region closest to the server.

Redis is used for the job queue and for shared auth / OTP / form rate limits. If it is down or out of quota, the API keeps working: rate limits use per-instance memory, and jobs run in-process without queue retries. `GET /ready` reports the Redis state but never fails because of it.

The free plan allows 500K commands a month (about 11 per minute) and 256 MB, so the defaults are frugal:

| Setting | Default | Effect |
|---|---|---|
| `REDIS_RATE_LIMIT_SCOPE` | `sensitive` | Only auth, OTP and form limits use Redis. `all` costs one command per API request |
| `REDIS_SOCKET_ADAPTER` | `false` | Turn on only with more than one API instance |
| `QUEUE_DRAIN_DELAY_SECONDS` | `120` | Idle worker long-poll. New jobs still start immediately |
| `QUEUE_STALLED_INTERVAL_MS` | `300000` | Stalled-job check every 5 minutes |
| `QUEUE_CONCURRENCY` | `5` | Parallel jobs per worker |
| `REDIS_QUEUE_ENABLED` | `true` | `false` skips BullMQ and runs jobs in-process |

Run a single API instance on the free plan, and do not run `npm run worker` separately. With more instances, set `REDIS_SOCKET_ADAPTER=true` and `WEB_CONCURRENCY`, and expect to need a paid or fixed Upstash plan. Every e-mail, SMS, push or fan-out notification is a queue job costing several commands, so watch the command count in the Upstash console, and upgrade before launch traffic if it trends past the limit.

### E-mail (Brevo) & SMS (APITxT)

The server refuses to start in production if a selected provider's required keys are missing.

**Brevo** (`EMAIL_PROVIDER=brevo`)
1. Brevo > *Senders, Domains & Dedicated IPs*: authenticate your domain (SPF, DKIM, DMARC records) and add the sender in `MAIL_FROM_EMAIL`.
2. Brevo > *SMTP & API > API Keys*: create a key and put it in `BREVO_API_KEY`.
3. Brevo > *Transactional > Settings > Webhook*: URL `https://<api-domain>/api/v1/webhooks/brevo?token=<BREVO_WEBHOOK_TOKEN>`, events: delivered, soft/hard bounce, blocked, spam, invalid e-mail, error, opened, clicked. E-mail logs then show real delivery status in the admin statistics.
4. `BREVO_SANDBOX=true` on staging validates calls without delivering.

**APITxT** (`SMS_PROVIDER=apitxt`) - Indian SMS must follow TRAI DLT rules:
1. Register your entity, sender id (header) and the SMS templates on your DLT portal (or through APITxT). Put the entity id in `APITXT_PE_ID` and the header in `APITXT_SENDER_ID`.
2. Register these template texts (DLT variable = `{#var#}`) and copy each approved template id into `.env`:

   | Key | `.env` | Text |
   |---|---|---|
   | otp | `APITXT_TEMPLATE_OTP` | `{#var#} is your Freejobwala OTP. Valid for {#var#} minutes. Do not share it with anyone.` |
   | interview | `APITXT_TEMPLATE_INTERVIEW` | `Interview for {#var#} at {#var#} on {#var#}. Check Freejobwala app for details.` |
   | interview_reminder | `APITXT_TEMPLATE_INTERVIEW_REMINDER` | `Reminder: your interview for {#var#} is on {#var#}. Check Freejobwala app for details.` |
   | generic | `APITXT_TEMPLATE_GENERIC` | `{#var#} - {#var#} - Freejobwala` |
   | bulk | `APITXT_TEMPLATE_BULK` | `{#var#} - Freejobwala` |

3. If DLT approves a different wording, change the text (and optionally the id) from the admin panel: `PUT /api/v1/admin/settings/integrations.smsTemplates` with `{ "value": { "otp": { "text": "...{{otp}}...", "templateId": "..." } } }`. The text must match the approved template exactly.
4. Alternative for OTP only: `APITXT_OTP_MODE=otp_api` uses APITxT's managed OTP route (`/api/sendOTP`) and does not need `APITXT_TEMPLATE_OTP`.
5. A message type whose template id is missing is **not sent** (logged as failed with the reason) instead of being rejected by operators.

**Verify after deploy** (admin token): `POST /api/v1/admin/settings/test-email { "to": "you@domain.com" }` and `POST /api/v1/admin/settings/test-sms { "mobile": "98XXXXXXXX", "template": "otp" }` send one real message and return the provider error, if any.

Delivery behaviour: messages go through the queue; network errors, timeouts, 429 and 5xx are retried with back-off (4 attempts), while permanent errors (invalid key, sender, DLT mismatch, low balance) are not retried. Every message has a row in EmailLog / MessageLog, and a retried job never sends twice.

### Media storage (Cloudflare R2)

Development uses local disk. Production must use R2 (`STORAGE_DRIVER=r2`). R2 public access covers a whole bucket, so there are two buckets:

| Bucket | Holds | Public access |
| --- | --- | --- |
| `R2_PUBLIC_BUCKET` | Logos, covers, avatars, event banners, CMS images | ON, through a custom domain |
| `R2_PRIVATE_BUCKET` | Resumes, KYC documents, chat files | OFF. Reachable only through short-lived signed URLs |

1. Cloudflare > R2: create both buckets. Note the **Account ID** for `R2_ACCOUNT_ID`.
2. Public bucket > Settings > Custom Domains: connect e.g. `media.yourdomain.com` and put `https://media.yourdomain.com` in `R2_PUBLIC_URL`. The domain must be a zone in the same Cloudflare account. Keep the `r2.dev` URL disabled: it is rate-limited and meant for development.
3. Private bucket: leave public access off, and connect no domain.
4. R2 > Manage API tokens: create a token with **Object Read & Write**, limited to these two buckets. Put the Access Key ID and Secret Access Key in `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. The secret is shown only once.
5. Set `STORAGE_DRIVER=r2` and run `npm run r2:check`. It uploads test files, proves the private file is not publicly reachable, and deletes them.

6. Move existing local files: `npm run r2:migrate` shows what would change, then `npm run r2:migrate -- --apply` copies the files and rewrites the stored public URLs. Run it from the machine that holds `uploads/`. Local files are kept and it is safe to repeat.

No bucket CORS rule is needed: uploads go through the API and files open as plain links.

### Security controls

* Helmet security headers (HSTS in production), a strict CORS allow-list, and an `X-Request-Id` on every request.
* Rate limits backed by Redis:
  * global,
  * auth (brute force),
  * OTP (SMS spend),
  * public forms,
  * heavy endpoints (search / exports) per user.
* Input safety:
  * Joi validation with unknown keys stripped (no mass assignment).
  * NoSQL operator and prototype-pollution sanitising.
  * Escaped regex search.
  * HTML sanitising for CMS, mail and chat content.
  * CSV formula-injection guard.
* Passwords use bcrypt (cost 12). Accounts lock after 5 failed logins. OTPs are stored hashed, with attempts limited and a resend cooldown.
* Tokens:
  * Short-lived JWT access tokens.
  * Rotating, hashed refresh tokens with reuse detection.
  * `tokenVersion` revokes every session on a password reset or block.
  * The web refresh cookie is httpOnly with an Origin check (CSRF).
* Secrets at rest (2FA secrets, third-party API keys in admin settings) are encrypted with AES-256-GCM.
* Uploads:
  * Type allow-lists plus magic-byte verification and size limits.
  * Private files only through short-lived signed URLs, with a path-traversal guard.
* RBAC and data visibility:
  * Roles: candidate / employer / admin / super_admin, plus employer team permissions and quotas, plus admin sub-permissions.
  * Unique IDs (`CAND-…`, `COMP-…`) are hidden from non-admins.
  * Candidate contacts stay masked until unlocked.
  * Blocks are respected in search, apply and chat.
* Audit log of admin actions, user activity history, login attempts, and e-mail / message delivery logs.
* GDPR-style self-deletion scrubs personal data. There are consent flags and a privacy visibility setting.

## Pre-launch demo data

`DEMO_PASSWORD=... npm run demo:seed` adds demo employers, jobs, candidates, blogs and FAQs. `npm run demo:remove` deletes exactly those records and their media files (add `-- --dry-run` to preview). A file a real record still uses is kept. Run it with the production `STORAGE_DRIVER=r2` so the files also leave Cloudflare using the `demo_manifest` collection. Run the removal before launch.
