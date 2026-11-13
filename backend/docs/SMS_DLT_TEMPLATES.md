# SMS templates for DLT registration

> **OTPs work without DLT.** Every OTP goes through the apitxt Unified OTP API (`/api/sendOTP`) and only
> `APITXT_API_KEY` (or `APITXT_AUTH_KEY`) is needed. Even with `APITXT_OTP_MODE=dlt`, OTPs fall back to this
> API until `APITXT_SENDER_ID`, `APITXT_PE_ID` and the OTP template id are all set, so a half-finished DLT
> setup never stops logins. Non-OTP SMS without a DLT template are logged as **skipped** (not failed, not
> retried). Check delivery from Admin > Settings > Integrations > "Send a test OTP SMS". Later you can set
> `APITXT_OTP_TEMPLATE_ID` (your apitxt SMS template), `APITXT_OTP_CHANNEL=whatsapp` with
> `APITXT_OTP_TEMPLATE_NAME`, or switch to `APITXT_OTP_MODE=dlt`. The templates below are still needed for
> non-OTP SMS (interview, reminders, alerts, bulk).

Indian operators block any transactional SMS that does not match a DLT-approved template.

1. Register a Principal Entity and a 6-character sender ID (header) on your DLT portal.
2. Register each template below as **Service Implicit** (use **Transactional** category for the OTP).
3. Put the approved values in `.env`.

| Env key | Template text for DLT |
|---|---|
| `APITXT_TEMPLATE_OTP` | `{#var#} is your Freejobwala verification code. Valid for {#var#} minutes. Do not share this code with anyone.` |
| `APITXT_TEMPLATE_INTERVIEW` | `Interview scheduled for {#var#} at {#var#} on {#var#}. Log in to Freejobwala for details.` |
| `APITXT_TEMPLATE_INTERVIEW_REMINDER` | `Reminder: Your interview for {#var#} is on {#var#}. Log in to Freejobwala for details.` |
| `APITXT_TEMPLATE_GENERIC` | `{#var#}: {#var#} - Freejobwala` |
| `APITXT_TEMPLATE_BULK` | `{#var#} - Freejobwala` |

Also set `APITXT_SENDER_ID` and `APITXT_PE_ID`.

If DLT approves slightly different wording, update it in Admin > Settings > `integrations.smsTemplates`. The text must match the approved wording exactly. No deploy is needed.
