import config from '../../config/env.js';

const BRAND = {
  blue: '#0151A0',
  blueTint: '#EAF2FB',
  orange: '#F07C00',
  orangeTint: '#FFF4E8',
  green: '#12885A',
  greenTint: '#E8F6EF',
  red: '#C62828',
  redTint: '#FDECEC',
  ink: '#111827',
  gray: '#4B5563',
  muted: '#6B7280',
  line: '#E5E9F0',
  bg: '#F3F6FA',
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";

const web = () => config.urls.web.replace(/\/$/, '');
const isLocal = (url) => /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url || '');

/**
 * Header logo. Mail clients fetch images from the public internet, so a localhost WEB_URL (or a
 * blocked image) would show a broken picture or someone else's logo. In that case, and as the
 * image's alt text, a brand-coloured text wordmark is used instead.
 */
export function logoUrl() {
  const candidates = [config.mail?.logoUrl, `${String(config.urls.app || '').replace(/\/$/, '')}/brand/logo.png`, `${web()}/logo.png`];
  return candidates.find((u) => u && /^https?:\/\//.test(u) && !isLocal(u)) || null;
}

function logo() {
  const src = logoUrl();
  const wordmark = `<span style="font-family:${FONT};font-size:24px;font-weight:800;letter-spacing:-0.3px;color:${BRAND.blue}">Free<span style="color:${BRAND.orange}">job</span>wala<span style="color:${BRAND.orange}">.com</span></span>`;
  if (!src) return wordmark; // only on a local machine: mail clients cannot load localhost images
  return `<img src="${src}" width="180" height="38" alt="${config.appName}" style="display:block;width:180px;max-width:180px;height:auto;border:0;outline:none;font-family:${FONT};font-size:22px;font-weight:800;color:${BRAND.blue}"/>`;
}

/** Bulletproof button: table cell padding keeps it solid in Outlook. */
const button = ({ url, label }, { tone = 'orange' } = {}) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px"><tr><td align="center" bgcolor="${BRAND[tone]}" style="border-radius:8px;mso-padding-alt:14px 28px"><a href="${url}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px">${label}</a></td></tr></table>`;

/** Link fallback under a button, for clients that strip buttons. */
const linkFallback = (url) =>
  `<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted}">Button not working? Copy this link into your browser:<br/><a href="${url}" style="color:${BRAND.blue};word-break:break-all">${url}</a></p>`;

/** Two-column facts block for interview, application and plan details. */
const details = (rows) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;border:1px solid ${BRAND.line};border-radius:10px;border-collapse:separate">${rows
    .filter(([, v]) => v)
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:12px 16px;font-size:13px;color:${BRAND.muted};width:34%;vertical-align:top;${i ? `border-top:1px solid ${BRAND.line};` : ''}">${k}</td><td style="padding:12px 16px;font-size:14px;font-weight:600;color:${BRAND.ink};vertical-align:top;${i ? `border-top:1px solid ${BRAND.line};` : ''}">${v}</td></tr>`,
    )
    .join('')}</table>`;

const paragraph = (html) => `<p style="margin:0 0 14px">${html}</p>`;
const small = (html) => `<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${BRAND.muted}">${html}</p>`;

/** Coloured pill used for statuses ("Shortlisted", "Interview scheduled" ...). */
const pill = (text, tone = 'blue') => {
  const map = { blue: [BRAND.blueTint, BRAND.blue], green: [BRAND.greenTint, BRAND.green], orange: [BRAND.orangeTint, BRAND.orange], red: [BRAND.redTint, BRAND.red] };
  const [bg, fg] = map[tone] || map.blue;
  return `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${bg};color:${fg};font-size:13px;font-weight:700">${text}</span>`;
};

/** Small coloured label above the title, so the purpose of a mail reads at a glance. */
const eyebrow = (text, tone = 'blue') => `<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${tone === 'orange' ? BRAND.orange : tone === 'green' ? BRAND.green : BRAND.blue}">${text}</p>`;

/**
 * Shared shell. Table based and inline styled because mail clients ignore most CSS; the media
 * query only tightens spacing on phones where it is supported.
 */
export function layout(title, bodyHtml, cta, { preheader = '', settingsLink = false, label = '', tone = 'blue', ctaTone, showLink = false } = {}) {
  const home = web();
  return `<!doctype html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="X-UA-Compatible" content="IE=edge"/><meta name="color-scheme" content="light"/><meta name="supported-color-schemes" content="light"/><title>${title}</title>
<style>body{margin:0;padding:0}a{color:${BRAND.blue}}@media (max-width:600px){.fjw-pad{padding:28px 22px !important}.fjw-title{font-size:21px !important}.fjw-otp{font-size:30px !important;letter-spacing:8px !important}.fjw-outer{padding:16px 8px !important}}</style></head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.bg}">${preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg}"><tr><td align="center" class="fjw-outer" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px">
<tr><td style="background:#ffffff;border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="72%" height="4" style="height:4px;line-height:4px;font-size:0;background:${BRAND.blue}">&nbsp;</td><td width="28%" height="4" style="height:4px;line-height:4px;font-size:0;background:${BRAND.orange}">&nbsp;</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="left" style="padding:24px 36px 20px;border-bottom:1px solid ${BRAND.line}"><a href="${home}" target="_blank" style="text-decoration:none">${logo()}</a></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="fjw-pad" style="padding:32px 36px 36px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.gray}">
${label ? eyebrow(label, tone) : ''}<h1 class="fjw-title" style="margin:0 0 16px;font-family:${FONT};font-size:23px;line-height:1.3;font-weight:800;color:${BRAND.ink}">${title}</h1>
${bodyHtml}${cta ? button(cta, { tone: ctaTone || 'orange' }) : ''}${cta && showLink ? linkFallback(cta.url) : ''}
</td></tr></table></td></tr>
<tr><td style="padding:22px 12px 0;font-family:${FONT};font-size:12px;line-height:1.7;color:${BRAND.muted};text-align:center">
<b style="color:${BRAND.gray}">Safety tip:</b> ${config.appName} and genuine employers never ask for money to give a job. Report anyone who does.<br/>
<a href="${home}/jobs" style="color:${BRAND.muted};text-decoration:underline">Find jobs</a> &nbsp;&middot;&nbsp; <a href="${home}/help-center" style="color:${BRAND.muted};text-decoration:underline">Help centre</a> &nbsp;&middot;&nbsp; <a href="${home}/legal/privacy-policy" style="color:${BRAND.muted};text-decoration:underline">Privacy</a>${settingsLink ? ` &nbsp;&middot;&nbsp; <a href="${home}/candidate/settings" style="color:${BRAND.muted};text-decoration:underline">E-mail preferences</a>` : ''}<br/>
&copy; ${new Date().getFullYear()} ${config.appName}. All rights reserved.
</td></tr></table></td></tr></table></body></html>`;
}

/** Plain-text part: improves inbox placement and serves text-only clients. */
export function htmlToText(html) {
  return String(html)
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<div style="display:none[\s\S]*?<\/div>/i, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url, label) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      if (!text) return '';
      return text === url ? url : `${text}: ${url}`;
    })
    .replace(/<(br|\/p|\/h1|\/tr|\/li)[^>]*>/gi, '\n')
    .replace(/<\/td>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '-')
    .replace(/&copy;/g, '(c)')
    .replace(/&#(8199|65279|847);/g, '') // invisible preheader padding
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const hi = (name) => `Hi ${name || 'there'},`;

/** What each OTP is for, so a code that arrives unexpectedly is easy to recognise. */
const OTP_PURPOSE = {
  login: ['Your login code', 'Use this code to log in to your account.'],
  verify_mobile: ['Verify your mobile number', 'Use this code to verify your mobile number.'],
  reset_password: ['Reset your password', 'Use this code to reset your password.'],
  change_email: ['Confirm your new e-mail', 'Use this code to confirm the change of your e-mail address.'],
  change_mobile: ['Confirm your new mobile number', 'Use this code to confirm the change of your mobile number.'],
  guest_apply: ['Confirm your job application', 'Use this code to send your application.'],
  guest_post: ['Confirm your job post', 'Use this code to publish your job.'],
  job_alert: ['Confirm your job alert', 'Use this code to start your job alert.'],
};

const STATUS_TONE = { hired: 'green', offered: 'green', shortlisted: 'green', 'interview scheduled': 'blue', rejected: 'red', 'not selected': 'red' };

export const templates = {
  otp: ({ otp, minutes, purpose }) => {
    const [title, line] = OTP_PURPOSE[purpose] || ['Your verification code', 'Enter this code to continue.'];
    return {
      // The code stays out of the subject so it does not show on lock screens.
      subject: `${title} - ${config.appName}`,
      html: layout(
        title,
        `${paragraph(`${line} It expires in <b style="color:${BRAND.ink}">${minutes} minutes</b>.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 22px"><tr><td align="center" style="background:${BRAND.blueTint};border:1px dashed #9CC0E6;border-radius:12px;padding:22px 12px"><span class="fjw-otp" style="font-family:${MONO};font-size:36px;line-height:1;font-weight:800;letter-spacing:12px;color:${BRAND.blue}">${otp}</span></td></tr></table>
${paragraph(`<b style="color:${BRAND.ink}">Do not share this code</b> with anyone, not even someone who says they work at ${config.appName}. We will never ask you for it.`)}
${small('Did not ask for this code? Someone may have typed your e-mail by mistake. You can ignore this e-mail and your account stays safe.')}`,
        undefined,
        { preheader: `${line} Expires in ${minutes} minutes.`, label: 'Security code' },
      ),
    };
  },
  verifyEmail: ({ name, url }) => ({
    subject: `Verify your e-mail address - ${config.appName}`,
    html: layout(
      hi(name),
      `${paragraph('Please confirm your e-mail address. It keeps your account secure, gets you the verified badge and makes sure recruiter messages reach you.')}${small('If you did not create this account, you can ignore this e-mail.')}`,
      { url, label: 'Verify my e-mail' },
      { preheader: 'One click to confirm your e-mail address.', label: 'Verify e-mail', showLink: true },
    ),
  }),
  resetPassword: ({ name, url }) => ({
    subject: `Reset your ${config.appName} password`,
    html: layout(
      hi(name),
      `${paragraph('We received a request to reset the password of your account. The link below works once and expires in <b>30 minutes</b>.')}${small('If this was not you, ignore this e-mail. Your password stays the same, and you may want to change it if you keep getting these.')}`,
      { url, label: 'Choose a new password', },
      { preheader: 'This link is valid for 30 minutes.', label: 'Account security', showLink: true },
    ),
  }),
  activation: ({ name, url, password }) => ({
    subject: `Your ${config.appName} account is ready`,
    html: layout(
      `Welcome${name ? `, ${name}` : ''}!`,
      `${paragraph(`An account has been created for you on ${config.appName}. Activate it to set your password and get started.`)}${password ? `${details([['Temporary password', `<span style="font-family:${MONO}">${password}</span>`]])}${small('Please change this password after you log in.')}` : ''}`,
      { url, label: 'Activate my account' },
      { preheader: 'Activate your account to get started.', label: 'Welcome', tone: 'green', showLink: true },
    ),
  }),
  applicationReceived: ({ name, jobTitle, company }) => ({
    subject: `Application sent: ${jobTitle} at ${company}`,
    html: layout(
      hi(name),
      `${paragraph(`Your application for <b style="color:${BRAND.ink}">${jobTitle}</b> has reached <b style="color:${BRAND.ink}">${company}</b>. We will let you know as soon as the recruiter responds.`)}${details([['Job', jobTitle], ['Company', company], ['Status', pill('Applied')]])}${small('Tip: a complete profile with a recent resume gets up to 3 times more recruiter views.')}`,
      { url: `${web()}/candidate/applications`, label: 'Track my application' },
      { preheader: `${company} has received your application.`, label: 'Application sent', tone: 'green', settingsLink: true },
    ),
  }),
  applicationStatus: ({ name, jobTitle, company, status }) => ({
    subject: `Update on your application: ${jobTitle}`,
    html: layout(
      hi(name),
      `${paragraph(`<b style="color:${BRAND.ink}">${company}</b> has updated your application for <b style="color:${BRAND.ink}">${jobTitle}</b>.`)}${details([['Job', jobTitle], ['Company', company], ['New status', pill(status, STATUS_TONE[String(status).toLowerCase()] || 'blue')]])}`,
      { url: `${web()}/candidate/applications`, label: 'View my application' },
      { preheader: `New status: ${status}`, label: 'Application update', settingsLink: true },
    ),
  }),
  interview: ({ name, jobTitle, company, when, mode, location }) => ({
    subject: `Interview scheduled: ${jobTitle} at ${company}`,
    html: layout(
      hi(name),
      `${paragraph(`Good news! <b style="color:${BRAND.ink}">${company}</b> would like to interview you for <b style="color:${BRAND.ink}">${jobTitle}</b>.`)}${details([['Date and time', when], ['Mode', mode], ['Where / link', location], ['Company', company]])}${small('Please confirm or ask for another time from your interviews page, so the recruiter knows you are coming.')}`,
      { url: `${web()}/candidate/interviews`, label: 'Confirm interview', },
      { preheader: `${company} - ${when}`, label: 'Interview scheduled', tone: 'green', ctaTone: 'blue' },
    ),
  }),
  jobInvite: ({ name, jobTitle, company, url, message }) => ({
    subject: `${company} invited you to apply: ${jobTitle}`,
    html: layout(
      hi(name),
      `${paragraph(`<b style="color:${BRAND.ink}">${company}</b> looked at your profile and thinks you could be a great fit for <b style="color:${BRAND.ink}">${jobTitle}</b>.`)}${message ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px"><tr><td style="border-left:3px solid ${BRAND.orange};background:${BRAND.orangeTint};padding:12px 16px;border-radius:0 8px 8px 0;font-style:italic;color:${BRAND.ink}">${message}</td></tr></table>` : ''}`,
      { url, label: 'View job and apply' },
      { preheader: `${company} invited you to apply.`, label: 'Job invitation', tone: 'orange', settingsLink: true },
    ),
  }),
  jobAlert: ({ name, alertName, jobs }) => ({
    subject: `${jobs.length} new ${jobs.length === 1 ? 'job' : 'jobs'} for "${alertName}"`,
    html: layout(
      hi(name),
      `${paragraph(`Here ${jobs.length === 1 ? 'is a new job' : `are ${jobs.length} new jobs`} matching your alert <b style="color:${BRAND.ink}">${alertName}</b>.`)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 0">${jobs
        .map(
          (j) =>
            `<tr><td style="padding:14px 16px;border:1px solid ${BRAND.line};border-radius:10px"><a href="${web()}/jobs/${j.slug}" style="font-size:16px;font-weight:700;color:${BRAND.blue};text-decoration:none">${j.title}</a><br/><span style="font-size:13px;color:${BRAND.gray}">${[j.company, j.location].filter(Boolean).join(' &middot; ')}</span>${[j.experience, j.salary].some(Boolean) ? `<br/><span style="font-size:13px;color:${BRAND.muted}">${[j.experience, j.salary].filter(Boolean).join(' &middot; ')}</span>` : ''}</td></tr><tr><td style="height:10px;line-height:10px;font-size:0">&nbsp;</td></tr>`,
        )
        .join('')}</table>`,
      { url: `${web()}/jobs`, label: 'See all matching jobs', },
      { preheader: `New matches for ${alertName}`, label: 'Job alert', settingsLink: true, ctaTone: 'blue' },
    ),
  }),
  subscriptionExpiry: ({ name, planName, date, url }) => ({
    subject: `Your ${planName} plan expires on ${date}`,
    html: layout(
      hi(name),
      `${paragraph('Your plan is about to expire. Renew it now so your job posts, resume searches and credits keep working without a break.')}${details([['Plan', planName], ['Expires on', pill(date, 'orange')]])}${small('Turn on auto-renew and keep money in your wallet to renew automatically next time.')}`,
      { url: url || `${web()}/employer/packages-billing`, label: 'Renew my plan' },
      { preheader: `Expires on ${date}`, label: 'Plan expiring', tone: 'orange' },
    ),
  }),
  generic: ({ title, html, url, label }) => ({ subject: title, html: layout(title, html, url ? { url, label: label || 'Open' } : undefined) }),
};

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const RAW_KEYS = new Set(['url', 'html', 'otp', 'minutes', 'purpose']);
function escapeVars(value, key) {
  if (RAW_KEYS.has(key)) return value;
  if (Array.isArray(value)) return value.map((v) => escapeVars(v));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, escapeVars(v, k)]));
  }
  return typeof value === 'string' ? escapeHtml(value) : value;
}

/** Renders a built-in template with all user-supplied values HTML-escaped. */
export function renderEmail(name, vars = {}) {
  const tpl = templates[name] || templates.generic;
  const rendered = tpl(escapeVars(vars));
  return { ...rendered, text: htmlToText(rendered.html) };
}
