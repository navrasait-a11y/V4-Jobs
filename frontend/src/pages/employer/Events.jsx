import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ShareMenu from '../../components/common/ShareMenu';
import Button from '../../components/ui/Button';
import { DataTable, PageHeader, Pagination, StatusBadge } from '../../components/ui/data';
import { ConfirmDialog, Drawer, EmptyState, Modal } from '../../components/ui/feedback';
import { Field, ChoiceChips, SelectField, TextAreaField, TextField } from '../../components/ui/form';
import { useAction, useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import { employerEventApi, employerJobApi } from '../../services';
import { formatDateTime, toInputDateTime, titleCase } from '../../utils/format';

const EventForm = ({ event, onClose }) => {
  const [form, setForm] = useState({
    title: event?.title || '',
    description: event?.description || '',
    mode: event?.mode || 'walk_in',
    address: event?.venue?.address || '',
    city: event?.venue?.city || '',
    state: event?.venue?.state || '',
    meetingLink: event?.meetingLink || '',
    startAt: toInputDateTime(event?.startAt),
    endAt: toInputDateTime(event?.endAt),
    jobs: (event?.jobs || []).map((j) => j._id || j),
    status: event?.status || 'draft',
  });
  const [banner, setBanner] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const jobs = useQuery({ queryKey: ['employer-jobs', 'options'], queryFn: () => employerJobApi.list({ limit: 200, status: 'active' }) });
  const save = useAction(
    async () => {
      const { address, city, state, startAt, endAt, meetingLink, ...rest } = form;
      const body = { ...rest, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), venue: { address, city, state }, ...(meetingLink ? { meetingLink } : {}) };
      const saved = event ? await employerEventApi.update(event._id, body) : await employerEventApi.create(body);
      if (banner) await employerEventApi.banner(saved._id, banner);
      return saved;
    },
    { success: 'Event saved', invalidate: ['employer-events'], onSuccess: onClose },
  );
  return (
    <Modal open onClose={onClose} title={event ? 'Edit event' : 'New job event'} size="lg" footer={<Button type="submit" form="event-form" size="sm" variant="primaryBlue" loading={save.isPending}>Save</Button>}>
      <form
        id="event-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextField label="Title" required value={form.title} onChange={set('title')} />
        <TextAreaField label="Description" rows={3} value={form.description} onChange={set('description')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Mode" placeholder={null} options={[{ value: 'walk_in', label: 'Walk-in' }, { value: 'virtual', label: 'Virtual' }, { value: 'hybrid', label: 'Hybrid' }]} value={form.mode} onChange={set('mode')} />
          <SelectField label="Status" placeholder={null} options={['draft', 'published', 'closed', 'cancelled'].map((s) => ({ value: s, label: titleCase(s) }))} value={form.status} onChange={set('status')} />
          <TextField label="Starts" type="datetime-local" required value={form.startAt} onChange={set('startAt')} />
          <TextField label="Ends" type="datetime-local" required value={form.endAt} onChange={set('endAt')} />
          {form.mode !== 'virtual' && (
            <>
              <TextField label="Venue address" className="sm:col-span-2" value={form.address} onChange={set('address')} />
              <TextField label="City" value={form.city} onChange={set('city')} />
              <TextField label="State" value={form.state} onChange={set('state')} />
            </>
          )}
          {form.mode !== 'walk_in' && <TextField label="Meeting link" type="url" className="sm:col-span-2" value={form.meetingLink} onChange={set('meetingLink')} />}
        </div>
        <Field label="Jobs at this event">
          <ChoiceChips multiple options={(jobs.data?.data || []).map((j) => ({ value: j._id, label: j.title }))} value={form.jobs} onChange={set('jobs')} />
        </Field>
        <Field label="Banner image">
          <input type="file" accept="image/*" onChange={(e) => setBanner(e.target.files?.[0] || null)} className="text-sm" />
        </Field>
      </form>
    </Modal>
  );
};

const ApplicantsDrawer = ({ event, onClose }) => {
  const query = useQuery({ queryKey: ['event-applications', event._id], queryFn: () => employerEventApi.applications(event._id, { limit: 100 }) });
  return (
    <Drawer open onClose={onClose} title={event.title} subtitle="Applicants">
      {query.data && !query.data.data.length && <p className="text-sm text-brand-gray">No applicants yet.</p>}
      <ul className="divide-y divide-brand-border">
        {query.data?.data.map((a) => (
          <li key={a._id} className="py-2 text-sm text-brand-dark">
            {a.snapshot?.fullName} <span className="text-xs text-brand-gray-muted">· {a.job?.title}</span>
          </li>
        ))}
      </ul>
    </Drawer>
  );
};

const QrModal = ({ event, onClose }) => {
  const { data } = useQuery({ queryKey: ['event-share', event._id], queryFn: () => employerEventApi.share(event._id) });
  return (
    <Modal open onClose={onClose} title="Event QR code" size="sm">
      {data?.qrCode && <img src={data.qrCode} alt="Event QR code" className="mx-auto h-52 w-52" />}
      {data?.link && <p className="mt-2 break-all text-center text-xs text-brand-gray">{data.link}</p>}
      {data?.qrCode && (
        <a href={data.qrCode} download={`${event.slug || 'event'}-qr.png`} className="mt-3 block text-center text-sm font-semibold text-brand-blue">
          Download QR
        </a>
      )}
    </Modal>
  );
};

const Events = () => {
  useDocumentTitle('Job events');
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [qr, setQr] = useState(null);
  const [removing, setRemoving] = useState(null);
  const params = { limit: 20, ...filters };
  const query = useQuery({ queryKey: ['employer-events', params], queryFn: () => employerEventApi.list(params) });
  const remove = useAction(employerEventApi.remove, { success: 'Event deleted', invalidate: ['employer-events'], onSuccess: () => setRemoving(null) });
  return (
    <div>
      <PageHeader
        title="Job Events"
        actions={
          <Button size="sm" variant="primary" onClick={() => setEditing({})}>
            New event
          </Button>
        }
      />
      <DataTable
        columns={[
          { key: 'title', header: 'Event' },
          { key: 'mode', header: 'Mode', render: (e) => titleCase(e.mode) },
          { key: 'startAt', header: 'Starts', render: (e) => formatDateTime(e.startAt) },
          { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
        ]}
        rows={query.data?.data}
        query={query}
        empty={<EmptyState icon="celebration" title="No events yet" description="Create a walk-in or virtual hiring drive." />}
        actions={(e) => (
          <span className="inline-flex flex-wrap justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setViewing(e)}>
              Applicants
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setQr(e)}>
              QR
            </Button>
            <ShareMenu className="rounded px-2 text-xs font-semibold text-brand-gray" load={async () => (await employerEventApi.share(e._id)).share} />
            <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
              Edit
            </Button>
            <Button size="sm" variant="dangerGhost" onClick={() => setRemoving(e)}>
              Delete
            </Button>
          </span>
        )}
      />
      <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} />
      {editing && <EventForm event={editing._id ? editing : null} onClose={() => setEditing(null)} />}
      {viewing && <ApplicantsDrawer event={viewing} onClose={() => setViewing(null)} />}
      {qr && <QrModal event={qr} onClose={() => setQr(null)} />}
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} title="Delete event?" message={removing?.title} danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(removing._id)} />
    </div>
  );
};

export default Events;
