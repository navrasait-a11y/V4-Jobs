/**
 * Vercel function: link previews for crawlers that do not run JavaScript (WhatsApp, Facebook,
 * LinkedIn, X, Telegram, Slack ...). vercel.json sends only those user agents here; people and
 * Google get the normal app. Meta comes from the API (GET /seo/meta).
 */
const API = (process.env.API_URL || process.env.VITE_API_URL || '').replace(/\/$/, '');
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export default async function handler(req, res) {
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const path = String(req.query.path || '/').startsWith('/') ? String(req.query.path || '/') : `/${req.query.path}`;
  let meta = { title: 'Freejobwala – Find jobs, hire talent', description: 'Find verified jobs and internships across India, or hire great talent on Freejobwala.' };
  try {
    const r = await fetch(`${API}/seo/meta?path=${encodeURIComponent(path)}`, { headers: { accept: 'application/json' } });
    if (r.ok) meta = { ...meta, ...(await r.json()).data };
  } catch {
    /* fall back to the site defaults */
  }
  const url = `${origin}${path}`;
  const image = meta.image ? new URL(meta.image, origin).href : `${origin}/logo.png`;
  const title = meta.title.includes('Freejobwala') ? meta.title : `${meta.title} | Freejobwala`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  res.status(200).send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(meta.description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="Freejobwala">
<meta property="og:type" content="${esc(meta.type || 'website')}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(meta.description)}">
<meta name="twitter:image" content="${esc(image)}">
</head><body><h1>${esc(title)}</h1><p>${esc(meta.description)}</p><a href="${esc(url)}">Open on Freejobwala</a></body></html>`);
}
