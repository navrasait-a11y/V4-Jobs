import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Button from '../../components/ui/Button';
import { PageHeader, Section, StatTile, Tabs } from '../../components/ui/data';
import { CardSkeleton, Drawer, EmptyState, ErrorState, Icon, Modal } from '../../components/ui/feedback';
import { TextField } from '../../components/ui/form';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { talentApi } from '../../services';
import { timeAgo, titleCase } from '../../utils/format';

const Searches = () => {
  const [tab, setTab] = useState('mine');
  const query = useQuery({ queryKey: ['saved-searches', tab], queryFn: () => talentApi.searches({ tab, limit: 100 }) });
  const remove = useAction(talentApi.removeSearch, { success: 'Search deleted', invalidate: ['saved-searches'] });
  return (
    <>
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'mine', label: 'My searches' },
          { value: 'shared', label: 'Shared with me' },
        ]}
      />
      {query.isPending && <CardSkeleton count={2} />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && !query.data.data.length && <EmptyState icon="bookmarks" title="No saved searches" description="Save a search from the candidate search page." />}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {query.data?.data.map((s) => (
          <div key={s._id} className="flex items-center justify-between gap-2 surface p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold text-brand-dark">{s.name}</p>
              <p className="text-xs text-brand-gray-muted">Updated {timeAgo(s.updatedAt)}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button asChild size="sm" variant="outline">
                <Link to={`/employer/candidates?search=${s._id}`}>Run</Link>
              </Button>
              <Button size="sm" variant="dangerGhost" onClick={() => remove.mutate(s._id)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

const FolderDrawer = ({ folder, onClose }) => {
  const query = useQuery({
    queryKey: ['folder', folder.key || folder._id],
    queryFn: () => (folder.key ? talentApi.systemFolder(folder.key, { limit: 100 }) : talentApi.folder(folder._id, { limit: 100 })),
  });
  const removeFrom = useAction((id) => talentApi.removeFromFolder(folder._id, [id]), { invalidate: ['folder', 'folders'] });
  return (
    <Drawer open onClose={onClose} title={folder.name}>
      {query.isPending && <CardSkeleton count={2} />}
      {query.data && !query.data.data.length && <p className="text-sm text-brand-gray">No candidates here.</p>}
      <ul className="divide-y divide-brand-border">
        {query.data?.data.map((c) => {
          const id = c.candidateId || c._id;
          return (
            <li key={id} className="flex items-center justify-between gap-2 py-2.5">
              <Link to={`/employer/candidates/${id}`} className="truncate text-sm font-medium text-brand-dark hover:text-brand-blue">
                {c.name || c.fullName}
              </Link>
              {!folder.key && (
                <button aria-label="Remove from folder" onClick={() => removeFrom.mutate(id)} className="text-brand-gray-muted hover:text-brand-red">
                  <Icon name="close" size={16} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Drawer>
  );
};

const Folders = () => {
  const query = useQuery({ queryKey: ['folders'], queryFn: () => talentApi.folders({ tab: 'all' }) });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [open, setOpen] = useState(null);
  const create = useAction(() => talentApi.addFolder({ name }), {
    success: 'Folder created',
    invalidate: ['folders'],
    onSuccess: () => {
      setCreating(false);
      setName('');
    },
  });
  const remove = useAction(talentApi.removeFolder, { success: 'Folder deleted', invalidate: ['folders'] });
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Object.entries(query.data?.system || {}).map(([key, count]) => (
          <button key={key} onClick={() => setOpen({ key, name: titleCase(key) })} className="text-left">
            <StatTile icon="folder_special" label={titleCase(key)} value={count} />
          </button>
        ))}
      </div>
      <Section
        title="My folders"
        actions={
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            New folder
          </Button>
        }
      >
        {!query.data?.folders?.length && <p className="text-sm text-brand-gray">No folders yet.</p>}
        <ul className="divide-y divide-brand-border">
          {query.data?.folders?.map((f) => (
            <li key={f._id} className="flex items-center justify-between gap-2 py-2.5">
              <button onClick={() => setOpen(f)} className="flex items-center gap-2 text-sm font-medium text-brand-dark hover:text-brand-blue">
                <Icon name="folder" size={18} /> {f.name} <span className="text-xs text-brand-gray-muted">({f.count || 0})</span>
              </button>
              <Button size="sm" variant="dangerGhost" onClick={() => remove.mutate(f._id)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </Section>
      {open && <FolderDrawer folder={open} onClose={() => setOpen(null)} />}
      <Modal open={creating} onClose={() => setCreating(false)} title="New folder" size="sm" footer={<Button size="sm" variant="primaryBlue" disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>Create</Button>}>
        <TextField label="Folder name" value={name} onChange={(e) => setName(e.target.value)} />
      </Modal>
    </div>
  );
};

const SavedSearches = () => {
  useDocumentTitle('Saved searches');
  const [tab, setTab] = useState('searches');
  return (
    <div>
      <PageHeader title="Saved Searches & Folders" />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'searches', label: 'Saved searches' },
          { value: 'folders', label: 'Folders' },
        ]}
      />
      {tab === 'searches' ? <Searches /> : <Folders />}
    </div>
  );
};

export default SavedSearches;
