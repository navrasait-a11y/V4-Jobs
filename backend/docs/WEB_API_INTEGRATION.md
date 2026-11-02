# Freejobwala – Web Frontend API Integration Guide

For the **web team** (React / Next.js): Candidate website, Employer panel (Company / Consultancy) and Super Admin panel.
The same backend also serves the Flutter app.

---

## 1. Basics

| Item | Value |
|---|---|
| Base URL | `https://<api-domain>/api/v1` (local: `http://localhost:5000/api/v1`) |
| Format | JSON (`Content-Type: application/json`). File uploads use `multipart/form-data` |
| Auth | `Authorization: Bearer <accessToken>` |
| Time | All dates are ISO-8601 UTC. Show them in IST on the UI |
| Health | `GET /health` (alive), `GET /ready` (DB connected) – these are outside `/api/v1` |

### Headers to send on every request

| Header | Value | Why |
|---|---|---|
| `Authorization` | `Bearer <accessToken>` | Protected endpoints |
| `X-Client-Platform` | `web` | Session/device list |
| `X-Device-Id` | Stable random id saved in `localStorage` | One session per browser |
| `X-Device-Name` | e.g. `Chrome on Windows` | Shown in "Devices" list |
| `X-Request-Id` | Optional | Returned back in every response. Quote it in bug reports |

Calls that use the refresh cookie must include credentials: `fetch(url, { credentials: 'include' })` or `axios.defaults.withCredentials = true`.

### Success response

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7, "hasNext": true }
}
```

`meta` is present only on lists. Some lists add extra counts to `meta`, for example `counts`, `stages`, `unread`, `summary`.

### Error response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [{ "field": "mobile", "message": "Enter a valid 10 digit Indian mobile number", "location": "body" }]
  },
  "requestId": "6c1f..."
}
```

| HTTP | Typical `error.code` | What the UI should do |
|---|---|---|
| 400 | `BAD_REQUEST`, `OTP_INVALID`, `OTP_EXPIRED`, `JOB_CLOSED`, `INVALID_FILE_TYPE`, `JOB_INCOMPLETE` | Show `message` |
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `SESSION_REVOKED`, `TOKEN_REVOKED`, `INVALID_CREDENTIALS` | `TOKEN_EXPIRED`: refresh and retry once. Others: log out |
| 402 | `INSUFFICIENT_CREDITS`, `FEATURE_LOCKED`, `WALLET_INSUFFICIENT` | Employer: open "Buy plan" |
| 403 | `FORBIDDEN`, `PERMISSION_DENIED`, `MEMBER_QUOTA_EXCEEDED`, `ACCOUNT_DISABLED`, `ORG_PENDING`, `BLOCKED`, `CSRF_BLOCKED` | Show `message` |
| 404 | `NOT_FOUND`, `ROUTE_NOT_FOUND` | Not found page |
| 409 | `EMAIL_TAKEN`, `MOBILE_TAKEN`, `USERNAME_TAKEN`, `ALREADY_APPLIED`, `DUPLICATE_KEY` | Inline field error |
| 413 | `PAYLOAD_TOO_LARGE` | File or body too large |
| 422 | `VALIDATION_ERROR` | Map `details[].field` to the form fields |
| 429 | `RATE_LIMITED`, `OTP_COOLDOWN`, `ACCOUNT_LOCKED` | Show message or a countdown |
| 500 | `INTERNAL_ERROR` | Generic error and `requestId` |

### Lists, filters and exports

* Pagination: `?page=1&limit=20`. Allowed page sizes are `10, 20, 30, 40, 60, 80, 100, 150, 200`. The maximum is 200.
* Sort: `?sort=-createdAt` (`-` means descending). Each endpoint lists the fields it accepts.
* Multi-value query params: send them comma-separated (`location=Jaipur,Delhi`) or repeat the key.
* **Timespan filter**, used on admin and analytics screens: `?timespan=24h|7d|14d|30d|90d|120d|6m|9m|12m|today|yesterday`. For a custom range use `?timespan=custom&from=2026-10-01T00:00:00Z&to=2026-10-15T23:59:59Z`.
* Exports return a file download. `?format=xlsx` is the default; `?format=csv` is also accepted. Read the response as a blob and use the file name from the `Content-Disposition` header.

### Files

* Max sizes: resume 5 MB (PDF / DOC / DOCX), images 5 MB (JPG / PNG / WEBP / GIF), KYC documents 10 MB (PDF / images), Excel imports 20 MB.
* The server checks the file's real content (magic bytes). A renamed file is rejected with `INVALID_FILE_CONTENT`.
* **Public files** (logos, avatars, blog images) come with a permanent `url`.
* **Private files** (resumes, KYC documents, chat attachments) come with a `downloadUrl` / `url` that **expires in 10–60 minutes**. Do not cache it. Fetch the record again to get a fresh link.

### Bootstrap calls (call once at app start, they are cacheable)

| Endpoint | Use |
|---|---|
| `GET /settings/public` | Feature flags: `platform.profileDeleteEnabled`, `platform.googleJobsEnabled`, `payments.methods`, `payments.gstPercent`, `ads.adsenseClientId`, support e-mail and phone, maintenance mode |
| `GET /enums` | Fixed enums: pipeline stages, screening / calling / messaging statuses, report reasons, labels, employer permissions, quota metrics, page sizes, timespans, bulk limits |
| `GET /master-data/bulk?types=gender,experience_level,heard_from,...` | All dropdowns of a form in one call (max 30 types) |

---

## 2. Authentication

### 2.1 Token model

* **Access token** (JWT) is valid for **15 minutes**. Keep it in memory only, not in `localStorage`.
* **Refresh token** is valid for 30 days and **rotates on every refresh**. On the web it is set as an **httpOnly cookie** `fjw_rt` (path `/api/v1/auth`). It is also returned in the body, but the web should rely on the cookie.
* **Silent refresh:** on `401 TOKEN_EXPIRED` call `POST /auth/refresh` with `credentials: 'include'` and an empty body, then replay the original request. Make sure only one refresh runs at a time (queue the other requests behind it).
* Reusing an old refresh token revokes the session (theft protection), so the user has to log in again.
* On page load, call `POST /auth/refresh` to restore the session, then call `GET /auth/me`.

### 2.2 Endpoints

| Method | Path | Auth | Body / Query | Notes |
|---|---|---|---|---|
| POST | `/auth/register/candidate` | – | see below | Returns a session. Sends a mobile OTP and an e-mail verification link |
| POST | `/auth/register/employer` | – | see below | Organization starts as `pending` until an admin approves it. The Free plan is granted automatically |
| GET | `/auth/availability` | – | `?username=&email=&mobile=` | `{ username: true }` = available |
| POST | `/auth/login` | – | `{ identifier, password, role? }` | `identifier` = e-mail, mobile or username. `role`: `candidate` / `employer` / `admin` (portal check) |
| POST | `/auth/otp/send` | – | `{ mobile }` or `{ email }`, `channel?: sms\|whatsapp` | OTP login. 30 s resend cooldown |
| POST | `/auth/otp/login` | – | `{ mobile\|email, otp, role? }` | |
| POST | `/auth/google` | – | `{ idToken, role?: candidate\|employer, organizationName?, employerType?, mobile? }` | Google Identity Services credential. New employers must send `organizationName` |
| POST | `/auth/2fa/verify` | – | `{ challengeToken, code }` | Used when login returned `twoFactorRequired` |
| POST | `/auth/refresh` | cookie | `{}` | Returns `{ tokens }` |
| POST | `/auth/logout` | ✔ | `{ allDevices?: boolean }` | |
| GET | `/auth/me` | ✔ | – | `{ user, organization?, profile?, impersonatedBy }` |
| POST | `/auth/password/forgot` | – | `{ email }` or `{ mobile }` | E-mail sends a link `WEB_URL/reset-password?token=...`. Mobile sends an OTP |
| POST | `/auth/password/reset` | – | `{ token, password }` or `{ mobile, otp, password }` | Also used for `/set-password?token=` (account activation links) |
| POST | `/auth/password/change` | ✔ | `{ currentPassword, newPassword }` | Logs out the other devices |
| POST | `/auth/email/verify` | – | `{ token }` | Page `WEB_URL/verify-email?token=...` |
| POST | `/auth/email/send-verification` | ✔ | – | |
| POST | `/auth/mobile/send-otp` | ✔ | `{ channel?: sms\|whatsapp }` | |
| POST | `/auth/mobile/verify` | ✔ | `{ otp }` | |
| POST | `/auth/contact/change` | ✔ | `{ email }` or `{ mobile }` | OTP goes to the **new** contact |
| POST | `/auth/contact/confirm` | ✔ | `{ email\|mobile, otp }` | |
| GET | `/auth/sessions` | ✔ | – | Device management. `isCurrent` flag |
| DELETE | `/auth/sessions/:sessionId` | ✔ | – | Log out one device |
| POST | `/auth/2fa/setup` | ✔ | – | `{ secret, otpauthUrl, qrCode }` – show `qrCode` (data URL) |
| POST | `/auth/2fa/enable` | ✔ | `{ code }` | Returns `backupCodes` **once**. Ask the user to save them |
| POST | `/auth/2fa/disable` | ✔ | `{ password, code }` | |
| PATCH | `/me` | ✔ | `{ fullName, displayName, username, gender, about, socialLinks[], notificationPrefs{}, designation, department[], hiringAuthority }` | Own basic details for any role. The last three are for employer users ("Who will manage hiring on this account?") |
| POST | `/me/avatar` | ✔ | multipart `avatar` | Profile photo for employer and admin users (candidates may also use `/candidates/me/avatar`) |
| GET | `/me/activity` | ✔ | `?page&limit&timespan&type` | User Activity History (login, logout, e-mails, ...) |
| GET | `/me/login-history` | ✔ | `?page&limit` | |

**Candidate registration body** (Excel sheet "Candidate Registration Form"):

```json
{
  "experienceLevel": "Experienced",
  "fullName": "Ravi Kumar",
  "gender": "Male",
  "email": "ravi@example.com",
  "password": "Secret123",
  "mobile": "9876543210",
  "heardFrom": "Google Search",
  "username": "ravi_kumar",
  "referralCode": "AB12CD34",
  "consentCommunication": true,
  "acceptTerms": true
}
```

`experienceLevel` options come from `master-data/experience_level` (I have Experience / I am a Fresher / I did an Internship / I did an Apprenticeship). `username` is optional (auto-generated if missing): 3–30 characters, letters, digits or `_`, and it cannot start or end with `_`. `password` is 8–64 characters with at least one letter and one digit. `acceptTerms` must be `true`.

**Employer registration body** (Excel "Employer Registration Form"):

```json
{
  "employerType": "company",
  "organizationName": "Tech Corp",
  "fullName": "Anita Sharma",
  "gender": "Female",
  "email": "hr@techcorp.com",
  "password": "Secret123",
  "mobile": "9876500001",
  "designation": "HR Manager",
  "heardFrom": "LinkedIn",
  "declarations": { "authorized": true, "noCandidateFee": true },
  "consentCommunication": true,
  "acceptTerms": true
}
```

**Auth success `data`** (register, login, OTP login, Google, 2FA):

```json
{
  "user": { "_id": "...", "role": "candidate", "fullName": "...", "username": "...", "email": "...", "mobile": "...",
            "isEmailVerified": false, "isMobileVerified": false, "isVerified": false, "status": "active", "labels": [],
            "avatar": { "url": null }, "twoFactor": { "enabled": false }, "employer": null },
  "tokens": { "accessToken": "eyJ...", "refreshToken": "...", "tokenType": "Bearer", "refreshExpiresAt": "..." },
  "organization": { },
  "profile": { "profileCompletion": 35 },
  "verification": { "mobileOtpSent": true, "emailLinkSent": true }
}
```

When 2FA is on, login returns `{ "twoFactorRequired": true, "challengeToken": "..." }`. Show the authenticator code screen and call `/auth/2fa/verify`.

Roles: `candidate`, `employer`, `admin`, `super_admin`. Unique IDs such as `CAND-17102026000001`, `COMP-...`, `CONS-...`, `JOBS-...` and `INTE-...` are **only returned to admins**.

### 2.3 Badges

* **Verified Candidate** (`user.isVerified`): e-mail and mobile verified, and the account is approved by an admin.
* **Verified Employer** (`organization.isVerified`): owner's e-mail and mobile verified, and all KYC documents verified by an admin.
* **Resume available**: candidate cards carry `hasResume`.

---

## 3. Master data, locations and enums (all dropdowns)

All dropdown and suggestion lists in the Excel are served from master data, so admins can edit them.

| Method | Path | Notes |
|---|---|---|
| GET | `/master-data/types` | `[{ key, label, userAddable }]` |
| GET | `/master-data/:type?q=&parent=&parents=&limit=` | Type-ahead. `parent` (id) gives children. `parents=A|B` (pipe-separated parent names, up to 10) returns the children of those parents with `parentName` on each item: `sub_industry` (parents: industries), `department_function` (parents: departments), `degree` (parents: education levels), `specialisation` (parents: degree names, or `Level>Degree` such as `Graduate>B.Com` because a course name can repeat across levels) |
| GET | `/master-data/bulk?types=a,b,c` | Many types at once |
| POST | `/master-data/:type/suggest` ✔ | `{ name }` – "Add new option" by users. Only for `job_title`, `key_skill`, `it_skill`, `institution`, `company_name`, `certification` |
| GET | `/locations?q=jaip&state=&city=&popular=true&limit=20` | Returns `{ locality, district, city, state, country, displayName }`, e.g. "Jagatpura, Jaipur, Rajasthan, India" |
| GET | `/locations/states`, `/locations/cities?state=` | |

**Types:** `experience_level, journey_status, present_job_status, heard_from, gender, marital_status, guardian_relation, caste_category, disability_status, disability_type, military_status, service_type, english_fluency, language, asset, job_title, key_skill, it_skill, company_name, employer_type, employment_type, job_mode, shift, salary_type, perk, notice_period, industry, department, job_role, education_level, degree, specialisation, institution, education_status, education_type, education_medium, marks_type, certification, social_platform, hiring_status, hiring_authority, organization_type, company_size, office_type, document_type, situation_tag, faq_category, blog_category, job_category`.

Store and send the option's **`name`** (string) in profile, job and alert fields, not its `_id`.

**Selection limits** (from the client's Excel, the API enforces these too): key skills ≤ 15, IT skills ≤ 15, industries ≤ 5, departments ≤ 5, job roles ≤ 10, languages ≤ 10, assets ≤ 10, certifications ≤ 10, preferred locations ≤ 3, preferred job modes ≤ 3, preferred shifts ≤ 3, job modes ≤ 3 per employment.

---

## 4. Candidate (website)

### 4.1 Profile

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/candidates/me` | – | `{ user, profile, completion: { score, sections[], missing[] } }` – use it for the Profile Completion Matrix |
| PATCH | `/candidates/me` | any subset (below) | Returns the updated `{ user, profile, completion }` |
| GET | `/candidates/me/dashboard` | – | Counts (applied, saved, following, activeAlerts, pendingInvites), stage counts, recent applications |
| POST | `/candidates/me/employments` | employment | |
| PATCH | `/candidates/me/employments/:itemId` | partial employment | |
| DELETE | `/candidates/me/employments/:itemId` | – | |
| POST / PATCH / DELETE | `/candidates/me/educations[/:itemId]` | education | |
| POST | `/candidates/me/resume` | multipart `resume` (PDF / DOC / DOCX ≤ 5 MB) | Returns `{ resume: { name, size, downloadUrl }, parsed: { email, mobile, skills[], links[], totalExperienceYears }, completion }`. Offer `parsed.skills` as one-click additions |
| DELETE | `/candidates/me/resume` | – | |
| GET | `/candidates/me/resume/download` | – | `{ url, name }` (temporary link) |
| POST | `/candidates/me/avatar` | multipart `avatar` | |
| GET / PUT | `/candidates/me/resume-builder` | any JSON (≤ 60 keys) | Resume Builder data. GET pre-fills from the profile until the first save |
| POST | `/candidates/me/deactivate` | `{ reason? }` | Logging in again reactivates the account |
| DELETE | `/candidates/me` | `{ reason? }` | Only when `platform.profileDeleteEnabled` is true (hide the button otherwise) |

**`PATCH /candidates/me` fields** (Excel sheet "Candidate Profile"):

| Group | Fields |
|---|---|
| Identity | `fullName, displayName, username, gender, about, socialLinks[{platform,url}]` |
| Journey | `experienceLevel, journeyStatus, presentJobStatus, availabilityStatus (open_to_work\|not_available\|serving_notice)` |
| Personal | `dob, maritalStatus, guardianRelation, guardianName, category, currentLocation{locality,district,city,state,country,pincode}, hometown{...}, disability{status,type}, military{status,serviceType}, englishFluency, languages[], assets[], hasTwoWheeler, hasFourWheeler, drivingLicense` |
| Resume | `resumeHeadline, profileSummary, keySkills[], itSkills[], certifications[]` |
| Work | `totalExperience{years,months}, currentSalary (monthly in-hand), noticePeriod, industries[], subIndustries[] (≤20), departments[], functions[] (≤20), roles[]` |
| Preferences | `preferences{ jobModes[] (≤3), locations[place] (≤3), willingToRelocate, anywhereInIndia, expectedSalary, employmentTypes[], shifts[], skills[], industries[], subIndustries[], departments[], functions[], roles[], noticePeriod, jobTypes['job','internship'] }` |
| Social / portfolio | `socialProfiles[{platform,url}], portfolios[{name,url}]` |
| Settings | `notificationPrefs{email,sms,whatsapp,push,jobAlerts,recruiterMessages,marketing}, privacy{profileVisibility: public\|recruiters\|hidden, showContact}` |

**Employment item:** `jobTitle*, employerName*, employerType, employmentType, jobModes[] (≤3), location{place}, shift, isCurrent, startDate, endDate (omit when isCurrent), salaryType, monthlySalary, perks[], noticePeriod, description (≤ 4000 words), skills[] (≤15), industries[] (≤5), departments[], roles[] (≤10)`.
**Education item:** `level*, degree, specialisation, institution, status (Pursuing / Pass Out), startDate, endDate, educationType, medium, marksType, marks, isHighest`.
Dates in the "MM-YYYY" pickers: send the first day of that month as ISO, e.g. `2022-06-01`.

### 4.2 Jobs (public + candidate)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/jobs` | optional | Search (filters below). For a logged-in candidate each item also has `hasApplied`, `isSaved`. Blocked employers are hidden |
| GET | `/jobs/facets` | – | Same filters. Returns counts for the side filters: `workMode, department, industry, location, role, postedBy, companyType, employmentType, kind` → `[{ value, count }]` |
| GET | `/jobs/recommended` | candidate | AI-ranked jobs with `matchScore` (0–100) |
| GET | `/jobs/saved` | candidate | Favourite jobs |
| GET | `/jobs/:idOrSlug` | optional | Full job + `organizationProfile` + `isOpen`. For candidates also `hasApplied`, `application`, `isSaved`, `match{score, breakdown}` |
| GET | `/jobs/:id/similar` | – | |
| GET | `/jobs/:id/share` | – | Share links: facebook, twitter, linkedin, whatsapp, telegram, sms, plus a plain url for Instagram / Arattai |
| POST / DELETE | `/jobs/:id/save` | candidate | |
| GET | `/jobs/:idOrSlug/google-jobs` | – | **schema.org JobPosting JSON-LD**. Inject it into the job page `<head>` as `<script type="application/ld+json">` (only when `platform.googleJobsEnabled`) |
| GET | `/jobs/sitemap.xml` | – | Proxy it or link it from `robots.txt` |

**Search query params:** `q` (keywords: title / skills / company), `kind=job|internship|any`, `location` (cities or states, comma-separated), `includeRemote`, `experience` (years), `salaryMin`, `salaryMax` (monthly), `stipendMin`, `durationMax` (internship months), `workMode`, `department`, `role`, `industry`, `employmentType`, `education`, `skills`, `shift`, `label` (`premium, starred, featured, actively_hiring, urgent`), `category` (IT Jobs / Non IT Jobs / Work From Home Jobs …), `companyType` (Indian MNC, Startup …), `postedBy=company|consultancy`, `organization` (employer id), `topCompanies=true`, `verifiedOnly=true`, `freshness=1|3|7|15|30` (days), `sort=relevance|date|salary`, `page`, `limit`. Also `function` and `subIndustry` (comma-separated) filter by department function and sub industry.

**Job list item fields:** `_id, slug, kind, title, designation, organization, organizationType, orgSnapshot{name,logo,isVerified,slug,username,employerType}, locations[], isRemote, experience{min,max}, salary{min,max,period,hidden,currency}, stipend, duration, jobModes, employmentTypes, keySkills, labels, isFeatured, publishedAt, refreshedAt, deadlineAt, openings, consultancyClient{name?,hideName}, stats.applications`.
If `salary.hidden` is true, show "Not disclosed". If `consultancyClient.hideName` is true, the client name is not sent.

### 4.3 Apply and track (ATS for candidates)

| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | `/jobs/:id/apply` | candidate | JSON `{ answers:[{question,answer}], coverLetter?, eventId?, source? }` **or** multipart with an optional `resume` file (`answers` sent as a JSON string) | Uses the profile resume when no file is sent. Errors: `ALREADY_APPLIED` 409, `JOB_CLOSED`, `ANSWER_REQUIRED`, `EXTERNAL_APPLY` (open `details.url`), `BLOCKED` |
| POST | `/jobs/:id/guest-apply/otp` | – | `{ mobile }` | **Apply without login**, step 1 |
| POST | `/jobs/:id/guest-apply` | – | multipart (below) + optional `resume` | Step 2. Auto-creates the candidate account (or reuses it) and **returns a full session** (`tokens`, `user`) plus `isNewUser` |
| GET | `/applications` | candidate | `?stage=&kind=&page&limit` | `meta.counts` = per-stage counts |
| GET | `/applications/:id` | candidate | – | Includes `history[{stage,at}]` and `interviews[]` |
| POST | `/applications/:id/withdraw` | candidate | – | |
| GET | `/interviews` | ✔ | `?from&to&status&job` | Candidate: own interviews |
| POST | `/interviews/:id/respond` | candidate | `{ response: accepted\|declined }` | |
| GET | `/invites` | candidate | `?status=sent\|viewed\|applied\|declined` | "Job Invite Responses" (opening the list marks them viewed) |
| POST | `/invites/:id/decline` | candidate | – | |

**Guest apply multipart fields** (PRD "Candidate Job Apply form"): `otp*, fullName*, mobile*, email*, acceptTerms*=true, gender, dob, maritalStatus, disability (JSON {status,type}), military (JSON), hasTwoWheeler, hasFourWheeler, drivingLicense, assets (JSON array), education (JSON {level,degree,specialisation,institution}), presentJobStatus, experienceLevel, totalExperienceMonths, currentJobTitle, currentSalary, keySkills (JSON array), roles (JSON), departments (JSON), industries (JSON), currentCompany, currentCompanyType, employmentType, currentlyWorking, workLocation (JSON place), noticePeriod, currentLocation (JSON place), languages (JSON), englishFluency, preferredLocations (JSON array, ≤4), heardFrom, consentCommunication, answers (JSON), eventId`.

Pipeline stages: `applied → screened → interview_scheduled → offered → hired` (also `rejected`, `withdrawn`).

### 4.4 Job alerts

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/job-alerts/prefill` | candidate | Pre-filled alert from the profile |
| GET / POST | `/job-alerts` | candidate | Max 10 alerts per user |
| PATCH | `/job-alerts/:id` | candidate | `{ isActive:false }` pauses the alert |
| DELETE | `/job-alerts/:id` | candidate | |
| GET | `/job-alerts/responses?alertId=` | candidate | Jobs delivered by the alerts ("Job Alerts Responses") |
| POST | `/job-alerts/guest/otp` | – | `{ mobile }` – unregistered users |
| POST | `/job-alerts/guest` | – | multipart: alert fields + `otp, fullName, mobile, email, acceptTerms=true`, optional `resume`. `criteria` is a JSON string. **Creates the account automatically** and returns a session |

**Alert body** (Excel "Set Job Alert"):

```json
{
  "name": "Node jobs in Jaipur",
  "email": "ravi@example.com",
  "mobile": "9876543210",
  "frequency": "daily",
  "channels": ["email", "in_app", "push"],
  "heardFrom": "YouTube",
  "criteria": {
    "jobTitle": "Backend Developer", "keySkills": ["Node.js"], "experienceLevel": "Experienced",
    "totalExperienceMonths": 36, "presentJobStatus": "Working", "currentSalary": 25000,
    "expectedSalary": { "min": 30000, "max": 60000 }, "locations": [{ "city": "Jaipur", "state": "Rajasthan" }],
    "industries": [], "departments": [], "roles": [], "educationLevels": [], "degrees": [], "specialisations": [],
    "jobModes": [], "employmentTypes": [], "kind": "any"
  }
}
```

`frequency` is `daily`, `weekly` or `monthly`. Show the Privacy Policy / disclaimer checkbox before submitting.

### 4.5 Employers, follow and events

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/employers` | – | Top companies list: `?q&type=company\|consultancy&industry&city&verified&label&sort=-stats.activeJobs` |
| GET | `/employers/:slug` | optional | Public page (by `slug` or `username`). Has `activeJobs` and `isFollowing`. To list the employer's jobs use `GET /jobs?organization=<_id>` |
| POST / DELETE | `/employers/:id/follow` | candidate | Followers get notified about new jobs |
| GET | `/employers/following` | candidate | "Saved companies" |
| POST | `/cms/employers/:id/contact` | – | **Contact employer without registration**: `{ name, email, mobile?, subject?, message }` |
| GET | `/events?city=` | – | Upcoming job events |
| GET | `/events/:slug` | – | Event + its active jobs. `isOpen` |
| POST | `/events/:slug/apply` | candidate | `{ jobIds: [] }` – apply to several jobs at once. Guests use guest-apply with `eventId` |

### 4.6 Reports, comments and blocking

| Method | Path | Auth | Body |
|---|---|---|---|
| GET | `/moderation/report-reasons` | – | Reason keys per target type |
| POST | `/moderation/reports` | optional | `{ targetType: job\|organization\|candidate, targetId, reason, details?, contact?{name,email,mobile} }`. `details` is required when `reason=other` |
| POST | `/moderation/comments` | ✔ | `{ targetType: organization (candidate→employer) \| candidate (employer→candidate), targetId, body, rating? 1–5 }`. Visible after admin approval |
| GET | `/moderation/comments/:targetType/:id` | – | Approved comments |
| GET | `/moderation/comments/mine`, DELETE `/moderation/comments/:id` | ✔ | |
| GET | `/moderation/blocks` | ✔ | My blocked list |
| POST / DELETE | `/moderation/blocks/organizations/:id` | candidate | Block or unblock an employer |

Report reasons: candidate `spam_misleading, not_searching_job, offensive_inappropriate, abusive_language, wrong_contact_details, other`; job `spam_misleading, job_not_available, offensive_inappropriate, asking_money, abusive_language, wrong_contact_details, other`; organization `spam_misleading, employer_not_available, offensive_inappropriate, asking_money, abusive_language, wrong_contact_details, other`.

---

## 5. Shared for all logged-in users

### 5.1 Notifications

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications?unreadOnly=true&page&limit` | `meta.unread` = badge count |
| POST | `/notifications/read` | `{ ids?: [] }` – no ids means mark all as read |
| DELETE | `/notifications/:id` | |

Notification: `{ _id, type, title, body, data, readAt, createdAt }`. Use `data.screen` plus ids for navigation: `job` (jobId, slug), `application` (applicationId), `interview`, `chat` (conversationId), `job_alert` (alertId), `billing`, `mailbox` (mailId), `employer_job`, `kyc`, `profile`, `enquiries`.

### 5.2 Chat (real time)

REST:

| Method | Path | Body / Notes |
|---|---|---|
| GET | `/chat/conversations?type=direct\|support` | Each item has `participants[].profile`, `unread`, `lastMessage` |
| GET | `/chat/unread` | `{ unread, conversations }` |
| POST | `/chat/conversations` | Employer: `{ candidateId, jobId?, message? }`. Candidate: `{ organizationId, message? }`. Allowed only with a hiring relation (applied, invited or contact unlocked) |
| POST | `/chat/support` | `{ subject?, message? }` – support chat with the portal admin |
| GET | `/chat/conversations/:id/messages?before=<ISO>&limit=30` | Oldest → newest. Use `before` = the first message's `createdAt` to load older messages |
| POST | `/chat/attachments` | multipart `file` (image / PDF / DOC ≤ 10 MB) → `{ key, name, mime, size, url }` |
| POST | `/chat/conversations/:id/messages` | `{ body?, attachments?:[{key,name,mime,size}], clientId? }` |
| POST | `/chat/conversations/:id/read` | |
| DELETE | `/chat/messages/:id` | Own messages |

Socket.IO (`socket.io-client` v4):

```js
import { io } from 'socket.io-client';
const socket = io('https://<api-domain>', { path: '/socket.io', transports: ['websocket'], auth: { token: accessToken } });
socket.on('connect_error', (e) => { if (e.message === 'UNAUTHORIZED') { /* refresh token, set socket.auth.token, then socket.connect() */ } });

socket.emit('chat:send', { conversationId, body: 'Hi', clientId: crypto.randomUUID() }, (ack) => { /* ack.ok, ack.message | ack.error */ });
socket.emit('chat:read', { conversationId });
socket.emit('chat:typing', { conversationId, isTyping: true });

socket.on('chat:message', ({ conversationId, message }) => {});
socket.on('chat:read', ({ conversationId, userId, at }) => {});
socket.on('chat:typing', ({ conversationId, userId, isTyping }) => {});
socket.on('chat:deleted', ({ conversationId, messageId }) => {});
socket.on('notification:new', (notification) => {});
// admin panel only:
socket.on('chat:conversation', (e) => {}); socket.on('report:new', (e) => {});
```

Always use `transports: ['websocket']`. The servers run as a cluster, so polling transport is not supported. Send a `clientId` so a retried send never creates a duplicate message.

### 5.3 Mailbox ("Emails Management")

| Method | Path | Notes |
|---|---|---|
| GET | `/mailbox?folder=inbox\|sent\|drafts\|replied\|service&unread=true` | `meta.unread` |
| GET | `/mailbox/:id` | Marks it read. Includes `thread[]` |
| POST | `/mailbox` | `{ to:[userId], subject, body(html), jobId?, draft?:bool, draftId? }` – a copy is also e-mailed |
| POST | `/mailbox/:id/reply` | `{ body, subject? }` |
| DELETE | `/mailbox/:id` | |

Employers can mail applicants or candidates whose contact they unlocked. Candidates can mail recruiters of jobs they applied to.

### 5.4 Plans, payments and invoices (Razorpay)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/billing/plans?audience=employer\|candidate` | optional | Public plans plus custom plans made for this account |
| POST | `/billing/quote` | ✔ | Same body as checkout. Price breakdown: `amount, discount, taxable, gst{cgst,sgst,igst,total}, walletUsed, total` |
| POST | `/billing/checkout` | ✔ | `{ planId, couponCode?, referralCode?, useWallet?, billing?{ name, gstin, address, city, state, stateCode, pincode, email, phone } }` |
| POST | `/billing/verify` | ✔ | `{ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }` |
| GET | `/billing/subscriptions` | ✔ | `{ active, subscriptions[], credits, features, planExpiresAt }` – credits are employer only |
| PATCH | `/billing/subscriptions/:id/auto-renew` | ✔ | `{ autoRenew }` (renews from the wallet before expiry) |
| GET | `/billing/orders?status=` | ✔ | Transactions with invoice numbers |
| GET | `/billing/invoices/:id?format=html` | ✔ | GST tax invoice. Fetch with the auth header and open the blob in a new tab to print or save as PDF |
| GET | `/billing/wallet` | ✔ | `{ balance, transactions }` |

Checkout flow:

```js
const { data } = await api.post('/billing/checkout', { planId, couponCode, useWallet: true, billing });
if (!data.paymentRequired) return showSuccess(data.order);         // fully paid by wallet / free
const rzp = new Razorpay({
  key: data.razorpay.keyId, order_id: data.razorpay.orderId, amount: data.razorpay.amount, currency: 'INR',
  name: data.razorpay.name, description: data.razorpay.description, prefill: data.razorpay.prefill,
  handler: async (r) => api.post('/billing/verify', { orderId: data.order._id, razorpayOrderId: r.razorpay_order_id,
                                                      razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature }),
});
rzp.open();
```

Razorpay Checkout covers UPI, cards, net banking and wallets (Paytm, PhonePe and others). Which methods to show comes from `settings.payments.methods`. Coupon and referral errors: `COUPON_INVALID, COUPON_EXPIRED, COUPON_NOT_APPLICABLE, COUPON_EXHAUSTED, COUPON_MIN_AMOUNT, COUPON_USED, REFERRAL_INVALID, REFERRAL_NOT_ELIGIBLE`. Each user has a `user.referralCode` to share.

### 5.5 Analytics

| Path | Who | Query |
|---|---|---|
| `GET /analytics/candidate` | candidate | `timespan` – profile views (daily), resume downloads, search appearances, application performance, recent viewer companies, skill trends |
| `GET /analytics/employer` | employer | `timespan` – job performance, application trend (daily), hiring funnel, source tracking, interviews, recruiter productivity |

### 5.6 CMS, ads and forms (public)

| Method | Path | Notes |
|---|---|---|
| GET | `/cms/pages/:slug` | `about-us, privacy-policy, terms-and-conditions, cookie-policy, contact-us, help-center, employer-terms, job-posting-policy, disclaimer` (admins can add more). `content` is sanitised HTML |
| GET | `/cms/blogs?q&category&tag&featured` / `/cms/blogs/:slug` | Detail includes `author.admin{nickname,designation,bio,socialLinks}`, `related[]`, `share` |
| GET | `/cms/faqs?category&audience=candidate\|employer` | |
| GET | `/cms/ads?placement=home_top&platform=web` | Types: `banner` (image + link), `adsense` (use `adUnitId` with `settings.ads.adsenseClientId`), `html`. Call `POST /cms/ads/:id/click` on click |
| POST | `/cms/contact` | Contact Us `{ name, email, mobile?, subject?, message }` |
| POST | `/cms/sales-enquiry` | `{ fullName, mobile, workEmail, employerType: company\|consultancy\|freelancer, designation, companyName, industry, teamSize, location, requirement?, message? }` |
| GET | `/cms/share?url=<platform url>&text=` | Share links for any page (blog, employer page, event) |

---

## 6. Employer panel (Company / Consultancy) – web only

All endpoints need an employer token. Team permissions are checked on every call. A missing permission returns `403 PERMISSION_DENIED`.

**Team roles:** `employer_admin` (owner, everything), `manager`, `team_lead`, `recruiter`. Defaults come from `GET /enums → defaultMemberPermissions`. A custom `permissions[]` list overrides the role.
Permissions: `job.post, job.manage_all, job.manage_own, job.share_internal, response.manage_all, response.manage_own, response.export_all, response.export_own, resume.bulk_download, data.bulk_excel_download, candidate.search, candidate.invite, email.own_only, saved_candidates.*, saved_search.manage_all|manage_own|share, folder.manage_all|manage_own, meeting.manage_all|manage_own, team.manage, quota.manage, billing.manage, company.manage, event.manage`.
Use `user.employer.permissions` (or the role defaults) to hide menu items.

### 6.1 Organization profile, KYC and team

| Method | Path | Notes |
|---|---|---|
| GET / PATCH | `/employer/organization` | Profile (Excel "Employer Profile & Documentation"): `name, legalName, username, employerType, organizationType, industries[], subIndustries[], departments[], functions[], employeeCount, foundedDate, website, about (≤1000 words), socialProfiles[], hiringStatus, gstNumber, panNumber, email, phone, consultancyDeclaration{authorized,noCandidateFee}` |
| POST | `/employer/organization/logo`, `/cover` | multipart `logo` / `cover` |
| POST / PATCH / DELETE | `/employer/organization/offices[/:id]` | `{ type (Registered/Corporate/Branch/Head Office/Work Location/Other), address, locality, district, city, state, country, pincode, geo{lat,lng}, mapUrl, isPrimary }` – several offices |
| POST | `/employer/organization/documents` | multipart `file` + `type` (master-data `document_type`) + `number` – **max 3 documents**. Re-uploading the same type replaces it |
| DELETE | `/employer/organization/documents/:id` | Verified documents cannot be deleted |
| POST | `/employer/organization/verification/submit` | `{ accurate, authorized, employerTerms, privacy, postingPolicy, fraudWarning }` – all must be `true` (Terms & Declaration checkboxes) |
| POST | `/employer/organization/verification/domain/start` / `check` | DNS TXT domain verification |
| GET | `/employer/organization/team?q&status` | Members |
| POST | `/employer/organization/team` | `{ fullName, email, mobile?, password?, designation, department[], hiringAuthority, memberRole, permissions?[], quotas? }` – without a password the member gets an activation e-mail. Max 50 users |
| PATCH | `/employer/organization/team/:id` | Role, permissions, quotas, `status: active\|suspended` |
| POST | `/employer/organization/team/:id/reset-password` | |
| POST | `/employer/organization/team/remove` | `{ ids: [] }` (bulk delete) |
| GET | `/employer/organization/usage?memberId&period=monthly` | `{ organization: {metric:{daily,weekly,...}}, members[], credits, features, planExpiresAt }` – "Available Services & Credits" plus member usage analytics |
| GET | `/employer/organization/followers` | |
| GET | `/employer/enquiries?status` | Contact-form messages from candidates |

KYC status (`organization.kycStatus` and per document): `not_submitted, under_review, verified, rejected, resubmission_required`.

**Quotas** (Employer Super User assigns them to sub-users):

```json
"quotas": { "resume_view": { "daily": 50, "monthly": 500 }, "job_post": { "monthly": 10 }, "invite": { "weekly": 200 },
            "resume_search": { "daily": 100 }, "resume_download": { "monthly": 100 }, "excel_download": { "monthly": 20 } }
```

Metrics: `job_post, resume_view (contact unlock), resume_download, invite, excel_download, resume_search, hiring, response_download_own, response_download_all` (the last two count applicant rows exported to Excel). Periods: `daily, weekly, monthly, quarterly, yearly`. A missing or `null` value means unlimited.

### 6.2 Jobs and internships

| Method | Path | Body / Query | Notes |
|---|---|---|---|
| GET | `/employer/jobs` | `?status=active\|closed\|expired\|draft\|pending\|admin_review\|rejected&kind=job\|internship&postedBy=me\|<memberId>&q=<title / JOBS-id / client name>&sort=-createdAt\|title\|-title&limit=10..200` | `meta.counts` per status |
| POST | `/employer/jobs` | job fields + `publish?`, `featured?`, `prefillFrom?` | `publish=false` saves a **draft** – call it on every auto-save. `prefillFrom=<jobId>` = "Prefill from previous jobs" |
| GET | `/employer/jobs/:id` | | Full job (preview) |
| PATCH | `/employer/jobs/:id` | partial job | Draft auto-save or edit |
| POST | `/employer/jobs/:id/publish` | `{ featured? }` | Uses 1 `job_post` credit on the first publish (+1 `featured_job` if featured). Status becomes `active`, or `pending` while the employer is unapproved, or `admin_review` when moderation is on |
| POST | `/employer/jobs/:id/close` \| `/refresh` \| `/trash` | | Refresh is allowed once in 24 h |
| POST | `/employer/jobs/:id/duplicate` | | New draft |
| PUT | `/employer/jobs/:id/collaborators` | `{ memberIds: [] }` | Collaborate / share with internal team |
| GET | `/employer/jobs/:id/share` | | Social share links |
| POST | `/employer/jobs/bulk-import?publish=false` | multipart `file` (xlsx) | Paid plans only (`FEATURE_LOCKED`). Columns: Job Title, Designation, Description, Key Skills, City, State, Min Experience, Max Experience, Min Salary, Max Salary, Openings, Employment Type, Work Mode, Industry, Department, Role, Kind, Client Name |
| POST | `/jobs/guest-post` | `{ employer:{ employerType, organizationName, fullName, email, mobile, designation?, heardFrom?, declarations, acceptTerms:true }, job:{...} }` | **Post a job without login** (public). Creates the employer account and e-mails a set-password link |

**Job fields:** `kind (job|internship), title*, designation, description, responsibilities, keySkills[] (≤30), industries[] (≤5), subIndustries[] (≤20), departments[] (≤5), functions[] (≤20), roles[] (≤10), category, employmentTypes[], jobModes[], shifts[], openings, experience{min,max} (years), experienceLevels[], salary{min,max,type,period:monthly|yearly,currency,hidden}, perks[], stipend{min,max,type}, duration{value,unit:days|weeks|months}, internshipStartDate, education{levels[],degrees[],specialisations[]}, gender (any|male|female|transgender|other), ageRange{min,max}, languages[], assets[], noticePeriod, locations[place] (≤15), address, isRemote, consultancyClient{name,hideName,industry} (consultancies hiring for a client), contact{name,email,mobile,showToCandidates}, questions[{question,type:text|yes_no|number|choice,options[],required}] (≤10), applyExternalUrl, deadlineAt, expiresAt, googleJobsEnabled`.
Publishing needs `description` and at least one location. The default expiry is 30 days (admin setting).

### 6.3 Responses / ATS

| Method | Path | Notes |
|---|---|---|
| GET | `/employer/responses` | Filters: `job, stage, screeningStatus, callingStatus, messagingStatus, kind, category=job\|internship\|invite (Response Category), source, view=new\|viewed\|pending (action pending), minScore, q (name/email/mobile/title), timespan`, `sort=-createdAt\|-matchScore\|snapshot.fullName`. `meta.stages` = pipeline counts. Recruiters with "own only" see responses to their own jobs only |
| GET | `/employer/responses/:id` | Marks it viewed. `{ application, job, candidate, profile, interviews, resumeUrl }` – contact details are always visible for applicants |
| PATCH | `/employer/responses/:id` | `{ stage?, screeningStatus?, callingStatus?, messagingStatus?[], forward?{channel,to}, comment?, note?, rating?, tags?[], assignedTo? }` – the candidate is notified when the stage changes |
| POST | `/employer/responses/bulk` | `{ ids:[≤500], update:{...same as PATCH} }` |
| POST | `/employer/responses/:id/interviews` | `{ scheduledAt, durationMinutes, mode: in_person\|video\|phone, location?, meetingLink?, round?, notes?, interviewers?[] }` – the candidate gets in-app, push, e-mail and SMS. A reminder goes out before the interview |
| PATCH | `/interviews/:id` | `{ scheduledAt? (reschedule), status: completed\|cancelled\|no_show, feedback{rating,comments,result} }` |
| GET | `/interviews?from&to&status&job` | Calendar |
| GET | `/employer/responses/export?<same filters>&format=xlsx\|csv` | Applicant responses Excel |
| GET | `/employer/responses/export-resumes?<filters>` | ZIP of resumes (≤500). Needs `resume.bulk_download` |
| GET | `/employer/responses/funnel/:jobId` | Stages, sources, daily applies |

Statuses (labels to show):
* Screening: `shortlisted, maybe_shortlist, rejected, on_hold, consider_other_role, not_interested, future_requirement, maybe_relevant`
* Calling: `call_done, not_picked, not_reachable, switched_off, call_cut`
* Messaging: `sms_done, whatsapp_done, email_done, whatsapp_not_delivered, sms_not_delivered, email_not_delivered`
* Profile forwarded via: `email, whatsapp, linkedin, facebook_messenger, sms`

### 6.4 Resume database search (Talent)

Needs an active plan with resume-database access, otherwise `402 FEATURE_LOCKED`. Each search counts against the member's `resume_search` quota.

| Method | Path | Notes |
|---|---|---|
| POST | `/employer/talent/search?page=1&limit=20` | Body = filters (below). Items are **candidate cards**. E-mail and mobile are **masked** until unlocked. `meta.capped` = more than 5000 results |
| GET | `/employer/talent/search/from-job/:jobId` | Pre-filled filters from a job ("Prefill invite search results") |
| GET | `/employer/talent/candidates/:candidateId` | Full profile (records a profile view; free). Includes `trackingDetail`, `applications` |
| POST | `/employer/talent/candidates/:candidateId/unlock` | Contact details `{ email, mobile }` – uses 1 `resume_view` credit the first time only |
| GET | `/employer/talent/candidates/:candidateId/resume` | `{ url, name }` – uses 1 `resume_download` credit the first time only |
| PATCH | `/employer/talent/candidates/:candidateId/tracking` | `{ screeningStatus?, callingStatus?, messagingStatus?[], comment?, forward? }` |
| POST / DELETE | `/employer/talent/candidates/:candidateId/block` | Block candidate |
| GET | `/employer/talent/searches/recent` | Recent searches |
| GET | `/employer/talent/searches?tab=mine\|shared\|all` | Saved searches ("My saved searches", "Searches shared with me") |
| POST / PATCH / DELETE | `/employer/talent/searches[/:id]` | `{ name, filters, sharedWith?[memberIds], alertEnabled? }` |
| GET | `/employer/talent/folders?tab=mine\|shared\|all` | `{ system:{accessed,commented,contacted,shortlisted,rejected,hold}, folders[{_id,name,count,sharedWith}] }` |
| GET | `/employer/talent/folders/system/:key` | Candidates in a system folder |
| POST / PATCH / DELETE | `/employer/talent/folders[/:id]` | Create, rename or delete. `sharedWith` shares the folder |
| GET | `/employer/talent/folders/:id` | Candidates in the folder |
| POST / DELETE | `/employer/talent/folders/:id/candidates` | `{ candidateIds: [] }` |
| POST | `/employer/talent/jobs/:jobId/invites` | `{ candidateIds:[≤500], message? }` – **Bulk invite**. Already invited or applied candidates are skipped automatically. Uses `invite` credits |
| GET | `/employer/talent/jobs/:jobId/invites?status` | |

**Search filters body:**

```json
{
  "clientHiringFor": "", "keywords": ["node"], "keywordMode": "any", "excludeKeywords": [],
  "skills": ["Node.js"], "skillMode": "any", "experienceMin": 2, "experienceMax": 6,
  "locations": ["Jaipur"], "includeRelocate": true, "excludeAnywhere": false,
  "salaryMin": 20000, "salaryMax": 80000, "includeNoSalary": true,
  "industries": [], "departments": [], "roles": [], "companyTypes": [],
  "companies": [], "companyScope": "both", "designations": [], "designationScope": "both",
  "noticePeriods": ["Immediate Joining"], "educationLevels": [], "degrees": [], "specialisations": [], "institutions": [],
  "passingYearFrom": 2015, "passingYearTo": 2024, "genders": [], "careerBreak": false, "disabledOnly": false,
  "militaryOnly": false, "categories": [], "ageMin": 21, "ageMax": 35, "jobTypes": ["job"], "employmentTypes": [],
  "jobModes": [], "experienceLevels": [], "show": "all", "verifiedMobile": true, "verifiedEmail": false,
  "withResume": true, "activeIn": "30d", "sort": "relevance", "jobId": null
}
```

Field notes:
* `companyScope` / `designationScope`: `current`, `previous` or `both`.
* `show`: `all`, `new` (new registrations) or `modified`.
* `activeIn`: `1d, 2d, 5d, 7d, 15d, 30d, 45d, 2m, 4m, 6m, 1y, 2y`.
* `sort`: `relevance`, `freshness`, `last_active` or `ai` (AI relevance needs `jobId`).
* `locations`: up to 10.
* Salary is the monthly figure.

**Candidate card:** `candidateId, name, avatar, gender, isVerified, mobileVerified, emailVerified, lastActiveAt, labels, email (masked), mobile (masked), contactUnlocked, hasResume, experienceLevel, totalExperienceMonths, currentJobTitle, currentEmployer, currentSalary, expectedSalary, noticePeriod, currentLocation, preferredLocations, keySkills, resumeHeadline, highestEducation, previousEmployers[], profileCompletion, isBoosted, profileUpdatedAt, tracking, matchScore?`.

### 6.5 Job events

| Method | Path | Body |
|---|---|---|
| GET / POST | `/employer/events` | `{ title, description, mode: walk_in\|virtual\|hybrid, venue{address,city,state,pincode,mapUrl}, meetingLink, startAt, endAt, jobs:[jobIds], contact{name,email,mobile}, status: draft\|published\|closed\|cancelled }` |
| PATCH / DELETE | `/employer/events/:id` | |
| POST | `/employer/events/:id/banner` | multipart `banner` |
| GET | `/employer/events/:id/share` | `{ link, qrCode (PNG data URL), share{...} }` – print or download the QR code |
| GET | `/employer/events/:id/applications` | |

Public event page: `WEB_URL/events/<slug>`, which uses `GET /events/:slug`.

---

## 7. Super Admin panel – web only

Every `/admin/*` call needs an `admin` or `super_admin` token. Sub-admins only see what `user.admin.permissions` allows (an empty list means full access). The keys are listed by `GET /admin/admins/permissions`. Every write action is written to the audit log.

### 7.1 Dashboard and statistics (`timespan` filter everywhere)

| Path | Data |
|---|---|
| `GET /admin/dashboard` | Users by role and status, companies and consultancies by status, jobs by status, applications, revenue, new users, pending queues (reports, support chats, KYC, job reviews) |
| `GET /admin/analytics` | Revenue (daily, by plan), user growth, conversion rates, traffic (views, applies, shares), job category performance, top skills and cities |
| `GET /admin/stats/logins` | Total attempts, successful, failed, admin, candidates, companies, consultancies, daily |
| `GET /admin/stats/messaging` | E-mails: all, sent, failed, queued, draft, trash, daily. SMS / WhatsApp / push / Arattai per status |
| `GET /admin/stats/candidates` | All, active, pending, blocked, excel imported, job-applied registered, direct registered, event applied, job applied |
| `GET /admin/stats/employers` | For employers, companies and consultancies: all, active, pending, blocked, direct registered, job-post registered, excel imported |
| `GET /admin/stats/jobs` | All, active, pending, admin review, expired, closed, draft, excel imported, by company / consultancy |

### 7.2 Candidates

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/candidates` | `?q` (name / mobile / e-mail / CAND-id) `&status&source=direct\|excel_import\|job_apply\|event_apply\|job_alert\|admin\|google&label&situationTag&verified&hasResume&city&skill&experienceLevel&jobApplied&timespan&sort` |
| GET | `/admin/candidates/export?<filters>&format` | Bulk Excel / CSV download |
| POST | `/admin/candidates/import?mode=create\|update\|replace&dryRun=true` | multipart `file`. `dryRun` = **detect duplicates** (by mobile / e-mail) without importing. `update` = rewrite existing data. `replace` = delete previously imported (never logged-in) candidates first. Columns: Full Name, Email ID, Mobile Number, Gender, Experience Level, Current Job Title, Key Skills, Current City, State, Total Experience (Months), Current Salary, Level of Education, Degree |
| POST | `/admin/candidates` | Create one candidate (activation e-mail) |
| POST | `/admin/candidates/bulk` | `{ ids, action, value? }` – actions: `approve, activate, restore, unapprove, pending, admin_review, block, suspend, trash, verify, unverify, label_add, label_remove, tag, delete` (delete works only on trashed users) |
| POST | `/admin/candidates/export-resumes` | `{ ids:[≤500] }` → ZIP |
| GET | `/admin/candidates/:id` | User (with `uid`), profile, applications, admin tracking |
| PATCH | `/admin/candidates/:id` | `{ user:{ fullName, email, mobile, username, status, labels, situationTag, isVerified, emailVerified, mobileVerified, password, ... }, profile:{ any candidate profile field } }` – edit everything |
| PATCH | `/admin/candidates/:id/tracking` | Admin screening, calling and messaging status, comment, forward |
| GET | `/admin/candidates/:id/applications` | Applied jobs |

Candidate labels: `premium, starred, featured, actively_job_searching, urgent, profile_booster`. Situation tags come from master-data `situation_tag`.

### 7.3 Employers (companies and consultancies)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/employers` | `?q` (name / GST / COMP- or CONS-id / owner e-mail / mobile) `&type&status&source&label&kycStatus&verified&situationTag&city&industry&timespan&sort` |
| GET | `/admin/employers/export`, POST `/admin/employers/import` | Import columns: Employer Type, Company Name, Full Name, Official Email ID, Mobile Number, Website, GST Number, Industry, City, State |
| POST | `/admin/employers` | Create an employer `{ employerType, organizationName, fullName, email, mobile, password?, website?, status?, sendActivation? }` |
| POST | `/admin/employers/bulk` | Same actions as candidates. Approve also releases the pending jobs. Block or suspend closes the jobs and logs out the members |
| GET / PATCH | `/admin/employers/:id` | Full detail (members, jobs by status, documents with download links). PATCH can change any organization field (`labels`, `status`, `situationTag`, `offices`, `maxMembers`, …) and add `note` |
| POST | `/admin/employers/:id/duplicate` | `{ fullName, email, mobile, organizationName? }` – copies the profile into a new employer |
| POST | `/admin/employers/:id/credits` | `{ credits:{ job_post: 5, resume_view: -10 }, note }` |
| PATCH | `/admin/employers/:id/documents/:docId` | `{ status: verified\|rejected\|resubmission_required\|under_review, remarks }` – recomputes the Verified badge |
| GET | `/admin/employers/kyc-queue` | Documents waiting for review |
| POST | `/admin/employers/kyc-reminders` | `{ ids }` – send document upload reminders |
| POST / PATCH | `/admin/employers/:id/members[/:memberId]` | Manage super user and sub-user permissions and quotas |
| PATCH | `/admin/employers/:id/tracking` | Admin tracking and comments |

Employer labels: `premium, starred, featured, actively_hiring, urgent_hiring, verified`.

### 7.4 Users (common)

| Method | Path | Notes |
|---|---|---|
| POST | `/admin/users/:id/impersonate` | **Login as user**. Returns a session for that user (2 h, audited). Open the candidate site or employer panel with that access token. `GET /auth/me` then returns `impersonatedBy` – show a banner |
| POST | `/admin/users/:id/send-link` | `{ type: activation\|password_reset }` |
| PATCH | `/admin/users/:id` | Edit any user (including employer members) |
| POST | `/admin/users/bulk` | Bulk actions on any users |
| GET | `/admin/users/:id/activity`, `/admin/users/:id/usage` | Activity history, usage report |
| POST | `/admin/messages/bulk` | **Bulk alerts** (≤500): `{ userIds? \| audience: candidates\|employers\|companies\|consultancies + filters?, channels:[email,sms,whatsapp,arattai,in_app,push], subject, message, html? }` |
| GET | `/admin/users` | `?q&role&status&organization&timespan&page&limit`. All users, including employer members with their organization |
| GET | `/admin/email-logs` | `?q(to)&status&category&timespan`. Audit permission. Bodies are not returned |
| GET | `/admin/message-logs` | `?q(to)&channel&status&timespan`. SMS, WhatsApp, push and Arattai dispatches |
| GET | `/admin/login-attempts` | `?q(identifier)&role&success&timespan` |

### 7.5 Jobs and responses

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/jobs` | `?q (title / JOBS- or INTE-id / employer / client)&status&kind&organizationType&organization&source&label&featured&city&department&timespan&sort&limit` |
| GET | `/admin/jobs/export` | |
| POST | `/admin/jobs` | **Post on behalf of an employer**: job fields + `organizationId, publish, featured, prefillFrom` (no credits used) |
| POST | `/admin/jobs/import?organizationId=&publish=` | Excel |
| POST | `/admin/jobs/bulk` | `{ ids, action: approve\|unapprove\|admin_review\|reject\|close\|expire\|trash\|restore\|delete\|feature\|unfeature\|label_add\|label_remove\|edit, value? }` |
| GET / PATCH | `/admin/jobs/:id` | Edit everything, including `status, statusReason, labels, publishedAt, deadlineAt, expiresAt` |
| POST | `/admin/jobs/:id/duplicate` | |
| POST | `/admin/jobs/:id/assign-applicants` | `{ candidateIds:[≤500] }` – assign applicants to a job |
| POST | `/admin/jobs/:id/invites` | `{ candidateIds:[≤1000], message }` – invite (already invited or applied are excluded) |
| GET | `/admin/responses` | **Resume response download filter**: `organization, job, view=new\|pending\|viewed, stage, screeningStatus (shortlisted / maybe_relevant / rejected …), callingStatus, kind, source, timespan` |
| GET | `/admin/responses/export`, `/admin/responses/export-resumes` | Excel / ZIP |
| GET / PATCH | `/admin/responses/:id` | |

Job labels: `premium, starred, featured, actively_hiring, urgent`. Job status: `draft, pending, admin_review, active, closed, expired, rejected, trashed`.

### 7.6 Job alerts (admin)

`GET /admin/job-alerts` (`status, frequency, source, q, timespan`), `GET /admin/job-alerts/export`, `POST /admin/job-alerts/import` (Excel columns: Alert Name, Email ID, Mobile Number, Key Skills, Job Title, Locations, Frequency), `POST /admin/job-alerts/bulk-create` `{ candidateIds:[≤1000], alert }`, `POST /admin/job-alerts/bulk` `{ ids, action: start|stop|approve|unapprove|trash|edit, data? }`, `POST /admin/job-alerts/send-jobs` `{ alertIds, jobIds }` (assign relevant jobs), `GET/PATCH /admin/job-alerts/:id`.

### 7.7 Master data and locations

`GET/POST /admin/master-data/:type` (`{ name, parent?, order?, isActive?, meta? }`), `PATCH/DELETE /admin/master-data/item/:id`, `POST /admin/master-data/:type/import?parentType=` (Excel columns: Name, Parent, Order, Active), `GET /admin/master-data/:type/export`. Filter user-added options with `?isUserAdded=true` to review them.
Locations: `GET/POST /admin/locations`, `PATCH/DELETE /admin/locations/:id`, `POST /admin/locations/import` (columns: Locality, District, City, State, Country, Pincode, Popular), `GET /admin/locations/export`.

### 7.8 Billing

* **Plans:** `GET/POST /admin/billing/plans`, `PATCH/DELETE /admin/billing/plans/:id`. Body: `code, name, audience: employer|candidate, tier: free|starter|professional|enterprise|booster|custom, price (excl. GST), mrp, gstPercent, durationDays, credits{job_post,featured_job,resume_view,resume_download,invite,excel_download,resume_search}, features{resumeDbAccess,unlimitedJobs,featuredJobs,contactUnlock,advancedAnalytics,bulkUpload,profileBoost,featuredProfile,priorityApplication}, maxMembers, isActive, isPublic, customFor{organization|user}, sortOrder, highlights[]`.
* **Coupons:** `GET/POST /admin/billing/coupons`, `PATCH/DELETE /admin/billing/coupons/:id`. Body: `code, type: percent|flat, value, maxDiscount, minAmount, validFrom, validTo, usageLimit, perUserLimit, plans[], audience, isActive`.
* **Orders and transactions:** `GET /admin/billing/orders` (`status, gateway, organization, buyer, q=orderNo, timespan`; `meta.summary` = revenue and GST), `GET /admin/billing/orders/export`, `PATCH /admin/billing/orders/:id/status` (`paid` fulfils the order manually; also `failed`, `cancelled`, `refunded`), `GET /admin/billing/invoices/:id?format=html`.
* **Subscriptions:** `GET /admin/billing/subscriptions`. `POST /admin/billing/assign-plan` `{ planId, organizationId | userId, note?, startsAt? }` (**Assign packages / Profile Booster**).
* **Wallet:** `POST /admin/billing/wallet/adjust` `{ organizationId|userId, type: credit|debit, amount, note }`, `GET /admin/billing/wallet/transactions`.

### 7.9 CMS, ads, e-mail templates and leads

* **CRUD** (list supports `q`, filters and timespan): `/admin/cms/pages`, `/admin/cms/blogs`, `/admin/cms/faqs`, `/admin/cms/ads`, `/admin/cms/email-templates`. Each has `GET` list, `GET /:id`, `POST`, `PATCH /:id` and `DELETE /:id`. HTML is sanitised on the server.
  * Page: `slug, title, type, content, audience, requiresConsent, version, status, seo`.
  * Blog: `title, slug?, excerpt, content, coverImage{key,url}, category, tags, status, publishedAt, isFeatured, seo`. The author is the logged-in admin; their nickname, designation, bio and social links come from `/admin/profile`.
  * FAQ: `question, answer, category, audience, order, isActive`.
  * Ad: `name, placement, type: banner|adsense|admob|html, platforms[web,android,ios], audience, image, mobileImage, link, adUnitId, html, priority, startAt, endAt, isActive`.
  * Email template: `name, subject, html, variables[], category`.
* `POST /admin/cms/media` – multipart `file` (image) → `{ key, url }`. Use it for blog covers, ad banners and inline images.
* `POST /admin/cms/email-templates/send` – `{ templateId | (subject + html), userIds?[≤500], emails?[], vars{}, sendMeCopy, saveAsTemplate? }`. `{{name}}` style variables are replaced per recipient.
* `GET /admin/cms/contacts?type=contact_us|employer_contact&status`, `PATCH /admin/cms/contacts/:id` `{ status }`.
* **Sales leads:** `GET /admin/leads` (`status, assignedTo, employerType, q, timespan`), `GET /admin/leads/export`, `POST /admin/leads/assign` `{ ids, assignedTo }`, `PATCH /admin/leads/:id` `{ status: new|contacted|qualified|converted|lost, note, assignedTo }`.

### 7.10 Moderation, chat, admins, settings and audit

* **Reports:** `GET /admin/moderation/reports` (`targetType, status, reason, organization, timespan`), `GET /admin/moderation/reports/export`, `PATCH /admin/moderation/reports/:id` `{ status: open|in_review|resolved|dismissed, adminNotes }`.
* **Comments:** `GET /admin/moderation/comments` (`direction=employer_to_candidate|candidate_to_employer, status=pending|approved|spam|trashed, mine, adminOnly, targetOrgType=company|consultancy, timespan`; `meta.counts`), `POST /admin/moderation/comments/moderate` `{ ids, status }`, `POST /admin/moderation/comments` (admin comment).
* **Blocklist** (User Blocking by e-mail, mobile, name, GST, country, URL, domain, IP): `GET /admin/moderation/blocklist?type`, `POST /admin/moderation/blocklist` `{ entries:[{type,value,reason}] }`, `DELETE /admin/moderation/blocklist/:id`. Blocked details cannot register.
* **Chat dashboard:** `GET /admin/chat/stats`, `GET /admin/chat/conversations?type=direct|support&status`, `GET/POST /admin/chat/conversations/:id/messages`, `PATCH /admin/chat/conversations/:id` `{ status: open|closed, assignedAdmin }`. Admin sockets also receive `chat:message` for support chats and `chat:conversation`.
* **Admins:** `GET/POST /admin/admins`, `PATCH /admin/admins/:id` `{ fullName, role, status, permissions[], password }`, `GET /admin/admins/permissions`. Only super admins can create super admins.
* **Admin profile:** `GET/PATCH /admin/profile` `{ fullName, displayName, nickname, designation, bio, socialLinks[], avatar{key,url}, logo{key,url} }`. Upload images with `/admin/cms/media` first.
* **Settings and API keys:** `GET /admin/settings?group=platform|payments|ads|ai|integrations` (secrets are masked), `PUT /admin/settings/:key` `{ value }`. Keys:
  * `platform.profileDeleteEnabled, platform.googleJobsEnabled, platform.jobApprovalRequired, platform.employerApprovalRequired, platform.defaultJobExpiryDays, platform.maintenanceMode, platform.supportEmail, platform.supportPhone, platform.minAppVersion`
  * `payments.methods, payments.gstPercent, referral.rewardAmount`
  * `ai.matchWeights` (AI matching weights)
  * `ads.enabled, ads.adsenseClientId, ads.admobAppId`
  * `integrations.googleMapsKey, integrations.arattai, integrations.smsTemplates`
* **Provider tests:** `POST /admin/settings/test-email` `{ to }` and `POST /admin/settings/test-sms` `{ mobile, template: otp|interview|interview_reminder|generic|bulk }` send one real message and return `PROVIDER_ERROR` with the provider's message on failure. Use them on the Settings screen ("Send test").
* **SMS templates (DLT):** setting key `integrations.smsTemplates` = `{ otp|interview|interview_reminder|generic|bulk: { templateId, text } }`. `text` uses `{{var}}` placeholders and must match the DLT-approved wording.
* **E-mail statistics** (`/admin/stats/messaging`) now also return `delivered, opened, bounced, blocked, spam` (from Brevo delivery webhooks).
* **Audit logs:** `GET /admin/audit-logs?actor&action&entity&entityId&timespan`.

---

## 8. Integration checklist

1. Build one API client with: the base URL, the auth header, `credentials: 'include'`, a single-flight refresh on `TOKEN_EXPIRED`, and mapping of `VALIDATION_ERROR` details to form fields.
2. Fill dropdowns from `master-data` (cache them for about 5 minutes). Never hard-code options.
3. Show the price from `/billing/quote` before opening Razorpay.
4. Job page SEO: SSR-fetch `/jobs/:slug`, inject `/jobs/:slug/google-jobs` JSON-LD, and expose `/jobs/sitemap.xml`.
5. Respect the feature flags from `/settings/public` (profile delete button, Google Jobs, maintenance banner).
6. Use `X-Request-Id` from responses in bug reports.
