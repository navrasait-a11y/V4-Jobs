/** Vercel function: robots.txt with the sitemap address of whichever domain serves the site. */
export default function handler(req, res) {
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400');
  res.status(200).send(
    [
      'User-agent: *',
      'Disallow: /admin',
      'Disallow: /candidate',
      'Disallow: /employer/',
      'Disallow: /impersonate',
      'Disallow: /reset-password',
      'Disallow: /set-password',
      'Allow: /for-employers',
      'Allow: /',
      '',
      `Sitemap: ${origin}/sitemap.xml`,
      '',
    ].join('\n'),
  );
}
