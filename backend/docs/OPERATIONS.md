# Operations checklist

Things to switch on in outside dashboards before launch. None of them need code changes.

## 1. Error monitoring (Sentry)

1. Create two Sentry projects: **Node.js** (API) and **React** (website).
2. API (Render / server env): `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`, optional `SENTRY_RELEASE` (git SHA).
3. Website (Vercel env): `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT=production`.
4. Leave them empty to turn monitoring off; nothing is loaded then.

What is sent: unexpected 5xx errors, crashes, background jobs that fail on their last retry, and React render crashes. Request bodies, cookies, auth headers and typed form values are never sent; users are tagged by id and role only.

## 2. Uptime checks

Add two monitors in UptimeRobot / Better Stack (1-minute interval, alert by e-mail + SMS):

| URL | Expect |
| --- | --- |
| `https://<api-host>/health` | 200, process is up |
| `https://<api-host>/ready` | 200, database connected (503 when MongoDB is down) |
| `https://<web-host>/` | 200 |

## 3. Database backups (MongoDB Atlas)

- **Cluster -> Backup**: turn on Cloud Backup (M10+) with continuous backup / point-in-time restore, or at least daily snapshots kept 7 days.
- On M0/M2/M5 (no cloud backup): schedule `mongodump --uri "$MONGODB_URI" --gzip --archive=backup-$(date +%F).gz` daily from a server, and copy it to R2.
- Test a restore into a spare cluster once before launch.

## 4. Typo-tolerant search (optional, Atlas Search)

The site already corrects spelling ("devloper" -> "developer") on any MongoDB. For better ranking on Atlas:

1. Atlas -> **Search** -> Create index on the `jobs` collection, name it `jobs_search`, JSON editor:

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "title": { "type": "string" },
      "designation": { "type": "string" },
      "keySkills": { "type": "string" },
      "roles": { "type": "string" },
      "description": { "type": "string" },
      "orgSnapshot": { "type": "document", "fields": { "name": { "type": "string" } } }
    }
  }
}
```

2. Set `ATLAS_SEARCH_INDEX=jobs_search` on the API. If the index is missing or a query fails, search falls back to the normal text index automatically (a warning is logged).

## 5. Before launch

- Remove demo data: `npm run demo:remove` (see `DEMO_LOGINS.local.md`).
- Test SMS OTP on a real phone and web push with the `VITE_FIREBASE_*` keys.
- Run the end-to-end tests: `cd frontend && npm run test:e2e` (see `frontend/e2e/README.md`).
