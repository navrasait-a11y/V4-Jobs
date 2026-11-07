import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '../../components/ui/Button';
import { SearchInput, Tabs } from '../../components/ui/data';
import { EmptyState, Icon, Skeleton } from '../../components/ui/feedback';
import { MobileField, TextAreaField, TextField } from '../../components/ui/form';
import { useAction, usePublicSettings } from '../../hooks/useData';
import { cmsApi } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import useSeo from '../../hooks/useSeo';

const Faq = ({ item }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-brand-border last:border-0">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 py-3.5 text-left text-sm font-semibold text-brand-dark">
        {item.question}
        <Icon name={open ? 'expand_less' : 'expand_more'} size={20} className="shrink-0 text-brand-gray-muted" />
      </button>
      {open && <div className="prose-content pb-4" dangerouslySetInnerHTML={{ __html: item.answer }} />}
    </div>
  );
};

const ContactForm = () => {
  const user = useAuthStore((s) => s.user);
  const blank = { name: user?.fullName || '', email: user?.email || '', mobile: user?.mobile || '', subject: '', message: '' };
  const [form, setForm] = useState(blank);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const send = useAction(() => cmsApi.contact({ ...form, mobile: form.mobile || undefined, subject: form.subject || undefined }), { success: 'Message sent. We will get back to you soon', onSuccess: () => setForm(blank) });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Name" required value={form.name} onChange={set('name')} />
        <TextField label="Email" type="email" required value={form.email} onChange={set('email')} />
      </div>
      <MobileField value={form.mobile} onChange={set('mobile')} />
      <TextField label="Subject" value={form.subject} onChange={set('subject')} />
      <TextAreaField label="Message" required value={form.message} onChange={set('message')} />
      <Button type="submit" variant="primaryBlue" loading={send.isPending}>
        Send message
      </Button>
    </form>
  );
};

const HelpCenter = () => {
  const [audience, setAudience] = useState('candidate');
  const [q, setQ] = useState('');
  const settings = usePublicSettings();
  const { data, isPending } = useQuery({ queryKey: ['faqs', audience], queryFn: () => cmsApi.faqs({ audience }) });
  const faqs = (Array.isArray(data) ? data : data?.items || []).filter((f) => f.question.toLowerCase().includes(q.toLowerCase()));
  useSeo({
    title: 'Help centre and FAQs',
    description: 'Answers to common questions about jobs, applications, employer accounts, payments and safety on Freejobwala.',
    path: '/help-center',
    jsonLd: faqs.length
      ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.slice(0, 30).map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: ((html) => String(html || '').replace(/<[^>]+>/g, ' '))(f.answer).slice(0, 1000) } })) }
      : undefined,
  });

  return (
    <div className="bg-brand-tint">
      <div className="bg-brand-ink px-4 py-12 text-center text-white">
        <h1 className="text-2xl font-bold sm:text-3xl">How can we help?</h1>
        <SearchInput className="mx-auto mt-4 max-w-md text-brand-dark" value={q} onChange={setQ} placeholder="Search questions" />
      </div>
      <div className="mx-auto grid max-w-[1100px] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-5">
        <section className="surface p-5 lg:col-span-3">
          <Tabs
            value={audience}
            onChange={setAudience}
            tabs={[
              { value: 'candidate', label: 'For jobseekers' },
              { value: 'employer', label: 'For employers' },
            ]}
          />
          {isPending && <Skeleton className="mt-4 h-40 w-full" />}
          {!isPending && !faqs.length && <EmptyState className="mt-4 border-0" icon="quiz" title="No questions found" />}
          <div className="mt-2">
            {faqs.map((f) => (
              <Faq key={f._id} item={f} />
            ))}
          </div>
        </section>
        <section id="contact" className="scroll-mt-24 surface p-5 lg:col-span-2">
          <h2 className="font-bold text-brand-dark">Contact us</h2>
          <div className="mb-4 mt-1 space-y-1 text-sm text-brand-gray">
            {settings.platform?.supportEmail && <p>{settings.platform.supportEmail}</p>}
            {settings.platform?.supportPhone && <p>{settings.platform.supportPhone}</p>}
          </div>
          <ContactForm />
        </section>
      </div>
    </div>
  );
};

export default HelpCenter;
