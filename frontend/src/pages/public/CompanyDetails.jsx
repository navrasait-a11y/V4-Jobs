import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import CompanyLogo from '../../components/common/CompanyLogo';
import FollowButton from '../../components/common/FollowButton';
import JobCard from '../../components/common/JobCard';
import ReportModal from '../../components/common/ReportModal';
import Button from '../../components/ui/Button';
import { Avatar, Badge, DetailRow, Pagination, Section } from '../../components/ui/data';
import { EmptyState, ErrorState, Icon, Modal, PageLoader } from '../../components/ui/feedback';
import { MobileField, TextAreaField, TextField } from '../../components/ui/form';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { employerPublicApi, jobApi, moderationApi } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import { formatDate, placeLabel, titleCase } from '../../utils/format';

const ContactModal = ({ org, onClose }) => {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState({ name: user?.fullName || '', email: user?.email || '', mobile: user?.mobile || '', subject: '', message: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const send = useAction(() => employerPublicApi.contact(org._id, form), { success: 'Message sent', onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Contact ${org.name}`}
      footer={
        <Button type="submit" form="contact-employer" size="sm" variant="primaryBlue" loading={send.isPending}>
          Send
        </Button>
      }
    >
      <form
        id="contact-employer"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <TextField label="Name" required value={form.name} onChange={set('name')} />
        <TextField label="Email" type="email" required value={form.email} onChange={set('email')} />
        <MobileField value={form.mobile} onChange={set('mobile')} />
        <TextField label="Subject" value={form.subject} onChange={set('subject')} />
        <TextAreaField label="Message" required value={form.message} onChange={set('message')} />
      </form>
    </Modal>
  );
};

const Reviews = ({ orgId }) => {
  const user = useAuthStore((s) => s.user);
  const [body, setBody] = useState('');
  const [rating, setRating] = useState(5);
  const { data } = useQuery({ queryKey: ['org-comments', orgId], queryFn: () => moderationApi.comments('organization', orgId, { limit: 10 }) });
  const post = useAction(() => moderationApi.comment({ targetType: 'organization', targetId: orgId, body, rating }), {
    success: 'Thanks. Your review will appear after approval',
    onSuccess: () => setBody(''),
  });
  const items = data?.data || [];
  if (!items.length && user?.role !== 'candidate') return null;
  return (
    <Section title="Reviews">
      <div className="space-y-3">
        {items.map((c) => (
          <div key={c._id} className="border-b border-brand-border pb-3 last:border-0">
            <p className="flex items-center gap-1 text-xs text-brand-gray-muted">
              {c.rating && (
                <span className="flex items-center gap-0.5 font-semibold text-brand-dark">
                  <Icon name="star" size={14} fill className="text-brand-amber" />
                  {c.rating}
                </span>
              )}
              · {formatDate(c.createdAt)}
            </p>
            <p className="mt-1 text-sm text-brand-gray">{c.body}</p>
          </div>
        ))}
      </div>
      {user?.role === 'candidate' && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            post.mutate();
          }}
        >
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-label={`${n} stars`} onClick={() => setRating(n)}>
                <Icon name="star" size={20} fill={n <= rating} className="text-brand-amber" />
              </button>
            ))}
          </div>
          <TextAreaField rows={2} required placeholder="Share your experience" aria-label="Your review" value={body} onChange={(e) => setBody(e.target.value)} />
          <Button type="submit" size="sm" variant="outline" loading={post.isPending}>
            Post review
          </Button>
        </form>
      )}
    </Section>
  );
};

const CompanyDetails = () => {
  const { id } = useParams();
  const [contactOpen, setContactOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const user = useAuthStore((s) => s.user);
  const query = useQuery({ queryKey: ['employer', id], queryFn: () => employerPublicApi.get(id) });
  const org = query.data?.organization || query.data;
  const blockOrg = useAction(() => moderationApi.block(org._id), { success: 'Employer blocked. Their jobs will be hidden', invalidate: ['blocks'] });
  useDocumentTitle(org?.name);
  const jobs = useQuery({ queryKey: ['employer-jobs', org?._id, page], queryFn: () => jobApi.search({ organization: org._id, page, limit: 10, sort: 'date' }), enabled: Boolean(org?._id) });

  if (query.isPending) return <PageLoader />;
  if (query.isError) return <div className="mx-auto max-w-[800px] p-6"><ErrorState error={query.error} onRetry={query.refetch} /></div>;

  return (
    <div className="min-h-screen bg-brand-tint">
      <div className="relative h-36 w-full overflow-hidden border-b border-brand-border/80 bg-gradient-to-r from-[#EAF3FA] via-[#F2F6FB] to-[#FEF3E8] sm:h-48">
        {org.cover?.url ? (
          <img src={org.cover.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-brand-blue/10 blur-3xl" />
            <div className="absolute -bottom-10 left-1/4 h-52 w-52 rounded-full bg-brand-orange/10 blur-3xl" />
            <div className="absolute inset-0 opacity-[0.035] [background-image:radial-gradient(#0A6CB5_1px,transparent_1px)] [background-size:16px_16px]" />
          </div>
        )}
      </div>
      <div className="relative z-10 mx-auto max-w-[1200px] px-4 pb-10 sm:px-6">
        <div className="-mt-12 surface rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(11,18,32,0.08)] sm:-mt-16 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="shrink-0 rounded-xl border border-brand-border bg-white p-1 shadow-2xs">
              <CompanyLogo name={org.name} src={org.logo?.url} size={72} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-1.5 text-xl font-bold text-brand-dark sm:text-2xl">
                {org.name}
                {org.isVerified && <Icon name="verified" size={20} fill className="text-brand-green" />}
              </h1>
              <p className="mt-0.5 text-sm text-brand-gray">{[org.industries?.[0], org.organizationType, titleCase(org.type || '')].filter(Boolean).join(' · ')}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {org.labels?.map((l) => (
                  <Badge key={l} tone="orange">
                    {titleCase(l)}
                  </Badge>
                ))}
                <Badge tone="blue">{org.activeJobs ?? org.stats?.activeJobs ?? 0} open jobs</Badge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FollowButton organizationId={org._id} />
              <Button size="sm" variant="outline" onClick={() => setContactOpen(true)}>
                Contact
              </Button>
              {user?.role === 'candidate' && (
                <Button size="sm" variant="ghost" onClick={() => blockOrg.mutate()}>
                  Block
                </Button>
              )}
              <button onClick={() => setReportOpen(true)} aria-label="Report employer" className="p-1 text-brand-gray-muted hover:text-brand-red">
                <Icon name="flag" size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-4">
            {org.about && (
              <Section title="About">
                <p className="whitespace-pre-line text-sm leading-relaxed text-brand-gray">{org.about}</p>
              </Section>
            )}
            <div>
              <h2 className="mb-3 font-bold text-brand-dark">Open positions</h2>
              {jobs.data && !jobs.data.data.length && <EmptyState icon="work_off" title="No open positions right now" description="Follow this employer to hear about new jobs." />}
              <div className="space-y-3">
                {jobs.data?.data.map((j) => (
                  <JobCard key={j._id} job={j} />
                ))}
              </div>
              <Pagination meta={jobs.data?.meta} onPage={setPage} />
            </div>
            <Reviews orgId={org._id} />
          </div>
          <aside className="w-full shrink-0 space-y-4 lg:w-80">
            <Section title="Details">
              <dl className="space-y-3">
                <DetailRow label="Employees" value={org.employeeCount} />
                <DetailRow label="Founded" value={org.foundedDate ? formatDate(org.foundedDate, 'yyyy') : null} />
                <DetailRow
                  label="Website"
                  value={
                    org.website && (
                      <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline">
                        {org.website.replace(/^https?:\/\//, '')}
                      </a>
                    )
                  }
                />
              </dl>
            </Section>
            {org.offices?.length > 0 && (
              <Section title="Offices">
                <ul className="space-y-3 text-sm text-brand-gray">
                  {org.offices.map((o) => (
                    <li key={o._id} className="flex gap-2">
                      <Icon name="location_on" size={18} className="text-brand-blue" />
                      <span>
                        <b className="block text-xs text-brand-dark">{o.type}</b>
                        {o.address || placeLabel(o)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {org.socialProfiles?.length > 0 && (
              <Section title="Social">
                <div className="flex flex-wrap gap-2">
                  {org.socialProfiles.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-brand-border px-3 py-1 text-xs text-brand-gray hover:border-brand-blue">
                      <Avatar name={s.platform} size={16} /> {s.platform}
                    </a>
                  ))}
                </div>
              </Section>
            )}
          </aside>
        </div>
      </div>
      {contactOpen && <ContactModal org={org} onClose={() => setContactOpen(false)} />}
      {reportOpen && <ReportModal targetType="organization" targetId={org._id} onClose={() => setReportOpen(false)} />}
    </div>
  );
};

export default CompanyDetails;
