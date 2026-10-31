import config from '../../config/env.js';
import { getSetting } from '../../modules/settings/settings.service.js';
import { renderTemplate } from '../utils/helpers.js';

/**
 * Indian DLT rules: every transactional SMS must use a pre-approved template - the text must match
 * the approved wording exactly (only the variable parts change) and carry its template id.
 *
 * Register these texts on your DLT portal (replace {{var}} with {#var#} there), then put the
 * approved template ids in .env (APITXT_TEMPLATE_*). If DLT approves slightly different wording,
 * update the text from Admin > Settings > "integrations.smsTemplates" - no deploy needed.
 */
export const DEFAULT_SMS_TEMPLATES = {
  otp: { text: '{{otp}} is your Freejobwala verification code. Valid for {{minutes}} minutes. Do not share this code with anyone.' },
  interview: { text: 'Interview scheduled for {{jobTitle}} at {{company}} on {{when}}. Log in to Freejobwala for details.' },
  interview_reminder: { text: 'Reminder: Your interview for {{jobTitle}} is on {{when}}. Log in to Freejobwala for details.' },
  generic: { text: '{{title}}: {{body}} - Freejobwala' },
  bulk: { text: '{{message}} - Freejobwala' },
};

const MAX_VAR = 30; // DLT allows up to 30 characters per {#var#}

/** Resolves template id + final text for a template key. Returns null when the key is unknown. */
export async function resolveSmsTemplate(key, vars = {}) {
  const overrides = (await getSetting('integrations.smsTemplates', {})) || {};
  const base = DEFAULT_SMS_TEMPLATES[key];
  const over = overrides[key] || {};
  if (!base && !over.text) return null;
  const text = over.text || base.text;
  const templateId = over.templateId || config.sms.apitxt.templates[key] || '';
  const safeVars = Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [
      k,
      String(v ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, k === 'message' || k === 'body' ? 160 : MAX_VAR),
    ]),
  );
  return { key, templateId, message: renderTemplate(text, safeVars) };
}
