import { Router } from 'express';
import Joi from 'joi';
import sanitizeHtml from 'sanitize-html';
import validate from '../../shared/middleware/validate.js';
import { optionalAuth, requireAdminPermission } from '../../shared/middleware/auth.js';
import { formLimiter } from '../../shared/middleware/rateLimit.js';
import { upload } from '../../shared/middleware/upload.js';
import { ok, created, paginated } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { crudController } from '../../shared/utils/crud.js';
import { exportRows } from '../../shared/utils/excel.js';
import { uniqueSlug, slugify, escapeRegex, renderTemplate } from '../../shared/utils/helpers.js';
import { dateRangeFilter } from '../../shared/utils/timespan.js';
import { putFile } from '../../shared/services/storage.service.js';
import { objectId, idParam, pagination, timespan, email, mobile, url, exportFormat, bulkIds } from '../../shared/validators/common.js';
import ApiError from '../../shared/errors/ApiError.js';
import config from '../../config/env.js';
import Organization from '../employers/organization.model.js';
import User from '../users/user.model.js';
import { notify, sendEmail } from '../notifications/notification.service.js';
import { buildShareLinks } from '../jobs/job.service.js';
import { audit } from '../activity/activity.service.js';
import { Page, Blog, Faq, Ad, EmailTemplate, ContactMessage, SalesLead } from './cms.models.js';

const cleanHtml = (html) =>
  sanitizeHtml(html || '', {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'span', 'figure', 'figcaption', 'iframe']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      '*': ['style', 'class'],
      img: ['src', 'alt', 'width', 'height'],
      iframe: ['src', 'width', 'height', 'allowfullscreen'],
    },
    allowedIframeHostnames: ['www.youtube.com', 'player.vimeo.com'],
  });

const seo = Joi.object({
  title: Joi.string().max(200),
  description: Joi.string().max(500),
  keywords: Joi.array().items(Joi.string().max(60)).max(20),
  ogImage: url,
});

/* ------------------------------------------------------------------ public */

export const publicRouter = Router();

publicRouter.get('/pages/:slug', validate({ params: Joi.object({ slug: Joi.string().max(120).required() }) }), async (req, res) => {
  const page = await Page.findOne({ slug: req.params.slug, status: 'published' }).select('-updatedBy').lean();
  if (!page) throw ApiError.notFound('Page not found');
  res.set('Cache-Control', 'public, max-age=300');
  return ok(res, page);
});

publicRouter.get(
  '/blogs',
  validate({
    query: Joi.object({
      ...pagination,
      q: Joi.string().max(100).allow(''),
      category: Joi.string().max(100),
      tag: Joi.string().max(60),
      featured: Joi.boolean(),
    }),
  }),
  async (req, res) => {
    const p = parsePagination(req.query, { defaultSort: '-publishedAt' });
    const f = { status: 'published', publishedAt: { $lte: new Date() } };
    if (req.query.category) f.category = req.query.category;
    if (req.query.tag) f.tags = req.query.tag;
    if (req.query.featured) f.isFeatured = true;
    if (req.query.q) f.$text = { $search: req.query.q };
    const [items, total] = await Promise.all([
      Blog.find(f)
        .select('-content')
        .sort({ publishedAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .populate('author', 'admin.nickname admin.designation avatar')
        .lean(),
      Blog.countDocuments(f),
    ]);
    return paginated(res, { items, total, page: p.page, limit: p.limit });
  },
);
publicRouter.get('/blogs/:slug', validate({ params: Joi.object({ slug: Joi.string().max(200).required() }) }), async (req, res) => {
  const blog = await Blog.findOneAndUpdate({ slug: req.params.slug, status: 'published' }, { $inc: { views: 1 } }, { new: true })
    .populate('author', 'admin.nickname admin.designation admin.bio admin.socialLinks avatar')
    .lean();
  if (!blog) throw ApiError.notFound('Blog not found');
  const related = await Blog.find({ _id: { $ne: blog._id }, status: 'published', category: blog.category })
    .select('title slug coverImage publishedAt')
    .sort({ publishedAt: -1 })
    .limit(4)
    .lean();
  const link = encodeURIComponent(`${config.urls.web}/blogs/${blog.slug}`);
  return ok(res, { ...blog, related, share: buildShareLinks(link, encodeURIComponent(blog.title)) });
});

publicRouter.get(
  '/faqs',
  validate({ query: Joi.object({ category: Joi.string().max(100), audience: Joi.string().valid('all', 'candidate', 'employer') }) }),
  async (req, res) => {
    const f = { isActive: true };
    if (req.query.category) f.category = req.query.category;
    if (req.query.audience) f.audience = { $in: ['all', req.query.audience] };
    return ok(res, await Faq.find(f).sort({ category: 1, order: 1 }).lean());
  },
);

publicRouter.get(
  '/ads',
  optionalAuth,
  validate({ query: Joi.object({ placement: Joi.string().max(60).required(), platform: Joi.string().valid('web', 'android', 'ios').default('web') }) }),
  async (req, res) => {
    const now = new Date();
    const audience = req.user ? ['all', req.user.role] : ['all', 'guest'];
    const ads = await Ad.find({
      placement: req.query.placement,
      isActive: true,
      platforms: req.query.platform,
      audience: { $in: audience },
      $and: [{ $or: [{ startAt: null }, { startAt: { $lte: now } }] }, { $or: [{ endAt: null }, { endAt: { $gte: now } }] }],
    })
      .select('name type image mobileImage link adUnitId html priority')
      .sort({ priority: -1 })
      .limit(5)
      .lean();
    if (ads.length) Ad.updateMany({ _id: { $in: ads.map((a) => a._id) } }, { $inc: { impressions: 1 } }).catch(() => {});
    return ok(res, ads);
  },
);
publicRouter.post('/ads/:id/click', validate({ params: idParam }), async (req, res) => {
  await Ad.updateOne({ _id: req.params.id }, { $inc: { clicks: 1 } });
  return ok(res, null);
});

publicRouter.post(
  '/contact',
  formLimiter,
  optionalAuth,
  validate({
    body: Joi.object({
      name: Joi.string().trim().min(2).max(120).required(),
      email: email.required(),
      mobile,
      subject: Joi.string().max(200),
      message: Joi.string().trim().min(5).max(5000).required(),
    }),
  }),
  async (req, res) =>
    created(res, await ContactMessage.create({ ...req.body, type: 'contact_us', user: req.user?._id, ip: req.ip }), 'Thank you for contacting us'),
);

/** "Candidate can contact employer without registration with contact form". */
publicRouter.post(
  '/employers/:id/contact',
  formLimiter,
  optionalAuth,
  validate({
    params: idParam,
    body: Joi.object({
      name: Joi.string().trim().min(2).max(120).required(),
      email: email.required(),
      mobile,
      subject: Joi.string().max(200),
      message: Joi.string().trim().min(5).max(5000).required(),
    }),
  }),
  async (req, res) => {
    const org = await Organization.findOne({ _id: req.params.id, status: 'active' }).select('owner name').lean();
    if (!org) throw ApiError.notFound('Employer not found');
    const msg = await ContactMessage.create({ ...req.body, type: 'employer_contact', organization: org._id, user: req.user?._id, ip: req.ip });
    notify(org.owner, {
      type: 'contact_form',
      title: `New enquiry from ${req.body.name}`,
      body: req.body.subject || req.body.message.slice(0, 120),
      data: { screen: 'enquiries', id: String(msg._id) },
      channels: ['in_app', 'push', 'email'],
    });
    return created(res, { id: msg._id }, 'Your message has been sent to the employer');
  },
);

publicRouter.post(
  '/sales-enquiry',
  formLimiter,
  validate({
    body: Joi.object({
      fullName: Joi.string().trim().min(2).max(120).required(),
      mobile: mobile.required(),
      workEmail: email.required(),
      employerType: Joi.string().valid('company', 'consultancy', 'freelancer').required(),
      designation: Joi.string().max(120).allow(''),
      companyName: Joi.string().max(200).allow(''),
      industry: Joi.string().max(150).allow(''),
      teamSize: Joi.string().max(50).allow(''),
      location: Joi.string().max(150).allow(''),
      requirement: Joi.string().max(500).allow(''),
      message: Joi.string().max(3000).allow(''),
      source: Joi.string().max(100).allow(''),
    }),
  }),
  async (req, res) => created(res, { id: (await SalesLead.create({ ...req.body, ip: req.ip }))._id }, 'Thank you! Our sales team will contact you shortly'),
);

publicRouter.get('/share', validate({ query: Joi.object({ url: url.required(), text: Joi.string().max(300).allow('') }) }), (req, res) => {
  if (!req.query.url.startsWith(config.urls.web)) throw ApiError.badRequest('Only platform links can be shared');
  return ok(res, buildShareLinks(encodeURIComponent(req.query.url), encodeURIComponent(req.query.text || '')));
});

/* --------------------------------------------------------------- employer */

export async function employerEnquiries(req, res) {
  const p = parsePagination(req.query);
  const f = { type: 'employer_contact', organization: req.orgId, ...(req.query.status ? { status: req.query.status } : {}) };
  const [items, total] = await Promise.all([
    ContactMessage.find(f).sort(p.sort).skip(p.skip).limit(p.limit).select('-ip').lean(),
    ContactMessage.countDocuments(f),
  ]);
  return paginated(res, { items, total, page: p.page, limit: p.limit });
}

/* ------------------------------------------------------------------ admin */

export const adminRouter = Router();
adminRouter.use(requireAdminPermission('cms.manage'));

function mount(path, Model, opts, schema) {
  const c = crudController(Model, opts);
  const listQuery = Joi.object({
    ...pagination,
    ...timespan,
    q: Joi.string().allow(''),
    ...Object.fromEntries((opts.filterFields || []).map((f) => [f, Joi.any()])),
  });
  adminRouter.get(path, validate({ query: listQuery }), c.list);
  adminRouter.get(`${path}/:id`, validate({ params: idParam }), c.get);
  adminRouter.post(path, validate({ body: schema }), c.create);
  adminRouter.patch(
    `${path}/:id`,
    validate({
      params: idParam,
      body: schema.fork(
        Object.keys(schema.describe().keys).filter((k) => schema.describe().keys[k].flags?.presence === 'required'),
        (x) => x.optional(),
      ),
    }),
    c.update,
  );
  adminRouter.delete(`${path}/:id`, validate({ params: idParam }), c.remove);
}

mount(
  '/pages',
  Page,
  {
    name: 'Page',
    searchFields: ['title', 'slug'],
    filterFields: ['type', 'status'],
    transform: (b, req) => ({ ...b, ...(b.content !== undefined ? { content: cleanHtml(b.content) } : {}), updatedBy: req.user._id }),
  },
  Joi.object({
    slug: Joi.string()
      .trim()
      .lowercase()
      .pattern(/^[a-z0-9-]+$/)
      .max(120)
      .required(),
    title: Joi.string().max(200).required(),
    type: Joi.string().valid('about', 'privacy', 'terms', 'cookie', 'contact', 'help', 'career_advice', 'disclaimer', 'refund', 'custom'),
    content: Joi.string().max(500000).allow(''),
    audience: Joi.string().valid('all', 'candidate', 'employer'),
    requiresConsent: Joi.boolean(),
    version: Joi.number().integer().min(1),
    status: Joi.string().valid('draft', 'published'),
    seo,
  }),
);

mount(
  '/blogs',
  Blog,
  {
    name: 'Blog',
    searchFields: ['title', 'category'],
    filterFields: ['status', 'category', 'author'],
    populate: { path: 'author', select: 'fullName admin.nickname' },
    transform: (b, req, isUpdate) => ({
      ...b,
      ...(b.content !== undefined ? { content: cleanHtml(b.content) } : {}),
      ...(!isUpdate ? { slug: b.slug ? slugify(b.slug) : uniqueSlug(b.title), author: req.user._id } : {}),
      ...(b.status === 'published' && !b.publishedAt ? { publishedAt: new Date() } : {}),
    }),
  },
  Joi.object({
    title: Joi.string().max(250).required(),
    slug: Joi.string().max(200),
    excerpt: Joi.string().max(600).allow(''),
    content: Joi.string().max(500000).required(),
    coverImage: Joi.object({ key: Joi.string(), url: Joi.string() }),
    category: Joi.string().max(100),
    tags: Joi.array().items(Joi.string().max(60)).max(20),
    status: Joi.string().valid('draft', 'published', 'scheduled', 'trashed'),
    publishedAt: Joi.date(),
    isFeatured: Joi.boolean(),
    seo,
  }),
);

mount(
  '/faqs',
  Faq,
  { name: 'Faq', searchFields: ['question'], filterFields: ['category', 'audience', 'isActive'], defaultSort: 'order' },
  Joi.object({
    question: Joi.string().max(500).required(),
    answer: Joi.string().max(10000).required(),
    category: Joi.string().max(100),
    audience: Joi.string().valid('all', 'candidate', 'employer'),
    order: Joi.number().integer(),
    isActive: Joi.boolean(),
  }),
);

mount(
  '/ads',
  Ad,
  {
    name: 'Ad',
    searchFields: ['name', 'placement'],
    filterFields: ['placement', 'type', 'isActive'],
    transform: (b) => ({ ...b, ...(b.html !== undefined ? { html: cleanHtml(b.html) } : {}) }),
  },
  Joi.object({
    name: Joi.string().max(200).required(),
    placement: Joi.string().max(60).required(),
    type: Joi.string().valid('banner', 'adsense', 'admob', 'html'),
    platforms: Joi.array().items(Joi.string().valid('web', 'android', 'ios')),
    audience: Joi.string().valid('all', 'guest', 'candidate', 'employer'),
    image: Joi.object({ key: Joi.string(), url: Joi.string() }),
    mobileImage: Joi.object({ key: Joi.string(), url: Joi.string() }),
    link: url.allow(''),
    adUnitId: Joi.string().max(200).allow(''),
    html: Joi.string().max(20000).allow(''),
    priority: Joi.number().integer(),
    startAt: Joi.date(),
    endAt: Joi.date(),
    isActive: Joi.boolean(),
  }),
);

mount(
  '/email-templates',
  EmailTemplate,
  {
    name: 'EmailTemplate',
    searchFields: ['name', 'subject'],
    filterFields: ['category', 'isActive'],
    transform: (b, req, isUpdate) => ({
      ...b,
      ...(!isUpdate ? { slug: uniqueSlug(b.name), createdBy: req.user._id } : {}),
      ...(b.html ? { html: cleanHtml(b.html) } : {}),
    }),
  },
  Joi.object({
    name: Joi.string().max(150).required(),
    subject: Joi.string().max(300).required(),
    html: Joi.string().max(200000).required(),
    variables: Joi.array().items(Joi.string().max(40)),
    category: Joi.string().max(60),
    isActive: Joi.boolean(),
  }),
);

/** Upload an image for CMS content (blog cover, ad banner, inline images). */
adminRouter.post('/media', upload('image', 'file'), async (req, res) => {
  const stored = await putFile(req.file, { folder: 'cms' });
  return created(res, { key: stored.key, url: stored.url });
});

/** Send an e-mail using a saved template ("Send me a copy" + "Save as template"). */
adminRouter.post(
  '/email-templates/send',
  validate({
    body: Joi.object({
      templateId: objectId,
      subject: Joi.string().max(300),
      html: Joi.string().max(200000),
      userIds: Joi.array().items(objectId).max(500),
      emails: Joi.array().items(email).max(500),
      vars: Joi.object().unknown(true).default({}),
      sendMeCopy: Joi.boolean().default(false),
      saveAsTemplate: Joi.string().max(150),
    }).or('templateId', 'html'),
  }),
  async (req, res) => {
    const tpl = req.body.templateId ? await EmailTemplate.findById(req.body.templateId).lean() : null;
    const subject = req.body.subject || tpl?.subject;
    const html = cleanHtml(req.body.html || tpl?.html);
    if (!subject || !html) throw ApiError.badRequest('Subject and content are required');
    if (req.body.saveAsTemplate)
      await EmailTemplate.create({ name: req.body.saveAsTemplate, slug: uniqueSlug(req.body.saveAsTemplate), subject, html, createdBy: req.user._id });
    const users = req.body.userIds?.length
      ? await User.find({ _id: { $in: req.body.userIds } })
          .select('email fullName')
          .lean()
      : [];
    const recipients = [...users.map((u) => ({ email: u.email, name: u.fullName, id: u._id })), ...(req.body.emails || []).map((e) => ({ email: e }))].filter(
      (r) => r.email,
    );
    if (req.body.sendMeCopy && req.user.email) recipients.push({ email: req.user.email, name: req.user.fullName });
    for (const r of recipients.slice(0, 501)) {
      const vars = { ...req.body.vars, name: r.name || '' };
      await sendEmail({
        to: r.email,
        subject: renderTemplate(subject, vars),
        html: renderTemplate(html, vars),
        category: 'bulk',
        user: r.id,
        sentBy: req.user._id,
      });
    }
    audit(req, { action: 'email.bulk_send', entity: 'EmailTemplate', entityId: req.body.templateId, changes: { count: recipients.length } });
    return ok(res, { queued: recipients.length }, 'E-mails queued');
  },
);

/* contact messages */
adminRouter.get(
  '/contacts',
  validate({
    query: Joi.object({
      ...pagination,
      ...timespan,
      type: Joi.string().valid('contact_us', 'employer_contact'),
      status: Joi.string(),
      q: Joi.string().allow(''),
    }),
  }),
  async (req, res) => {
    const p = parsePagination(req.query);
    const f = { ...dateRangeFilter(req.query) };
    if (req.query.type) f.type = req.query.type;
    if (req.query.status) f.status = req.query.status;
    if (req.query.q) f.$or = [{ name: new RegExp(escapeRegex(req.query.q), 'i') }, { email: new RegExp(escapeRegex(req.query.q), 'i') }];
    const [items, total] = await Promise.all([
      ContactMessage.find(f).sort(p.sort).skip(p.skip).limit(p.limit).populate('organization', 'name uid').lean(),
      ContactMessage.countDocuments(f),
    ]);
    return paginated(res, { items, total, page: p.page, limit: p.limit });
  },
);
adminRouter.patch(
  '/contacts/:id',
  validate({ params: idParam, body: Joi.object({ status: Joi.string().valid('new', 'read', 'replied', 'closed', 'spam').required() }) }),
  async (req, res) => ok(res, await ContactMessage.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }), 'Updated'),
);

/* sales leads */
const leadQuery = Joi.object({
  ...pagination,
  ...timespan,
  status: Joi.string().valid('new', 'contacted', 'qualified', 'converted', 'lost'),
  assignedTo: objectId,
  employerType: Joi.string(),
  q: Joi.string().allow(''),
  format: exportFormat,
});
const leadFilter = (q) => {
  const f = { ...dateRangeFilter(q) };
  for (const k of ['status', 'assignedTo', 'employerType']) if (q[k]) f[k] = q[k];
  if (q.q)
    f.$or = [
      { fullName: new RegExp(escapeRegex(q.q), 'i') },
      { companyName: new RegExp(escapeRegex(q.q), 'i') },
      { workEmail: new RegExp(escapeRegex(q.q), 'i') },
      { mobile: q.q },
    ];
  return f;
};
const leadsAdmin = Router();
leadsAdmin.use(requireAdminPermission('leads.manage'));
leadsAdmin.get('/', validate({ query: leadQuery }), async (req, res) => {
  const p = parsePagination(req.query);
  const f = leadFilter(req.query);
  const [items, total] = await Promise.all([
    SalesLead.find(f).sort(p.sort).skip(p.skip).limit(p.limit).populate('assignedTo', 'fullName email').lean(),
    SalesLead.countDocuments(f),
  ]);
  return paginated(res, { items, total, page: p.page, limit: p.limit });
});
leadsAdmin.get('/export', validate({ query: leadQuery }), async (req, res) => {
  const rows = await SalesLead.find(leadFilter(req.query)).sort({ createdAt: -1 }).limit(50000).populate('assignedTo', 'fullName').lean();
  return exportRows(res, {
    format: req.query.format,
    filename: 'sales-leads',
    columns: [
      { header: 'Date', key: 'createdAt' },
      { header: 'Full Name', key: 'fullName' },
      { header: 'Mobile Number', key: 'mobile' },
      { header: 'Work Email', key: 'workEmail' },
      { header: 'Employer Type', key: 'employerType' },
      { header: 'Designation', key: 'designation' },
      { header: 'Company Name', key: 'companyName' },
      { header: 'Company Industry', key: 'industry' },
      { header: 'Team Size', key: 'teamSize' },
      { header: 'Location', key: 'location' },
      { header: 'Requirement', key: 'requirement' },
      { header: 'Status', key: 'status' },
      { header: 'Assigned To', key: 'assignedTo.fullName' },
    ],
    rows,
  });
});
leadsAdmin.post('/assign', validate({ body: Joi.object({ ids: bulkIds(1000), assignedTo: objectId.required() }) }), async (req, res) => {
  const r = await SalesLead.updateMany({ _id: { $in: req.body.ids } }, { $set: { assignedTo: req.body.assignedTo } });
  audit(req, { action: 'lead.assign', entity: 'SalesLead', changes: req.body });
  notify(req.body.assignedTo, { type: 'lead_assigned', title: `${r.modifiedCount} sales leads assigned to you`, channels: ['in_app', 'email'] });
  return ok(res, { updated: r.modifiedCount }, 'Leads assigned');
});
leadsAdmin.patch(
  '/:id',
  validate({
    params: idParam,
    body: Joi.object({
      status: Joi.string().valid('new', 'contacted', 'qualified', 'converted', 'lost'),
      note: Joi.string().max(2000),
      assignedTo: objectId,
    }).min(1),
  }),
  async (req, res) => {
    const update = { $set: {} };
    if (req.body.status) update.$set.status = req.body.status;
    if (req.body.assignedTo) update.$set.assignedTo = req.body.assignedTo;
    if (req.body.note) update.$push = { notes: { note: req.body.note, by: req.user._id } };
    const lead = await SalesLead.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!lead) throw ApiError.notFound('Lead not found');
    return ok(res, lead, 'Updated');
  },
);

export { leadsAdmin };
