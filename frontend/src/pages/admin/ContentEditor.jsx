import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { MediaField } from '../../components/admin/AdminActions';
import RichTextEditor from '../../components/admin/RichTextEditor';
import Button from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/data';
import { ErrorState, Icon, PageLoader } from '../../components/ui/feedback';
import { CheckboxField, Field, SelectField, TagInput, TextAreaField, TextField } from '../../components/ui/form';
import { useDocumentTitle, useLookups } from '../../hooks/useData';
import { adminApi } from '../../services';
import { formatDate, formatDateTime, toInputDateTime } from '../../utils/format';

const KINDS = {
  page: {
    api: '/cms/pages',
    list: '/admin/cms',
    label: 'Page',
    plural: 'Pages',
    publicPath: (slug) => (slug === 'about-us' ? '/about-us' : `/legal/${slug}`),
    statuses: ['draft', 'published'],
  },
  blog: {
    api: '/cms/blogs',
    list: '/admin/career-advice',
    label: 'Blog post',
    plural: 'Blogs',
    publicPath: (slug) => `/career-advice/${slug}`,
    statuses: ['draft', 'published', 'scheduled'],
  },
};
const PAGE_TYPES = ['about', 'privacy', 'terms', 'cookie', 'contact', 'help', 'career_advice', 'disclaimer', 'refund', 'custom'];
const DEVICES = [
  { key: 'desktop', icon: 'desktop_windows', width: '100%', label: 'Desktop' },
  { key: 'tablet', icon: 'tablet', width: '768px', label: 'Tablet' },
  { key: 'mobile', icon: 'smartphone', width: '375px', label: 'Mobile' },
];
const slugify = (s = '') =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
const plain = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const titleCase = (v = '') => v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const blank = (kind) => ({
  title: '',
  slug: '',
  content: '',
  status: 'draft',
  seo: { title: '', description: '', keywords: [], ogImage: '' },
  ...(kind === 'blog' ? { excerpt: '', coverImage: null, category: '', tags: [], isFeatured: false, publishedAt: '' } : { type: 'custom', audience: 'all', requiresConsent: false }),
});
const fromRecord = (kind, r) => ({
  ...blank(kind),
  ...r,
  seo: { title: '', description: '', keywords: [], ogImage: '', ...(r.seo || {}) },
  publishedAt: r.publishedAt ? toInputDateTime(r.publishedAt) : '',
});

const Card = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-brand-dark">
        {title}
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} className="text-brand-gray-muted" />
      </button>
      {open && <div className="space-y-3 border-t border-brand-border px-4 py-3">{children}</div>}
    </div>
  );
};

const Counter = ({ value = '', max }) => <span className={clsx('text-[11px]', value.length > max ? 'text-brand-red' : 'text-brand-gray-muted')}>{value.length}/{max}</span>;

/** What the public page will look like, at desktop, tablet or phone width. */
const Preview = ({ kind, form, device }) => {
  const width = DEVICES.find((d) => d.key === device).width;
  return (
    <div className="flex justify-center rounded-2xl bg-[#E9EEF5] p-3 sm:p-6">
      <div className="w-full overflow-hidden rounded-xl bg-white shadow-lg transition-all" style={{ maxWidth: width }}>
        <div className="flex items-center gap-1.5 border-b border-brand-border bg-brand-tint px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#F87171]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FBBF24]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#34D399]" />
          <span className="ml-2 truncate rounded bg-white px-2 py-0.5 text-[11px] text-brand-gray-muted">freejobwala.com{KINDS[kind].publicPath(form.slug || 'your-page')}</span>
        </div>
        <article className={clsx('mx-auto px-5 py-8', device === 'mobile' ? 'max-w-full' : 'max-w-[800px]')}>
          {kind === 'blog' && form.category && <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{form.category}</p>}
          <h1 className={clsx('mt-1 font-bold text-brand-dark', device === 'mobile' ? 'text-2xl' : 'text-3xl')}>{form.title || 'Untitled'}</h1>
          {kind === 'blog' && <p className="mt-2 text-xs text-brand-gray-muted">Freejobwala · {formatDate(form.publishedAt || new Date())} · {Math.max(1, Math.round(plain(form.content).split(' ').length / 200))} min read</p>}
          {kind === 'blog' && form.coverImage?.url && <img src={form.coverImage.url} alt="" className="mt-5 w-full rounded-xl" />}
          {form.content ? <div className="prose-content mt-6" dangerouslySetInnerHTML={{ __html: form.content }} /> : <p className="mt-6 text-sm text-brand-gray-muted">Nothing written yet.</p>}
        </article>
      </div>
    </div>
  );
};

/** Google result preview for the SEO card. */
const SearchSnippet = ({ kind, form }) => {
  const title = form.seo.title || form.title || 'Page title';
  const desc = form.seo.description || form.excerpt || plain(form.content).slice(0, 160) || 'A short description appears here.';
  return (
    <div className="rounded-lg border border-brand-border p-3">
      <p className="truncate text-[11px] text-[#202124]">freejobwala.com › {KINDS[kind].publicPath(form.slug || '…').split('/').filter(Boolean).join(' › ')}</p>
      <p className="mt-0.5 line-clamp-1 text-[15px] text-[#1A0DAB]">{title} | Freejobwala</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-[#4D5156]">{desc}</p>
    </div>
  );
};

/**
 * Full-page editor for CMS pages and blog posts: visual editor, settings sidebar, SEO with a Google
 * preview and a live device preview. Ctrl+S saves; leaving with unsaved changes asks first.
 */
const ContentEditor = ({ kind }) => {
  const cfg = KINDS[kind];
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const client = useQueryClient();
  const lookups = useLookups('blog_category');
  const [form, setForm] = useState(() => blank(kind));
  const [saved, setSaved] = useState(() => JSON.stringify(blank(kind)));
  const [mode, setMode] = useState('write'); // write | preview
  const [device, setDevice] = useState('desktop');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [slugTouched, setSlugTouched] = useState(false);

  const q = useQuery({ queryKey: ['admin', 'content', kind, id], queryFn: () => adminApi.get(`${cfg.api}/${id}`), enabled: !isNew });
  useEffect(() => {
    if (!q.data) return;
    const next = fromRecord(kind, q.data);
    setForm(next);
    setSaved(JSON.stringify(next));
    setSlugTouched(true);
  }, [q.data, kind]);
  useDocumentTitle(`${isNew ? 'New' : 'Edit'} ${cfg.label.toLowerCase()}`);

  const dirty = JSON.stringify(form) !== saved;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const setSeo = (k) => (e) => setForm((f) => ({ ...f, seo: { ...f.seo, [k]: e?.target ? e.target.value : e } }));
  const setTitle = (e) => {
    const title = e.target.value;
    setForm((f) => ({ ...f, title, ...(slugTouched ? {} : { slug: slugify(title) }) }));
  };

  const save = async (status) => {
    const f = { ...form, ...(status ? { status } : {}) };
    const errs = {};
    if (f.title.trim().length < 2) errs.title = 'Add a title';
    if (!plain(f.content) && !/<img|<iframe/.test(f.content)) errs.content = 'Write some content';
    if (kind === 'page' && !f.slug) errs.slug = 'Add the page URL';
    if (f.status === 'scheduled' && !f.publishedAt) errs.publishedAt = 'Pick the publish date';
    setErrors(errs);
    if (Object.keys(errs).length) return toast.error('Please fix the highlighted fields');
    const seo = Object.fromEntries(Object.entries(f.seo).filter(([, v]) => (Array.isArray(v) ? v.length : v)));
    const body = {
      title: f.title.trim(),
      content: f.content,
      status: f.status,
      ...(Object.keys(seo).length ? { seo } : {}),
      ...(isNew || kind === 'page' ? { slug: slugify(f.slug || f.title) } : {}),
      ...(kind === 'blog'
        ? { excerpt: f.excerpt || '', category: f.category || undefined, tags: f.tags, isFeatured: f.isFeatured, ...(f.coverImage?.url ? { coverImage: { key: f.coverImage.key, url: f.coverImage.url } } : {}), ...(f.publishedAt ? { publishedAt: new Date(f.publishedAt).toISOString() } : {}) }
        : { type: f.type, audience: f.audience, requiresConsent: f.requiresConsent }),
    };
    setSaving(true);
    try {
      const r = isNew ? await adminApi.post(cfg.api, body) : await adminApi.patch(`${cfg.api}/${id}`, body);
      const next = fromRecord(kind, r);
      setForm(next);
      setSaved(JSON.stringify(next));
      client.invalidateQueries({ queryKey: ['admin'] });
      toast.success(next.status === 'published' ? 'Published' : next.status === 'scheduled' ? 'Scheduled' : 'Draft saved');
      if (isNew && r._id) navigate(`${cfg.list}/${r._id}/edit`, { replace: true });
    } catch (e) {
      setErrors(e.fieldErrors || {});
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  // Ctrl/Cmd+S saves; closing the tab with unsaved changes asks first.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    const onLeave = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onLeave);
    };
  });

  const publicUrl = useMemo(() => (form.slug ? cfg.publicPath(form.slug) : null), [form.slug, cfg]);
  if (!isNew && q.isPending) return <PageLoader />;
  if (!isNew && q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const published = form.status === 'published';

  return (
    <div className="mx-auto max-w-7xl">
      <div className="sticky top-0 z-20 -mx-3 mb-4 flex flex-wrap items-center gap-2 border-b border-brand-border bg-white/95 px-3 py-2.5 backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
        <Link to={cfg.list} className="flex items-center gap-1 text-sm font-medium text-brand-blue" onClick={(e) => dirty && !window.confirm('Leave without saving your changes?') && e.preventDefault()}>
          <Icon name="arrow_back" size={18} /> <span className="hidden sm:inline">{cfg.plural}</span>
        </Link>
        <StatusBadge status={form.status} />
        <span className="hidden text-xs text-brand-gray-muted md:inline">{dirty ? 'Unsaved changes' : q.data?.updatedAt ? `Saved ${formatDateTime(q.data.updatedAt)}` : ''}</span>
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-brand-tint p-0.5">
          {[['write', 'edit', 'Write'], ['preview', 'visibility', 'Preview']].map(([m, icon, text]) => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={clsx('flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold', mode === m ? 'bg-white text-brand-blue shadow-sm' : 'text-brand-gray')}>
              <Icon name={icon} size={16} /> <span className="hidden sm:inline">{text}</span>
            </button>
          ))}
        </div>
        {publicUrl && published && !isNew && (
          <Button asChild size="sm" variant="ghost">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" aria-label="Open the live page">
              <Icon name="open_in_new" size={18} />
            </a>
          </Button>
        )}
        <Button size="sm" variant="outline" loading={saving} onClick={() => save(published ? 'draft' : undefined)}>
          {published ? 'Unpublish' : 'Save draft'}
        </Button>
        <Button size="sm" variant="primary" loading={saving} onClick={() => save(form.status === 'scheduled' ? 'scheduled' : 'published')}>
          {published ? 'Update' : form.status === 'scheduled' ? 'Schedule' : 'Publish'}
        </Button>
      </div>

      {mode === 'preview' ? (
        <div>
          <div className="mb-3 flex justify-center gap-1">
            {DEVICES.map((d) => (
              <button key={d.key} type="button" onClick={() => setDevice(d.key)} aria-pressed={device === d.key} className={clsx('flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold', device === d.key ? 'border-brand-blue bg-brand-blue-tint text-brand-blue' : 'border-brand-border bg-white text-brand-gray')}>
                <Icon name={d.icon} size={16} /> {d.label}
              </button>
            ))}
          </div>
          <Preview kind={kind} form={form} device={device} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            <div>
              <input
                value={form.title}
                onChange={setTitle}
                placeholder={kind === 'blog' ? 'Post title' : 'Page title'}
                aria-label="Title"
                className={clsx('w-full rounded-lg border bg-white px-4 py-3 text-xl font-bold text-brand-dark outline-none placeholder:text-brand-gray-muted sm:text-2xl', errors.title ? 'border-brand-red' : 'border-transparent focus:border-brand-blue focus:shadow-[0_0_0_3px_var(--color-brand-blue-tint)]')}
              />
              {errors.title && <p className="mt-1 text-xs text-brand-red">{errors.title}</p>}
            </div>
            <RichTextEditor value={form.content} onChange={set('content')} placeholder="Start writing… use the toolbar for headings, lists, images and tables." minHeight={460} error={errors.content} />
          </div>

          <aside className="space-y-3">
            <Card title="Publish">
              <SelectField label="Status" placeholder={null} options={cfg.statuses.map((v) => ({ value: v, label: titleCase(v) }))} value={form.status} onChange={set('status')} />
              {kind === 'blog' && (form.status === 'scheduled' || form.publishedAt) && <TextField label="Publish on" type="datetime-local" value={form.publishedAt} onChange={set('publishedAt')} error={errors.publishedAt} />}
              {kind === 'blog' && <CheckboxField label="Feature on the career advice page" checked={Boolean(form.isFeatured)} onChange={set('isFeatured')} />}
              {kind === 'page' && (
                <>
                  <SelectField label="Page type" placeholder={null} options={PAGE_TYPES.map((v) => ({ value: v, label: titleCase(v) }))} value={form.type} onChange={set('type')} />
                  <SelectField label="Audience" placeholder={null} options={['all', 'candidate', 'employer'].map((v) => ({ value: v, label: titleCase(v) }))} value={form.audience} onChange={set('audience')} />
                  <CheckboxField label="Ask users to accept this version" description="For policy changes: users see a consent notice" checked={Boolean(form.requiresConsent)} onChange={set('requiresConsent')} />
                </>
              )}
            </Card>
            <Card title="Web address">
              <Field label="URL slug" error={errors.slug} hint={publicUrl ? `Opens at ${publicUrl}` : 'Created from the title'}>
                <input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: slugify(e.target.value) }));
                  }}
                  disabled={kind === 'blog' && !isNew}
                  className="field-control h-10 px-3 text-sm"
                  aria-label="URL slug"
                />
              </Field>
              {kind === 'blog' && !isNew && <p className="text-[11px] text-brand-gray-muted">The address of a published post stays the same so shared links keep working.</p>}
            </Card>
            {kind === 'blog' && (
              <Card title="Cover, summary and category">
                <MediaField label="Cover image" value={form.coverImage} onChange={set('coverImage')} />
                <Field label="Short summary">
                  <TextAreaField rows={3} value={form.excerpt} onChange={set('excerpt')} maxLength={600} hint="Shown on blog cards and search results" />
                </Field>
                <SelectField label="Category" options={lookups.blog_category} value={form.category} onChange={set('category')} />
                <TagInput label="Tags" max={20} value={form.tags || []} onChange={set('tags')} placeholder="Type a tag and press Enter" />
              </Card>
            )}
            <Card title="SEO and sharing" defaultOpen={false}>
              <SearchSnippet kind={kind} form={form} />
              <Field label={<span className="flex w-full justify-between">SEO title <Counter value={form.seo.title} max={60} /></span>}>
                <input value={form.seo.title} onChange={setSeo('title')} placeholder={form.title} className="field-control h-10 w-full px-3 text-sm" aria-label="SEO title" />
              </Field>
              <Field label={<span className="flex w-full justify-between">Meta description <Counter value={form.seo.description} max={160} /></span>}>
                <textarea rows={3} value={form.seo.description} onChange={setSeo('description')} className="field-control w-full px-3 py-2 text-sm" aria-label="Meta description" />
              </Field>
              <TagInput label="Keywords" max={20} value={form.seo.keywords || []} onChange={setSeo('keywords')} />
              <TextField label="Share image URL" value={form.seo.ogImage} onChange={setSeo('ogImage')} hint={kind === 'blog' ? 'Leave empty to use the cover image' : 'Shown when the link is shared on WhatsApp or social media'} />
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
};

export default ContentEditor;
