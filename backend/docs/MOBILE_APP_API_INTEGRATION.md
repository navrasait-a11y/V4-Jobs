# Freejobwala – Mobile App (Flutter) API Integration Guide

For the **Android / iOS app team**. Per the PRD, the app covers the **Job Seeker / Candidate panel**. The Employer and Admin panels are web-only. The backend is shared with the website.

---

## 1. Basics

| Item | Value |
|---|---|
| Base URL | `https://<api-domain>/api/v1` (Android emulator on a local machine: `http://10.0.2.2:5000/api/v1`) |
| Format | JSON. Uploads use `multipart/form-data` |
| Auth | `Authorization: Bearer <accessToken>` |
| Dates | ISO-8601 UTC strings. Convert to IST for display |

### Required headers (send them on every request)

| Header | Value |
|---|---|
| `X-Client-Platform` | `android` or `ios` |
| `X-Device-Id` | Stable per-install id (generate a UUID once and store it in secure storage) |
| `X-Device-Name` | e.g. `Samsung SM-M326B` / `iPhone 15` |
| `Authorization` | `Bearer <accessToken>` (protected calls) |

`X-Device-Id` keeps exactly one session per device. Logging in again on the same device replaces the old session.

### Response envelope

```json
{ "success": true, "message": "OK", "data": {}, "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7, "hasNext": true } }
```

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Validation failed",
  "details": [{ "field": "mobile", "message": "Enter a valid 10 digit Indian mobile number", "location": "body" }] }, "requestId": "..." }
```

| HTTP | Codes | App behaviour |
|---|---|---|
| 401 | `TOKEN_EXPIRED` | Refresh the token and retry once |
| 401 | `TOKEN_INVALID`, `SESSION_REVOKED`, `TOKEN_REVOKED`, `REFRESH_INVALID`, `SESSION_EXPIRED` | Clear tokens and go to Login |
| 403 | `ACCOUNT_DISABLED`, `BLOCKED`, `FORBIDDEN` | Show `message` |
| 409 | `EMAIL_TAKEN`, `MOBILE_TAKEN`, `USERNAME_TAKEN`, `ALREADY_APPLIED` | Inline error |
| 422 | `VALIDATION_ERROR` | Map `details[].field` to form fields |
| 429 | `RATE_LIMITED`, `OTP_COOLDOWN`, `ACCOUNT_LOCKED` | Show message or countdown |
| 400 | `OTP_INVALID`, `OTP_EXPIRED`, `OTP_LOCKED`, `JOB_CLOSED`, `ANSWER_REQUIRED`, `INVALID_FILE_TYPE`, `INVALID_FILE_CONTENT` | Show message |

### Lists

* Pagination: `?page=1&limit=20` (max 200). Use `meta.hasNext` for infinite scroll.
* Multi-value params: comma-separated, e.g. `location=Jaipur,Delhi`.

### Files

* Resume: PDF / DOC / DOCX, **max 5 MB**. Photo: JPG / PNG / WEBP, max 5 MB. Chat attachment: image / PDF / DOC, max 10 MB.
* The server checks real file content, so a renamed file is rejected.
* Public images (logos, avatars) have a permanent `url`.
* Resume and chat file links are **temporary** (10–60 min). Do not store them. Re-fetch when needed.

---

## 2. App start-up

1. `GET /settings/public` → use:
   * `platform.minAppVersion` (`{ android, ios }`): show a **force update** screen when the installed version is lower.
   * `platform.maintenanceMode`: show a maintenance screen.
   * `platform.profileDeleteEnabled`: show or hide "Delete account".
   * `ads.enabled`, `ads.admobAppId`, `payments.methods`, `platform.supportEmail` / `platform.supportPhone`.
2. `GET /enums` → stages, statuses, report reasons, labels (cache for 1 h).
3. If a refresh token is stored → `POST /auth/refresh`, then `GET /auth/me`. Otherwise show onboarding / login.
4. Dropdowns: `GET /master-data/bulk?types=gender,experience_level,heard_from,...` (cache ~5 min, see §5).

---

## 3. Authentication

### 3.1 Tokens

* `accessToken`: JWT, valid **15 min**. Keep it in memory.
* `refreshToken`: valid 30 days and **rotates on every refresh**. Store it in **secure storage** (`flutter_secure_storage`). Always save the new one returned by refresh.
* **Refresh:** `POST /auth/refresh` with body `{ "refreshToken": "<stored>", "fcmToken": "<optional current FCM token>" }` → `data.tokens`. Run only one refresh at a time (lock) and queue the other requests behind it. Reusing an old refresh token kills the session.
* **Logout:** `POST /auth/logout` `{ "allDevices": false }`, then delete the stored tokens.

### 3.2 Endpoints

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register/candidate` | see below | Returns a session and sends a mobile OTP |
| GET | `/auth/availability` | `?username=&email=&mobile=` | `true` = available |
| POST | `/auth/login` | `{ identifier, password, role: "candidate", deviceId?, deviceName?, fcmToken? }` | `identifier` = e-mail, mobile or username |
| POST | `/auth/otp/send` | `{ mobile, channel: "sms"\|"whatsapp" }` | **Mobile OTP login**. 30 s resend cooldown |
| POST | `/auth/otp/login` | `{ mobile, otp, role: "candidate", fcmToken? }` | |
| POST | `/auth/google` | `{ idToken, role: "candidate", fcmToken? }` | `idToken` from the `google_sign_in` package. Creates the account if it is new (`isNewUser: true`) |
| POST | `/auth/2fa/verify` | `{ challengeToken, code }` | When login returns `twoFactorRequired` |
| POST | `/auth/refresh` | `{ refreshToken, fcmToken? }` | |
| POST | `/auth/logout` | `{ allDevices? }` | |
| GET | `/auth/me` | – | `{ user, profile }` |
| POST | `/auth/mobile/send-otp` / `/auth/mobile/verify` | `{ channel? }` / `{ otp }` | Verify mobile after registration |
| POST | `/auth/email/send-verification` | – | The link opens the website (`/verify-email?token=`). Optionally handle it as an app link and call `POST /auth/email/verify { token }` |
| POST | `/auth/password/forgot` | `{ mobile }` (OTP) or `{ email }` (link) | |
| POST | `/auth/password/reset` | `{ mobile, otp, password }` or `{ token, password }` | |
| POST | `/auth/password/change` | `{ currentPassword, newPassword }` | |
| POST | `/auth/contact/change` → `/auth/contact/confirm` | `{ mobile }` → `{ mobile, otp }` (same for e-mail) | Change mobile or e-mail |
| GET | `/auth/sessions`, DELETE `/auth/sessions/:sessionId` | | Device management screen (`isCurrent` flag) |
| PUT | `/auth/device-token` | `{ fcmToken }` | **Call whenever FCM gives a new token** (`onTokenRefresh`) |
| POST | `/auth/2fa/setup` → `/auth/2fa/enable` / `/auth/2fa/disable` | `{ code }` / `{ password, code }` | 2FA with an authenticator app. `setup` returns `otpauthUrl`; open it with `url_launcher` or show `qrCode`. Show the `backupCodes` once |
| GET | `/me/activity`, `/me/login-history` | `?page&limit` | Activity history |

**Register body** (Excel "Candidate Registration Form"):

```json
{
  "experienceLevel": "Fresher",
  "fullName": "Priya Singh",
  "gender": "Female",
  "email": "priya@example.com",
  "password": "Secret123",
  "mobile": "9876543210",
  "heardFrom": "Google Play Store",
  "referralCode": "AB12CD34",
  "consentCommunication": true,
  "acceptTerms": true,
  "deviceId": "uuid", "deviceName": "Pixel 8", "fcmToken": "..."
}
```

Rules:
* `password`: 8–64 characters with at least one letter and one digit.
* `mobile`: 10-digit Indian number.
* `username` (optional): 3–30 characters, letters, digits or `_`, cannot start or end with `_`.
* `acceptTerms` must be `true`.

After registration, show the **"Enter OTP & Verify"** screen and call `/auth/mobile/verify`.

**Auth success `data`:**

```json
{
  "user": { "_id": "...", "role": "candidate", "fullName": "...", "username": "...", "email": "...", "mobile": "...",
            "isEmailVerified": false, "isMobileVerified": false, "isVerified": false, "avatar": { "url": null },
            "referralCode": "AB12CD34", "notificationPrefs": {}, "twoFactor": { "enabled": false } },
  "tokens": { "accessToken": "...", "refreshToken": "...", "tokenType": "Bearer", "refreshExpiresAt": "..." },
  "profile": { "profileCompletion": 35, "experienceLevel": "Fresher" }
}
```

`user.isVerified` = the **Verified Candidate** badge (e-mail and mobile verified, and approved by an admin).

---

## 4. Push notifications (FCM) and deep links

* Send `fcmToken` on login, register, OTP login, Google login and refresh, and call `PUT /auth/device-token` on token refresh.
* Each push carries `data` (string values). Route on `data.screen`:

| `screen` | Extra keys | Open |
|---|---|---|
| `job` | `jobId`, `slug` | Job detail |
| `application` | `applicationId` | Application detail |
| `interview` | `interviewId`, `applicationId` | Interview detail |
| `chat` | `conversationId` | Chat thread |
| `job_alert` | `alertId` | Alert responses |
| `mailbox` | `mailId` | Mail detail |
| `billing` | `orderId?` | Plans / orders |
| `profile` | – | Edit profile (completion reminder) |

* The in-app notification list is `GET /notifications` (same `data`). `meta.unread` is the badge count.
* `POST /notifications/read` `{ ids?: [...] }` (no ids = mark all as read). `DELETE /notifications/:id`.
* Notification types: `job_alert, application_update, application_submitted, interview_scheduled, interview_update, interview_reminder, job_invite, message, mail, profile_viewed, profile_reminder, followed_employer_job, payment_success, subscription_expiry, referral_reward, admin_alert`.

---

## 5. Master data (dropdowns) and locations

| Method | Path | Notes |
|---|---|---|
| GET | `/master-data/bulk?types=a,b,c` | Many lists in one call (≤30 types) → `{ type: [{ _id, name, parent }] }` |
| GET | `/master-data/:type?q=&parent=&limit=50` | Type-ahead search |
| POST | `/master-data/:type/suggest` | `{ name }` – "Add new option" (only `job_title, key_skill, it_skill, institution, company_name, certification`) |
| GET | `/locations?q=jaip&limit=20` | `displayName` e.g. "Jagatpura, Jaipur, Rajasthan, India" |
| GET | `/locations/states`, `/locations/cities?state=` | |

Useful types for candidate screens:
* `experience_level, journey_status, present_job_status, heard_from, gender, marital_status, guardian_relation, caste_category`
* `disability_status, disability_type, military_status, service_type, english_fluency, language, asset`
* `job_title, key_skill, it_skill, company_name, employer_type, employment_type, job_mode, shift, salary_type, perk, notice_period`
* `industry, department` → `job_role` (via `parent`), `education_level` → `degree` → `specialisation`
* `institution, education_status, education_type, education_medium, marks_type, certification, social_platform, job_category`

Send the option **`name`** string in requests. Limits: key skills ≤ 15, IT skills ≤ 15, industries ≤ 5, job roles ≤ 10, preferred locations ≤ 4, job modes ≤ 3 per employment.

---

## 6. Candidate profile

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/candidates/me` | – | `{ user, profile, completion: { score, sections:[{key,label,weight,done}], missing[] } }` – Profile Completion Matrix |
| PATCH | `/candidates/me` | any subset (below) | Returns `{ user, profile, completion }` |
| GET | `/candidates/me/dashboard` | – | `counts{applied,saved,following,activeAlerts,pendingInvites}, applicationStages, profile, recentApplications[]` |
| POST | `/candidates/me/employments` | employment | Returns `{ item, completion }` |
| PATCH / DELETE | `/candidates/me/employments/:itemId` | | |
| POST | `/candidates/me/educations` | education | |
| PATCH / DELETE | `/candidates/me/educations/:itemId` | | |
| POST | `/candidates/me/resume` | multipart field **`resume`** | Returns `{ resume:{name,size,downloadUrl}, parsed:{email,mobile,skills[],links[],totalExperienceYears}, completion }`. Offer `parsed.skills` as quick-add chips |
| DELETE | `/candidates/me/resume` | | |
| GET | `/candidates/me/resume/download` | | `{ url, name }` (temporary) |
| POST | `/candidates/me/avatar` | multipart field **`avatar`** | Profile photo |
| GET / PUT | `/candidates/me/resume-builder` | JSON | Resume Builder data (GET pre-fills from the profile) |
| POST | `/candidates/me/deactivate` | `{ reason? }` | Log in again to reactivate |
| DELETE | `/candidates/me` | `{ reason? }` | Only if `platform.profileDeleteEnabled` |

**PATCH `/candidates/me` fields** (Excel "Candidate Profile"):

* **Identity:** `fullName, displayName, username, gender, about, socialLinks[{platform,url}]`
* **Journey:** `experienceLevel, journeyStatus, presentJobStatus, availabilityStatus (open_to_work | not_available | serving_notice)`
* **Personal:** `dob, maritalStatus, guardianRelation, guardianName, category, currentLocation, hometown, disability{status,type}, military{status,serviceType}, englishFluency, languages[], assets[], hasTwoWheeler, hasFourWheeler, drivingLicense`
* **Resume:** `resumeHeadline, profileSummary, keySkills[], itSkills[], certifications[]`
* **Work:** `totalExperience{years,months}, currentSalary (monthly in-hand), noticePeriod, industries[], departments[], roles[]`
* **Preferences:** `preferences{ jobModes[], locations[] (≤4), willingToRelocate, anywhereInIndia, expectedSalary, employmentTypes[], shifts[], skills[], industries[], departments[], roles[], noticePeriod, jobTypes['job','internship'] }`
* **Social / portfolio:** `socialProfiles[{platform,url}], portfolios[{name,url}]`
* **Settings:** `notificationPrefs{ email, sms, whatsapp, push, jobAlerts, recruiterMessages, marketing }, privacy{ profileVisibility: public|recruiters|hidden, showContact }`

Location object: `{ locality, district, city, state, country, pincode }`.

**Employment:** `jobTitle*, employerName*, employerType, employmentType, jobModes[], location{}, shift, isCurrent, startDate, endDate (omit when isCurrent), salaryType, monthlySalary, perks[], noticePeriod, description, skills[], industries[], departments[], roles[]`.
**Education:** `level*, degree, specialisation, institution, status (Pursuing / Pass Out), startDate, endDate, educationType, medium, marksType, marks, isHighest`.
Month-year pickers: send the 1st of the month, e.g. `"2023-06-01"`.

**Upload example (dio):**

```dart
final form = FormData.fromMap({ 'resume': await MultipartFile.fromFile(path, filename: 'resume.pdf', contentType: MediaType('application', 'pdf')) });
await dio.post('/candidates/me/resume', data: form);
```

Set the correct `contentType`: `application/pdf`, `application/msword` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. For images use `image/jpeg` or `image/png`.

---

## 7. Jobs

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/jobs` | optional | Search. With a token, each item also has `hasApplied` and `isSaved` |
| GET | `/jobs/facets` | – | Same query. Returns counts for the filter sheet: `workMode, department, industry, location, role, postedBy, companyType, employmentType, kind` → `[{value,count}]` |
| GET | `/jobs/recommended` | ✔ | "Recommended jobs for you" with `matchScore` 0–100 |
| GET | `/jobs/saved` | ✔ | Favourite jobs |
| GET | `/jobs/:idOrSlug` | optional | Detail + `organizationProfile`, `isOpen`, `hasApplied`, `application{stage}`, `isSaved`, `match{score, breakdown}` |
| GET | `/jobs/:id/similar` | – | |
| GET | `/jobs/:id/share` | – | `{ url, whatsapp, facebook, twitter, linkedin, telegram, sms, instagram, arattai }`. Use `share_plus` with `url` |
| POST / DELETE | `/jobs/:id/save` | ✔ | |

**Search params:**

| Group | Params |
|---|---|
| Keywords and type | `q`, `kind=job\|internship\|any` |
| Location | `location` (cities or states), `includeRemote` |
| Experience and pay | `experience` (years), `salaryMin`, `salaryMax` (monthly), `stipendMin`, `durationMax` (internship months) |
| Side filters | `workMode`, `department`, `role`, `industry`, `employmentType`, `education`, `skills`, `shift`, `category` (IT Jobs / Non IT Jobs / Work From Home Jobs …) |
| Employer | `companyType`, `postedBy=company\|consultancy`, `organization` (employer id), `topCompanies=true`, `verifiedOnly=true` |
| Labels | `label=premium,featured,urgent,actively_hiring` |
| Freshness and sort | `freshness=1\|3\|7\|15\|30` (days), `sort=relevance\|date\|salary` |

**Job card fields:**
* `_id, slug, kind, title, designation, organization`
* `orgSnapshot{ name, logo, isVerified, slug, username, employerType }`
* `locations[], isRemote, experience{min,max}, salary{min,max,period,hidden}, stipend{min,max}, duration{value,unit}`
* `jobModes[], employmentTypes[], keySkills[], labels[], isFeatured, publishedAt, refreshedAt, deadlineAt, openings, stats.applications`

If `salary.hidden` is true, show "Not disclosed". Use `refreshedAt` for "Posted x days ago". If a consultancy hides its client, `consultancyClient.hideName` is `true` and no client name is sent.

---

## 8. Apply and track applications

| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | `/jobs/:id/apply` | ✔ | JSON `{ answers:[{question,answer}], coverLetter?, eventId?, source? }` or multipart with an optional `resume` file (then send `answers` as a JSON string) | The profile resume is used when no file is sent. Answer every `job.questions[]` item with `required: true` |
| POST | `/jobs/:id/guest-apply/otp` | – | `{ mobile }` | **Apply without login**, step 1 |
| POST | `/jobs/:id/guest-apply` | – | multipart (below) | Step 2. Creates the account automatically and returns **`tokens` + `user`** (store them and the user is logged in). `isNewUser` |
| GET | `/applications?stage=&kind=` | ✔ | | My applications. `meta.counts` per stage |
| GET | `/applications/:id` | ✔ | | Includes `history[{stage, at}]` (status timeline) and `interviews[]` |
| POST | `/applications/:id/withdraw` | ✔ | | |
| GET | `/interviews?from&to&status` | ✔ | | |
| POST | `/interviews/:id/respond` | ✔ | `{ response: "accepted"\|"declined" }` | |
| GET | `/invites?status=sent\|viewed\|applied\|declined` | ✔ | | "Job Invite Responses" from employers |
| POST | `/invites/:id/decline` | ✔ | | |

Apply errors: `ALREADY_APPLIED` (409), `JOB_CLOSED`, `ANSWER_REQUIRED`, `BLOCKED`, `EXTERNAL_APPLY` (open `error.details.url` in the browser).

**Guest apply fields** (Candidate Job Apply form):

* **Required:** `otp, fullName, mobile, email, acceptTerms=true`
* **Plain fields:** `gender, dob, maritalStatus, hasTwoWheeler, hasFourWheeler, drivingLicense, presentJobStatus, experienceLevel, totalExperienceMonths, currentJobTitle, currentSalary, currentCompany, currentCompanyType, employmentType, currentlyWorking, noticePeriod, englishFluency, heardFrom, consentCommunication, eventId`
* **JSON-string fields:**
  * `disability` (`{status,type}`), `military`
  * `assets[]`, `education` (`{level,degree,specialisation,institution}`)
  * `keySkills[]`, `roles[]`, `departments[]`, `industries[]`
  * `workLocation{}`, `currentLocation{}`, `languages[]`, `preferredLocations[]` (≤4)
  * `answers[]`
* **File:** `resume`

Application stages: `applied → screened → interview_scheduled → offered → hired` (or `rejected`, `withdrawn`). Show them as a status timeline from `history`.

---

## 9. Job alerts

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/job-alerts/prefill` | ✔ | Ready-made alert from the profile (Excel: "Enable Pre Filled Options For Registered Users") |
| GET / POST | `/job-alerts` | ✔ | Max 10 per user |
| PATCH | `/job-alerts/:id` | ✔ | Edit. `{ isActive: false }` pauses the alert |
| DELETE | `/job-alerts/:id` | ✔ | |
| GET | `/job-alerts/responses?alertId=` | ✔ | Jobs sent by the alerts |
| POST | `/job-alerts/guest/otp` | – | `{ mobile }` |
| POST | `/job-alerts/guest` | – | multipart: `otp, fullName, mobile, email, acceptTerms=true, name, frequency, heardFrom, criteria (JSON string)`, optional `resume`. **Account is created automatically** and the response includes `tokens` |

**Alert body:**

```json
{
  "name": "Sales jobs Jaipur", "frequency": "daily", "channels": ["email", "in_app", "push"], "heardFrom": "YouTube",
  "criteria": {
    "jobTitle": "Sales Executive", "keySkills": ["Field Sales"], "experienceLevel": "Experienced", "totalExperienceMonths": 24,
    "presentJobStatus": "Working", "currentSalary": 18000, "expectedSalary": { "min": 20000, "max": 30000 },
    "locations": [{ "city": "Jaipur", "state": "Rajasthan" }], "industries": [], "departments": [], "roles": [],
    "educationLevels": ["Graduate"], "degrees": [], "specialisations": [], "jobModes": [], "kind": "any"
  }
}
```

`frequency` is `daily`, `weekly` or `monthly`. Limits: key skills ≤ 15, locations ≤ 3, industries ≤ 5, departments ≤ 5, roles ≤ 10. Show the Privacy Policy / disclaimer before the final submit.

---

## 10. Companies, events, reports

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/employers?q&type=company\|consultancy&industry&city&verified&label` | – | Top companies |
| GET | `/employers/:slug` | optional | Company page with `activeJobs`, `isFollowing`. Its jobs: `GET /jobs?organization=<_id>` |
| POST / DELETE | `/employers/:id/follow` | ✔ | Follow for job updates |
| GET | `/employers/following` | ✔ | Saved / followed companies |
| POST | `/cms/employers/:id/contact` | – | Contact the employer (works without login): `{ name, email, mobile?, subject?, message }` |
| GET | `/events` / `/events/:slug` | – | Job events (opened from shared links / QR codes) |
| POST | `/events/:slug/apply` | ✔ | `{ jobIds: [] }` |
| GET | `/moderation/report-reasons` | – | |
| POST | `/moderation/reports` | optional | `{ targetType: "job"\|"organization", targetId, reason, details? }` – **Report job / employer** |
| POST | `/moderation/comments` | ✔ | `{ targetType: "organization", targetId, body, rating? }` (published after admin approval) |
| GET | `/moderation/comments/organization/:id` | – | Approved reviews of a company |
| POST / DELETE | `/moderation/blocks/organizations/:id` | ✔ | Block or unblock an employer |
| GET | `/moderation/blocks` | ✔ | Blocked list |

Report reasons: job `spam_misleading, job_not_available, offensive_inappropriate, asking_money, abusive_language, wrong_contact_details, other`; employer `spam_misleading, employer_not_available, offensive_inappropriate, asking_money, abusive_language, wrong_contact_details, other`. `details` is required for `other`.

---

## 11. Chat (recruiters and customer support)

REST:

| Method | Path | Notes |
|---|---|---|
| GET | `/chat/conversations?type=direct\|support` | List with `participants[].profile`, `lastMessage`, `unread` |
| GET | `/chat/unread` | `{ unread, conversations }` (tab badge) |
| POST | `/chat/conversations` | `{ organizationId, message? }` – only with employers you applied to or got an invite from |
| POST | `/chat/support` | `{ subject?, message? }` – **Customer support chat** with the admin |
| POST | `/assistant/message` | `{ message }` (max 500 chars, token optional, 20 per minute) → `{ text, jobs?, links?: [{ label, to }], suggestions?, handoff? }`. Instant help answers. When `handoff` is true, offer the support chat. `links[].to` are web paths: map them to app screens |
| GET | `/chat/conversations/:id/messages?before=<ISO>&limit=30` | Oldest → newest. For older pages pass the first loaded message's `createdAt` as `before` |
| POST | `/chat/attachments` | multipart `file` (image / PDF / DOC ≤ 10 MB) → `{ key, name, mime, size, url }` |
| POST | `/chat/conversations/:id/messages` | `{ body?, attachments?:[{key,name,mime,size}], clientId? }` |
| POST | `/chat/conversations/:id/read` | Mark read |
| DELETE | `/chat/messages/:id` | Delete own message |

Message: `{ _id, conversation, sender{_id,fullName,avatar,role}, type: text|image|file|system, body, attachments[{key,name,mime,size,url}], readBy[{user,at}], clientId, createdAt }`.

Socket.IO (`socket_io_client` v3+, server is Socket.IO v4):

```dart
final socket = IO.io('https://<api-domain>', IO.OptionBuilder()
    .setPath('/socket.io').setTransports(['websocket'])
    .setAuth({'token': accessToken}).disableAutoConnect().build());
socket.connect();
socket.onConnectError((e) { /* 'UNAUTHORIZED' -> refresh token, socket.auth = {'token': newToken}, socket.connect() */ });

socket.emitWithAck('chat:send', {'conversationId': id, 'body': text, 'clientId': uuid}); // ack: {ok, message} | {ok:false, error}
socket.emit('chat:read', {'conversationId': id});
socket.emit('chat:typing', {'conversationId': id, 'isTyping': true});

socket.on('chat:message', (d) {});        // {conversationId, message}
socket.on('chat:read', (d) {});           // {conversationId, userId, at}
socket.on('chat:typing', (d) {});         // {conversationId, userId, isTyping}
socket.on('chat:deleted', (d) {});        // {conversationId, messageId}
socket.on('notification:new', (n) {});    // live in-app notification
```

* Use **websocket transport only**.
* Reconnect with a fresh token after a refresh.
* Always send a unique `clientId` so a retry never duplicates a message.
* When the user is offline, new messages arrive as **push** with `screen=chat`.

---

## 12. Mailbox

| Method | Path | Notes |
|---|---|---|
| GET | `/mailbox?folder=inbox\|sent\|drafts\|replied\|service&unread=true` | `meta.unread` |
| GET | `/mailbox/:id` | Marks it read. Includes `thread[]` |
| POST | `/mailbox` | `{ to:[recruiterUserId], subject, body, draft?, draftId? }` (to recruiters of jobs you applied to) |
| POST | `/mailbox/:id/reply` | `{ body }` |
| DELETE | `/mailbox/:id` | |

`body` is HTML. Render it with `flutter_html` or similar.

---

## 13. Premium – Profile Booster (Razorpay)

| Method | Path | Notes |
|---|---|---|
| GET | `/billing/plans?audience=candidate` | Profile Booster packages |
| POST | `/billing/quote` | `{ planId, couponCode?, referralCode?, useWallet? }` → `amount, discount, taxable, gst{cgst,sgst,igst,total}, walletUsed, total` |
| POST | `/billing/checkout` | Same body (+ `billing{name,address,state,stateCode,pincode,email,phone}` optional) → `{ order, paymentRequired, razorpay{keyId, orderId, amount, currency, name, description, prefill} }` |
| POST | `/billing/verify` | `{ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }` |
| GET | `/billing/subscriptions` | Active package (`active.endsAt`) |
| GET | `/billing/orders` | Transactions, with the invoice id |
| GET | `/billing/invoices/:id` | JSON invoice. `?format=html` gives a printable GST invoice (send the auth header, e.g. render in a WebView) |
| GET | `/billing/wallet` | `{ balance, transactions }` (referral rewards) |

Flow with `razorpay_flutter`:

```dart
final res = await api.post('/billing/checkout', data: {'planId': planId, 'useWallet': true});
if (res['data']['paymentRequired'] == false) return onSuccess();
final r = res['data']['razorpay'];
razorpay.open({'key': r['keyId'], 'order_id': r['orderId'], 'amount': r['amount'], 'currency': 'INR',
  'name': r['name'], 'description': r['description'], 'prefill': {'contact': r['prefill']['contact'], 'email': r['prefill']['email']}});
// on PAYMENT_SUCCESS:
await api.post('/billing/verify', data: {'orderId': res['data']['order']['_id'], 'razorpayOrderId': resp.orderId,
  'razorpayPaymentId': resp.paymentId, 'razorpaySignature': resp.signature});
```

* UPI, cards, net banking and wallets (Paytm, PhonePe and others) are inside Razorpay Checkout.
* Show the user's `referralCode` on a "Refer & Earn" screen.
* Coupon and referral errors: `COUPON_INVALID, COUPON_EXPIRED, COUPON_NOT_APPLICABLE, COUPON_EXHAUSTED, COUPON_MIN_AMOUNT, COUPON_USED, REFERRAL_INVALID, REFERRAL_NOT_ELIGIBLE`.

---

## 14. Analytics, content and ads

| Method | Path | Notes |
|---|---|---|
| GET | `/analytics/candidate?timespan=30d` | `profileViews{total,daily[]}, resumeDownloads, searchAppearances, applicationPerformance{byStage,viewRate}, recentViewers[], skillTrends[{skill,activeJobs,youHaveIt}], profileCompletion` |
| GET | `/cms/pages/:slug` | `privacy-policy, terms-and-conditions, about-us, contact-us, help-center, cookie-policy, disclaimer` – `content` is HTML |
| GET | `/cms/blogs?category=&q=`, `/cms/blogs/:slug` | Career advice / blogs |
| GET | `/cms/faqs?audience=candidate` | |
| POST | `/cms/contact` | Contact us `{ name, email, mobile?, subject?, message }` |
| GET | `/cms/ads?placement=<slot>&platform=android\|ios` | `type: admob` → load an AdMob unit with `adUnitId`. `type: banner` → show `mobileImage.url \|\| image.url` and open `link`. Call `POST /cms/ads/:id/click` on tap |

`timespan` values: `24h, 7d, 14d, 30d, 90d, 120d, 6m, 9m, 12m`, or `custom&from=&to=`.

---

## 15. Other endpoints used by the app

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/master-data/types` | – | `[{ key, label, userAddable }]`. Shows which lists accept "Add new option" |
| GET | `/cms/share?url=<platform url>&text=` | – | Share links for any page (blog, employer, event) |
| POST | `/moderation/comments` | ✔ | `{ targetType: organization, targetId, body, rating? 1–5 }`. Visible after admin approval |
| GET | `/moderation/comments/mine` | ✔ | The candidate's own reviews |
| DELETE | `/moderation/comments/:id` | ✔ | Remove own review |
| PATCH | `/billing/subscriptions/:id/auto-renew` | ✔ | `{ autoRenew }`. Renews from the wallet before expiry |

Not for the app: `/auth/register/employer`, `/jobs/guest-post`, `/cms/sales-enquiry`, `/analytics/employer`, `/employer/*` and `/admin/*` are web panel APIs. `/webhooks/brevo` and `/billing/webhooks/razorpay` are called by providers. `/jobs/sitemap.xml` and `/jobs/:idOrSlug/google-jobs` are for web SEO.

---

## 16. Checklist

1. Add a dio interceptor that does four things:
   * sets the headers from §1,
   * on `TOKEN_EXPIRED`, refreshes once (with a lock) and replays the request,
   * on other 401 codes, logs the user out,
   * shows `error.message` from the error body.
2. Store only the refresh token, and only in secure storage. Rotate it after every refresh.
3. Send the FCM token on every login and refresh, and on token change.
4. Check `minAppVersion` and `maintenanceMode` at start-up.
5. Cache master data. Never hard-code dropdown values (the admin can change them).
6. Never cache resume or chat file URLs. They expire.
7. Socket: websocket transport, reconnect after token refresh, `clientId` on sends.
