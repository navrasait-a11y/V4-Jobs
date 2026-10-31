import mongoose from 'mongoose';

const { Schema } = mongoose;
const seo = { title: String, description: String, keywords: [String], ogImage: String };

/** Static pages: about, privacy policy, terms, cookie policy, contact, help center, career advice ... */
const pageSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ['about', 'privacy', 'terms', 'cookie', 'contact', 'help', 'career_advice', 'disclaimer', 'refund', 'custom'],
      default: 'custom',
      index: true,
    },
    content: { type: String, default: '' }, // sanitised HTML
    audience: { type: String, enum: ['all', 'candidate', 'employer'], default: 'all' },
    requiresConsent: { type: Boolean, default: false }, // show consent notification on change
    version: { type: Number, default: 1 },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    seo,
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const blogSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 250 },
    slug: { type: String, required: true, unique: true },
    excerpt: { type: String, maxlength: 600 },
    content: { type: String, required: true },
    coverImage: { key: String, url: String },
    category: { type: String, index: true },
    tags: { type: [String], index: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['draft', 'published', 'scheduled', 'trashed'], default: 'draft', index: true },
    publishedAt: { type: Date, index: true },
    isFeatured: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    seo,
  },
  { timestamps: true },
);
blogSchema.index({ title: 'text', excerpt: 'text', tags: 'text' });

const faqSchema = new Schema(
  {
    question: { type: String, required: true, maxlength: 500 },
    answer: { type: String, required: true, maxlength: 10000 },
    category: { type: String, default: 'General', index: true },
    audience: { type: String, enum: ['all', 'candidate', 'employer'], default: 'all' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** Advertisement slots: custom banners, Google AdSense (web) and AdMob (apps). */
const adSchema = new Schema(
  {
    name: { type: String, required: true },
    placement: { type: String, required: true, index: true }, // home_top, job_list_inline, job_detail_sidebar, dashboard ...
    type: { type: String, enum: ['banner', 'adsense', 'admob', 'html'], default: 'banner' },
    platforms: { type: [String], enum: ['web', 'android', 'ios'], default: ['web', 'android', 'ios'] },
    audience: { type: String, enum: ['all', 'guest', 'candidate', 'employer'], default: 'all' },
    image: { key: String, url: String },
    mobileImage: { key: String, url: String },
    link: String,
    adUnitId: String, // AdMob / AdSense slot id
    html: String, // sanitised custom HTML
    priority: { type: Number, default: 0 },
    startAt: Date,
    endAt: Date,
    isActive: { type: Boolean, default: true },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
  { timestamps: true },
);
adSchema.index({ placement: 1, isActive: 1, priority: -1 });

const emailTemplateSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    variables: [String], // e.g. name, jobTitle - rendered with {{name}}
    category: { type: String, default: 'general' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** Contact Us + "contact employer without registration" form submissions. */
const contactSchema = new Schema(
  {
    type: { type: String, enum: ['contact_us', 'employer_contact'], required: true, index: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true },
    email: String,
    mobile: String,
    subject: String,
    message: { type: String, required: true, maxlength: 5000 },
    status: { type: String, enum: ['new', 'read', 'replied', 'closed', 'spam'], default: 'new', index: true },
    ip: String,
  },
  { timestamps: true },
);

/** Sales enquiry leads from employers (company / consultancy / freelancer recruiters). */
const leadSchema = new Schema(
  {
    fullName: { type: String, required: true },
    mobile: { type: String, required: true },
    workEmail: { type: String, required: true, lowercase: true },
    employerType: { type: String, enum: ['company', 'consultancy', 'freelancer'], required: true },
    designation: String,
    companyName: String,
    industry: String,
    teamSize: String,
    location: String,
    requirement: String,
    message: String,
    source: String,
    status: { type: String, enum: ['new', 'contacted', 'qualified', 'converted', 'lost'], default: 'new', index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    notes: [{ note: String, by: { type: Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }],
    ip: String,
  },
  { timestamps: true },
);
leadSchema.index({ createdAt: -1 });

export const Page = mongoose.models.Page || mongoose.model('Page', pageSchema);
export const Blog = mongoose.models.Blog || mongoose.model('Blog', blogSchema);
export const Faq = mongoose.models.Faq || mongoose.model('Faq', faqSchema);
export const Ad = mongoose.models.Ad || mongoose.model('Ad', adSchema);
export const EmailTemplate = mongoose.models.EmailTemplate || mongoose.model('EmailTemplate', emailTemplateSchema);
export const ContactMessage = mongoose.models.ContactMessage || mongoose.model('ContactMessage', contactSchema);
export const SalesLead = mongoose.models.SalesLead || mongoose.model('SalesLead', leadSchema);
