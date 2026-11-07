import { Router } from 'express';
import Joi from 'joi';
import config from '../../config/env.js';
import validate from '../../shared/middleware/validate.js';
import { ok } from '../../shared/http/response.js';
import { JOB_STATUS, USER_STATUS } from '../../shared/constants/index.js';
import Job from '../jobs/job.model.js';
import Organization from '../employers/organization.model.js';
import JobEvent from '../events/event.model.js';
import { Blog, Page } from '../cms/cms.models.js';

/**
 * SEO helpers for the web app (a single-page app):
 *  - GET /seo/sitemap.xml  every public URL (static pages, jobs, companies, recruiters, events, blogs, CMS pages)
 *  - GET /seo/meta?path=   title / description / image of one public page, for link previews
 *    (WhatsApp, Facebook, LinkedIn, X, Telegram do not run JavaScript).
 */
const r = Router();

const STATIC = ['/', '/jobs', '/jobs?kind=internship', '/companies', '/recruiters', '/events', '/career-advice', '/help-center', '/for-employers', '/post-job', '/job-alerts'];
const MAX_URLS = 50000;
const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
const clip = (s = '', n = 160) => {
  const t = String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

r.get('/sitemap.xml', async (_req, res) => {
  const [jobs, orgs, events, blogs, pages] = await Promise.all([
    Job.find({ status: JOB_STATUS.ACTIVE }).select('slug refreshedAt updatedAt').sort({ refreshedAt: -1 }).limit(40000).lean(),
    Organization.find({ status: USER_STATUS.ACTIVE }).select('slug username type updatedAt').limit(5000).lean(),
    JobEvent.find({ status: 'published' }).select('slug updatedAt').limit(2000).lean(),
    Blog.find({ status: 'published' }).select('slug updatedAt').limit(2000).lean(),
    Page.find({ status: 'published' }).select('slug updatedAt').lean(),
  ]);
  const web = config.urls.web;
  const url = (loc, lastmod, freq = 'weekly') => `<url><loc>${esc(web + loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ''}<changefreq>${freq}</changefreq></url>`;
  const all = [
    ...STATIC.map((p) => url(p, null, 'daily')),
    ...jobs.map((j) => url(`/jobs/${j.slug}`, j.refreshedAt || j.updatedAt, 'daily')),
    ...orgs.filter((o) => o.slug || o.username).map((o) => url(`/${o.type === 'consultancy' ? 'recruiters' : 'companies'}/${o.slug || o.username}`, o.updatedAt)),
    ...events.map((e) => url(`/events/${e.slug}`, e.updatedAt)),
    ...blogs.map((b) => url(`/career-advice/${b.slug}`, b.updatedAt, 'monthly')),
    ...pages.map((p) => url(p.slug === 'about-us' ? '/about-us' : `/legal/${p.slug}`, p.updatedAt, 'monthly')),
  ].slice(0, MAX_URLS);
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${all.join('')}</urlset>`);
});

const DEFAULT_META = { title: 'Freejobwala – Find jobs, hire talent', description: 'Find verified jobs and internships across India, or hire great talent on Freejobwala.' };

async function metaFor(path) {
  const [, section, slug] = path.split('?')[0].split('/');
  if (section === 'jobs' && slug) {
    const j = await Job.findOne({ slug, status: { $in: [JOB_STATUS.ACTIVE, JOB_STATUS.EXPIRED, JOB_STATUS.CLOSED] } })
      .select('title description orgSnapshot consultancyClient locations salary kind')
      .lean();
    if (!j) return null;
    const company = j.consultancyClient?.name && !j.consultancyClient?.hideName ? j.consultancyClient.name : j.orgSnapshot?.name;
    const city = j.locations?.[0]?.city;
    const pay = j.salary?.hidden || (!j.salary?.min && !j.salary?.max) ? '' : ` · ₹${j.salary.min || ''}${j.salary.max ? `-${j.salary.max}` : ''} per month`;
    return { title: `${j.title}${company ? ` at ${company}` : ''}${city ? `, ${city}` : ''}`, description: clip(`${j.kind === 'internship' ? 'Internship' : 'Job'}${pay}. ${j.description || ''}`), image: j.orgSnapshot?.logo, type: 'article' };
  }
  if ((section === 'companies' || section === 'recruiters') && slug) {
    const o = await Organization.findOne({ $or: [{ slug }, { username: slug }], status: USER_STATUS.ACTIVE }).select('name about logo industries').lean();
    if (!o) return null;
    return { title: `${o.name} jobs and company profile`, description: clip(`${o.industries?.[0] ? `${o.industries[0]}. ` : ''}${o.about || `Open jobs at ${o.name}.`}`), image: o.logo?.url };
  }
  if (section === 'events' && slug) {
    const e = await JobEvent.findOne({ slug, status: { $ne: 'draft' } }).select('title description banner').lean();
    return e ? { title: e.title, description: clip(e.description || 'Hiring event on Freejobwala'), image: e.banner?.url } : null;
  }
  if (section === 'career-advice' && slug) {
    const b = await Blog.findOne({ slug, status: 'published' }).select('title excerpt content coverImage seo').lean();
    return b ? { title: b.seo?.title || b.title, description: clip(b.seo?.description || b.excerpt || b.content), image: b.seo?.ogImage || b.coverImage?.url, type: 'article' } : null;
  }
  if (section === 'legal' && slug) {
    const p = await Page.findOne({ slug, status: 'published' }).select('title content seo').lean();
    return p ? { title: p.seo?.title || p.title, description: clip(p.seo?.description || p.content) } : null;
  }
  return null;
}

r.get('/meta', validate({ query: Joi.object({ path: Joi.string().max(500).pattern(/^\//).required() }) }), async (req, res) => {
  const meta = (await metaFor(req.query.path)) || DEFAULT_META;
  res.set('Cache-Control', 'public, max-age=300');
  return ok(res, { ...DEFAULT_META, ...meta, url: `${config.urls.web}${req.query.path}` });
});

export default r;
