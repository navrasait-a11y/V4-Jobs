# SMS templates for DLT registration

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
