/** Vercel function: /sitemap.xml is served from the API (every public job, company, event and article). */
const API = (process.env.API_URL || process.env.VITE_API_URL || '').replace(/\/$/, '');

export default async function handler(_req, res) {
  try {
    const r = await fetch(`${API}/seo/sitemap.xml`);
    if (!r.ok) throw new Error(`API ${r.status}`);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(await r.text());
  } catch {
    res.status(503).send('Sitemap is temporarily unavailable');
  }
}
