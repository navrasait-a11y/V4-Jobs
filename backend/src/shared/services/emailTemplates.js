import config from '../../config/env.js';

const BRAND = { blue: '#0A6CB5', orange: '#EE7D0A', ink: '#111827', gray: '#4B5563', muted: '#6B7280', line: '#E6EAF0', bg: '#F4F6FA' };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Bulletproof button: table cell padding keeps it solid in Outlook. */
const button = ({ url, label }) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px"><tr><td bgcolor="${BRAND.orange}" style="border-radius:8px"><a href="${url}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${label}</a></td></tr></table>`;

/** Two-column facts block, used for interview and plan details. */
const details = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;background:${BRAND.bg};border-radius:8px">${rows
  .filter(([, v]) => v)
  .map(([k, v]) => `<tr><td style="padding:10px 16px;font-size:13px;color:${BRAND.muted};width:34%;vertical-align:top">${k}</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:${BRAND.ink}">${v}</td></tr>`)
  .join('')}</table>`;

const paragraph = (html) => `<p style="margin:0 0 14px">${html}</p>`;

/** Table-based and inline-styled, because mail clients ignore most CSS. */
export function layout(title, bodyHtml, cta, { preheader = '', settingsLink = false } = {}) {
  const web = config.urls.web;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/><meta name="supported-color-schemes" content="light"/><title>${title}</title>
<style>@media (max-width:600px){.fjw-pad{padding:24px 20px !important}.fjw-title{font-size:20px !important}.fjw-otp{font-size:28px !important;letter-spacing:6px !important}}</style></head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px"><a href="${web}" target="_blank" style="text-decoration:none"><img src="${web}/logo.png" width="170" alt="${config.appName}" style="display:block;width:170px;height:auto;border:0;font-family:${FONT};font-size:20px;font-weight:700;color:${BRAND.blue}"/></a></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${BRAND.line};border-top:3px solid ${BRAND.blue};border-radius:10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="fjw-pad" style="padding:32px 36px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.gray}">
<h1 class="fjw-title" style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.ink}">${title}</h1>
${bodyHtml}${cta ? button(cta) : ''}
</td></tr></table></td></tr>
<tr><td style="padding:18px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.muted}">
${config.appName} never asks candidates to pay for a job. Report anyone who does.<br/>
<a href="${web}/help-center" style="color:${BRAND.muted}">Help centre</a> &nbsp;&middot;&nbsp; <a href="${web}/legal/privacy-policy" style="color:${BRAND.muted}">Privacy policy</a>${settingsLink ? ` &nbsp;&middot;&nbsp; <a href="${web}/candidate/settings" style="color:${BRAND.muted}">E-mail preferences</a>` : ''}<br/>
&copy; ${new Date().getFullYear()} ${config.appName}
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
      return text ? `${text}: ${url}` : '';
    })
    .replace(/<(br|\/p|\/h1|\/tr|\/li)[^>]*>/gi, '\n')
    .replace(/<\/td>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '-')
    .replace(/&copy;/g, '(c)')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const hi = (name) => `Hi ${name || 'there'},`;

export const templates = {
  otp: ({ otp, minutes }) => ({
    // The code stays out of the subject so it does not show on lock screens.
    subject: `Your ${config.appName} verification code`,
    html: layout(
      'Your verification code',
      `${paragraph(`Enter this code to continue. It is valid for ${minutes} minutes.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td align="center" style="background:${BRAND.bg};border-radius:8px;padding:20px 12px"><span class="fjw-otp" style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${BRAND.ink}">${otp}</span></td></tr></table>
${paragraph(`Never share this code with anyone. ${config.appName} staff will never ask for it.`)}
<p style="margin:0;font-size:13px;color:${BRAND.muted}">Did not request this? You can ignore this e-mail, and your account stays safe.</p>`,
      undefined,
      { preheader: `Valid for ${minutes} minutes. Do not share it with anyone.` },
    ),
  }),
  verifyEmail: ({ name, url }) => ({
    subject: `Verify your e-mail for ${config.appName}`,
    html: layout(hi(name), `${paragraph('Please confirm your e-mail address to secure your account and earn your verified badge.')}<p style="margin:0;font-size:13px;color:${BRAND.muted}">If you did not create this account, you can ignore this e-mail.</p>`, { url, label: 'Verify e-mail' }, { preheader: 'Confirm your e-mail address to finish setting up.' }),
  }),
  resetPassword: ({ name, url }) => ({
    subject: `Reset your ${config.appName} password`,
    html: layout(hi(name), `${paragraph('We received a request to reset your password. This link is valid for 30 minutes.')}<p style="margin:0;font-size:13px;color:${BRAND.muted}">If this was not you, ignore this e-mail. Your password will not change.</p>`, { url, label: 'Reset password' }, { preheader: 'This link is valid for 30 minutes.' }),
  }),
  activation: ({ name, url, password }) => ({
    subject: `Your ${config.appName} account is ready`,
    html: layout(
      `Welcome${name ? `, ${name}` : ''}`,
      `${paragraph(`An account has been created for you on ${config.appName}.`)}${password ? `${details([['Temporary password', password]])}<p style="margin:14px 0 0">Please change it after you log in.</p>` : ''}`,
      { url, label: 'Activate account' },
      { preheader: 'Activate your account to get started.' },
    ),
  }),
  applicationReceived: ({ name, jobTitle, company }) => ({
    subject: `Application submitted: ${jobTitle}`,
    html: layout(hi(name), `${paragraph('Your application has been submitted.')}${details([['Job', jobTitle], ['Company', company]])}`, { url: `${config.urls.web}/candidate/applications`, label: 'Track application' }, { preheader: `${company} has received your application.` }),
  }),
  applicationStatus: ({ name, jobTitle, company, status }) => ({
    subject: `Update on your application for ${jobTitle}`,
    html: layout(hi(name), `${paragraph('There is an update on your application.')}${details([['Job', jobTitle], ['Company', company], ['Status', status]])}`, { url: `${config.urls.web}/candidate/applications`, label: 'View details' }, { preheader: `Status: ${status}` }),
  }),
  interview: ({ name, jobTitle, company, when, mode, location }) => ({
    subject: `Interview scheduled: ${jobTitle}`,
    html: layout(hi(name), `${paragraph('Your interview has been scheduled.')}${details([['Job', jobTitle], ['Company', company], ['When', when], ['Mode', mode], ['Where / link', location]])}`, { url: `${config.urls.web}/candidate/interviews`, label: 'View interview' }, { preheader: `${company}, ${when}` }),
  }),
  jobInvite: ({ name, jobTitle, company, url, message }) => ({
    subject: `${company} invited you to apply: ${jobTitle}`,
    html: layout(hi(name), `${paragraph(`<b style="color:${BRAND.ink}">${company}</b> thinks you could be a good fit for <b style="color:${BRAND.ink}">${jobTitle}</b>.`)}${message ? paragraph(message) : ''}`, { url, label: 'View job' }, { preheader: `${company} invited you to apply.` }),
  }),
  jobAlert: ({ name, alertName, jobs }) => ({
    subject: `${jobs.length} new ${jobs.length === 1 ? 'job' : 'jobs'} for "${alertName}"`,
    html: layout(
      hi(name),
      `${paragraph('New jobs match your alert.')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${jobs
        .map((j) => `<tr><td style="padding:12px 0;border-top:1px solid ${BRAND.line}"><a href="${config.urls.web}/jobs/${j.slug}" style="font-size:15px;font-weight:600;color:${BRAND.blue};text-decoration:none">${j.title}</a><br/><span style="font-size:13px;color:${BRAND.muted}">${[j.company, j.location].filter(Boolean).join(' &middot; ')}</span></td></tr>`)
        .join('')}</table>`,
      { url: `${config.urls.web}/jobs`, label: 'See all jobs' },
      { preheader: `Matches for ${alertName}`, settingsLink: true },
    ),
  }),
  subscriptionExpiry: ({ name, planName, date, url }) => ({
    subject: `Your ${planName} plan expires on ${date}`,
    html: layout(hi(name), `${paragraph('Your plan is about to expire. Renew it to avoid any interruption.')}${details([['Plan', planName], ['Expires on', date]])}`, { url: url || `${config.urls.web}/employer/packages-billing`, label: 'Renew plan' }, { preheader: `Expires on ${date}` }),
  }),
  generic: ({ title, html, url, label }) => ({ subject: title, html: layout(title, html, url ? { url, label: label || 'Open' } : undefined) }),
};

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const RAW_KEYS = new Set(['url', 'html', 'otp', 'minutes']);
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
