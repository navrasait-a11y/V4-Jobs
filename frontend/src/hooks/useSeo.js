import { useEffect } from 'react';

const SITE = 'Freejobwala';
const DEFAULT_DESCRIPTION = 'Find verified jobs and internships across India, or hire great talent on Freejobwala.';
const DEFAULT_IMAGE = '/logo.png';

const absolute = (url) => {
  if (!url) return undefined;
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return undefined;
  }
};
const clip = (text = '', max = 160) => {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

function setMeta(attr, key, content) {
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    tag.dataset.seo = '1';
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * Per-page SEO for the single-page app: title, description, canonical, Open Graph / Twitter and
 * optional JSON-LD. Crawlers that do not run JavaScript get the same tags from the Vercel share
 * function (frontend/api/seo.js).
 */
export default function useSeo({ title, description, image, path, type = 'website', noindex = false, jsonLd } = {}) {
  const ld = jsonLd ? JSON.stringify(jsonLd) : '';
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE}` : `${SITE} – Find jobs, hire talent`;
    const desc = clip(description || DEFAULT_DESCRIPTION);
    const url = absolute(path || `${window.location.pathname}${window.location.search}`);
    const img = absolute(image || DEFAULT_IMAGE);
    document.title = fullTitle;
    setMeta('name', 'description', desc);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', img);
    setMeta('property', 'og:site_name', SITE);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', img);
    setCanonical(url);

    let script;
    if (ld) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.seo = '1';
      script.text = ld;
      document.head.appendChild(script);
    }
    return () => script?.remove();
  }, [title, description, image, path, type, noindex, ld]);
}

export { clip as seoClip };
