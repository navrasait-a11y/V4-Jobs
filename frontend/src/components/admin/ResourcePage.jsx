import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Button from '../ui/Button';
import { DataTable, PageHeader, Pagination, SearchInput, SimpleSelect, Tabs } from '../ui/data';
import { ConfirmDialog, Drawer, EmptyState, Icon, Modal } from '../ui/feedback';
import { CheckboxField, ChoiceChips, Field, SelectField, TextAreaField, TextField } from '../ui/form';
import { MediaField } from './AdminActions';
import RichTextEditor from './LazyRichTextEditor';
import TimeRange, { rangeParams } from './TimeRange';
import { useAction, useDocumentTitle, useLookups, useUrlFilters } from '../../hooks/useData';
import useDebounce from '../../hooks/useDebounce';
import { adminApi } from '../../services';
import { toInputDate, toInputDateTime } from '../../utils/format';

const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
const setPath = (obj, path, value) => {
  const keys = path.split('.');
  const next = { ...obj };
  let cur = next;
  keys.slice(0, -1).forEach((k) => {
    cur[k] = { ...cur[k] };
    cur = cur[k];
  });
  cur[keys[keys.length - 1]] = value;
  return next;
};

const IMPORT_MODES = [
  { value: 'create', label: 'Add new only', hint: 'Skips rows whose mobile or e-mail already exists.' },
  { value: 'update', label: 'Add new and rewrite / update previous data', hint: 'Updates earlier Excel-imported users matched by mobile or e-mail.' },
  { value: 'replace', label: 'Delete previous imported data, then add', hint: 'Removes earlier Excel-imported users who never logged in.' },
];

/** PRD bulk Excel upload: choose the mode and run a duplicate check (mobile / e-mail) before importing. */
const ImportModal = ({ state, setState, path, onDone }) => {
  const check = useAction(() => adminApi.upload(path, { file: state.file }, { mode: state.mode, dryRun: true }), { silent: true, onSuccess: (r) => setState((s) => ({ ...s, check: r })) });
  const run = useAction(() => adminApi.upload(path, { file: state.file }, { mode: state.mode }), {
    success: (r) => `Import finished: ${r.created || 0} added, ${r.updated || 0} updated, ${r.skipped || 0} skipped${r.errors?.length ? `, ${r.errors.length} errors` : ''}`,
    onSuccess: onDone,
  });
  const c = state.check;
  return (
    <Modal
      open
      onClose={() => setState(null)}
      title="Import from Excel"
      subtitle={state.file.name}
      footer={
        <>
          <Button size="sm" variant="outline" loading={check.isPending} onClick={() => check.mutate()}>
            Check duplicates
          </Button>
          <Button size="sm" variant={state.mode === 'replace' ? 'danger' : 'primaryBlue'} loading={run.isPending} onClick={() => run.mutate()}>
            Import
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {IMPORT_MODES.map((m) => (
          <label key={m.value} className="flex cursor-pointer items-start gap-2 rounded-lg border border-brand-border p-3 text-sm">
            <input type="radio" name="import-mode" checked={state.mode === m.value} onChange={() => setState((s) => ({ ...s, mode: m.value }))} className="mt-0.5" />
            <span>
              <span className="block font-medium text-brand-dark">{m.label}</span>
              <span className="text-xs text-brand-gray-muted">{m.hint}</span>
            </span>
          </label>
        ))}
        {c && (
          <div className="rounded-lg bg-brand-tint p-3 text-sm text-brand-dark">
            <p>
              <b>{c.total}</b> rows · <b>{c.duplicatesInFile?.length || 0}</b> duplicates inside the file · <b>{c.existingInDatabase?.length || 0}</b> already in the database
            </p>
            {(c.duplicatesInFile || []).slice(0, 5).map((d) => (
              <p key={`f${d.row}`} className="text-xs text-brand-gray">
                Row {d.row} repeats row {d.duplicateOf} ({d.value})
              </p>
            ))}
            {(c.existingInDatabase || []).slice(0, 5).map((d) => (
              <p key={`d${d.row}`} className="text-xs text-brand-gray">
                Row {d.row} exists: {d.mobile || d.email}
              </p>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

/** Bulk action that needs a value: add / remove a label, set a situation tag. */
const BulkPicker = ({ picker, onPick, disabled }) => {
  const lookups = useLookups(...(picker.lookup ? [picker.lookup] : []));
  const options = picker.lookup ? lookups[picker.lookup] || [] : picker.options;
  return (
    <SimpleSelect
      ariaLabel={picker.label}
      placeholder={picker.label}
      value=""
      onChange={(v) => v && !disabled && onPick(v)}
      options={options}
      className="min-w-[150px] bg-white"
    />
  );
};

/** Reads a field's form value out of a record. */
function initialValue(field, row) {
  const v = get(row || {}, field.from || field.key);
  if (field.type === 'checkbox') return v ?? field.default ?? false;
  if (field.type === 'list') return (v || []).join(', ');
  if (field.type === 'multi') return v || field.default || [];
  if (field.type === 'media') return v || null;
  if (field.type === 'date') return toInputDate(v);
  if (field.type === 'datetime') return toInputDateTime(v);
  return v ?? field.default ?? '';
}

function toBody(fields, values) {
  let body = {};
  for (const f of fields) {
    if (!f.key) continue; // headings
    let v = values[f.key];
    if (f.type === 'list') v = String(v).split(',').map((x) => x.trim()).filter(Boolean);
    else if (f.type === 'number') v = v === '' ? undefined : Number(v);
    else if (f.type === 'datetime' && v) v = new Date(v).toISOString();
    else if (f.type === 'media' && !v) v = undefined;
    else if (v === '') v = undefined;
    if (v !== undefined) body = setPath(body, f.key, v);
  }
  return body;
}

/** Select whose options come from admin master data (field.lookup). */
const LookupSelect = ({ field, value, onChange, common }) => {
  const lookups = useLookups(field.lookup);
  return <SelectField {...common} options={lookups[field.lookup] || []} value={value} onChange={(e) => onChange(e.target.value)} />;
};

const FieldInput = ({ field, value, onChange, error }) => {
  const common = { label: field.label, required: field.required, hint: field.hint, error };
  const change = (e) => onChange(e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  switch (field.type) {
    case 'heading':
      return <p className="border-t border-brand-border pt-4 text-sm font-bold text-brand-dark">{field.label}</p>;
    case 'media':
      return <MediaField label={field.label} value={value} onChange={onChange} />;
    case 'multi':
      return (
        <Field {...common}>
          <ChoiceChips multiple options={field.options} value={value || []} onChange={onChange} />
        </Field>
      );
    case 'lookup':
      return <LookupSelect field={field} value={value} onChange={onChange} common={common} />;
    case 'textarea':
      return <TextAreaField {...common} rows={field.rows || 3} value={value} onChange={change} />;
    case 'html':
      return <HtmlField common={common} value={value} onChange={onChange} field={field} />;
    case 'select':
      return <SelectField {...common} options={field.options} value={value} onChange={change} />;
    case 'checkbox':
      return <CheckboxField label={field.label} checked={Boolean(value)} onChange={change} />;
    case 'number':
      return <TextField {...common} type="number" value={value} onChange={change} />;
    case 'date':
      return <TextField {...common} type="date" value={value} onChange={change} />;
    case 'datetime':
      return <TextField {...common} type="datetime-local" value={value} onChange={change} />;
    case 'list':
      return <TextField {...common} hint={field.hint || 'Comma separated'} value={value} onChange={change} />;
    default:
      return <TextField {...common} type={field.inputType || 'text'} value={value} onChange={change} />;
  }
};

/** Visual editor with a live preview tab (HTML stays available inside the editor for advanced edits). */
const HtmlField = ({ common, value, onChange, field }) => {
  const [preview, setPreview] = useState(false);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-brand-dark">
          {common.label}
          {common.required && <span className="text-brand-red"> *</span>}
        </span>
        <button type="button" onClick={() => setPreview((p) => !p)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue">
          <Icon name={preview ? 'edit' : 'visibility'} size={15} /> {preview ? 'Back to editor' : 'Preview'}
        </button>
      </div>
      {preview ? (
        <div className="prose-content max-h-[460px] overflow-y-auto rounded-lg border border-brand-border bg-white p-4" dangerouslySetInnerHTML={{ __html: value || '<p>Nothing to preview yet</p>' }} />
      ) : (
        <RichTextEditor value={value} onChange={onChange} compact={!field.full} variables={field.variables || []} minHeight={field.rows ? field.rows * 24 : 240} error={common.error} hint={common.hint} placeholder={field.placeholder} />
      )}
    </div>
  );
};

export const RecordForm = ({ title, fields, row, onSubmit, onClose, invalidate, success = 'Saved' }) => {
  const [values, setValues] = useState(() => Object.fromEntries(fields.filter((f) => f.key).map((f) => [f.key, initialValue(f, row)])));
  const [errors, setErrors] = useState({});
  const save = useAction(() => onSubmit(toBody(fields, values)), { success, invalidate, onSuccess: onClose, onError: (e) => setErrors(e.fieldErrors || {}) });
  return (
    <Drawer open onClose={onClose} title={title} width="max-w-2xl" footer={<Button type="submit" form="record-form" size="sm" variant="primaryBlue" loading={save.isPending}>Save</Button>}>
      <form
        id="record-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {fields.map((f, i) => (
          <FieldInput key={f.key || `heading-${i}`} field={f} value={values[f.key]} error={errors[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
        ))}
      </form>
    </Drawer>
  );
};

/**
 * Config-driven admin list. config: { title, subtitle, path, columns, tabs, filters, search, timespan,
 * bulk: { path, actions }, exportPath, importPath, createFields, editFields, rowActions(row, helpers), params }
 */
/**
 * Count tiles above a list ("All 120 · Active 96 · Pending 4 ..."). Clicking one filters the list.
 * stats: { path, pick(data, filters), tiles: [{ key, label, filter }] } - `filter` is the list
 * filter the tile stands for; the tile with an empty filter is "All".
 */
const StatTiles = ({ stats, filters, setFilters }) => {
  const range = rangeParams(filters);
  const query = useQuery({ queryKey: ['admin', 'stats', stats.path, range], queryFn: () => adminApi.get(stats.path, range), placeholderData: keepPreviousData });
  const data = stats.pick ? stats.pick(query.data || {}, filters) : query.data;
  const keys = [...new Set(stats.tiles.flatMap((t) => Object.keys(t.filter || {})))];
  const isActive = (tile) => keys.every((k) => (filters[k] || '') === (tile.filter?.[k] || ''));
  return (
    <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Quick filters">
      {stats.tiles.map((tile) => {
        const active = isActive(tile);
        const count = get(data || {}, tile.key);
        return (
          <button
            key={tile.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setFilters({ ...Object.fromEntries(keys.map((k) => [k, ''])), ...tile.filter })}
            className={clsx('shrink-0 rounded-xl border px-3.5 py-2 text-left transition-colors', active ? 'border-brand-blue bg-brand-blue-tint' : 'border-brand-border bg-white hover:border-brand-blue')}
          >
            <span className={clsx('block text-lg font-bold leading-6', active ? 'text-brand-blue' : 'text-brand-dark')}>{count === undefined ? '–' : Number(count).toLocaleString('en-IN')}</span>
            <span className="block whitespace-nowrap text-xs font-medium text-brand-gray">{tile.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const ResourcePage = ({ config }) => {
  const { title, subtitle, path: rawPath, columns, tabs, stats, filters: filterDefs = [], search = true, searchPlaceholder = 'Search by name, e-mail, mobile or ID', timespan = true, bulk, exportPath, downloads = [], importPath, importModes, createFields, createLink, editFields, editLabel = 'Edit', rowActions, onRowClick, rowLink, params: fixed, remove, headerActions } = config;
  const navigate = useNavigate();
  useDocumentTitle(title);
  const [path] = rawPath.split('?');
  const key = ['admin', path];
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const [q, setQ] = useState(filters.q || '');
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  // Deep link from the dashboard quick actions: ?create=1 opens the create form.
  useEffect(() => {
    if (filters.create && createLink) navigate(createLink);
    else if (filters.create && createFields) {
      setEditing({});
      setFilters({ create: '' });
    }
  }, [filters.create]); // eslint-disable-line react-hooks/exhaustive-deps
  const [confirm, setConfirm] = useState(null);
  const fileRef = useRef(null);
  const debounced = useDebounce(q, 400);
  useEffect(() => {
    if (debounced !== (filters.q || '')) setFilters({ q: debounced });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const { create: _create, timespan: _t, from: _f, to: _to, ...plainFilters } = filters;
  // Custom dates travel in the URL as yyyy-mm-dd and go to the API as whole-day ISO bounds.
  const listFilters = { ...plainFilters, ...rangeParams(filters) };
  const params = { limit: 20, ...fixed, ...listFilters };
  const activeFilters = Object.entries({ ...plainFilters, timespan: filters.timespan }).filter(([k, v]) => !['page', 'limit', 'sort'].includes(k) && v !== '' && v !== undefined).length;
  const query = useQuery({ queryKey: [...key, params], queryFn: () => adminApi.list(path, params), placeholderData: keepPreviousData });
  const inv = { invalidate: ['admin'] };
  const runBulk = useAction(({ action, value }) => adminApi.post(bulk.path, { ids: selected, action, value }), {
    ...inv,
    success: 'Done',
    onSuccess: () => {
      setSelected([]);
      setConfirm(null);
    },
  });
  const del = useAction((id) => adminApi.del(`${path}/${id}`), { ...inv, success: 'Deleted', onSuccess: () => setConfirm(null) });
  const doExport = useAction(() => {
    const { page: _p, limit: _l, ...rest } = listFilters;
    return adminApi.download(exportPath, rest, `${title.toLowerCase()}.xlsx`);
  }, { success: 'Export downloaded' });
  // Extra downloads (resume ZIPs ...): `selection` ones post the ticked rows, the rest follow the list filters.
  const doDownload = useAction(
    (d) => {
      const { page: _p, limit: _l, ...rest } = listFilters;
      return d.selection ? adminApi.downloadPost(d.path, { ids: selected }, d.name) : adminApi.download(d.path, { ...fixed, ...rest }, d.name);
    },
    { success: 'Download started' },
  );
  const [importing, setImporting] = useState(null); // modes: { file, mode, check }
  const doImport = useAction((file) => adminApi.upload(importPath, { file }), { ...inv, success: (r) => `Import finished${r?.created !== undefined ? `: ${r.created} added, ${r.updated || 0} updated, ${r.skipped || 0} skipped` : ''}` });
  const helpers = { edit: setEditing, confirm: setConfirm, refresh: () => query.refetch() };

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={query.data?.meta?.total !== undefined ? `${query.data.meta.total.toLocaleString('en-IN')} records${subtitle ? ` · ${subtitle}` : ''}` : subtitle}
        actions={
          <>
            {headerActions}
            {importPath && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      if (importModes) setImporting({ file: e.target.files[0], mode: 'create', check: null });
                      else doImport.mutate(e.target.files[0]);
                    }
                    e.target.value = '';
                  }}
                />
                <Button size="sm" variant="outline" leftIcon={<Icon name="upload" size={16} />} loading={doImport.isPending} onClick={() => fileRef.current?.click()}>
                  Import
                </Button>
              </>
            )}
            {exportPath && (
              <Button size="sm" variant="outline" leftIcon={<Icon name="download" size={16} />} loading={doExport.isPending} onClick={() => doExport.mutate()}>
                Export
              </Button>
            )}
            {downloads
              .filter((d) => !d.selection)
              .map((d) => (
                <Button key={d.path} size="sm" variant="outline" leftIcon={<Icon name={d.icon || 'folder_zip'} size={16} />} loading={doDownload.isPending && doDownload.variables === d} onClick={() => doDownload.mutate(d)}>
                  {d.label}
                </Button>
              ))}
            {(createFields || createLink) && (
              <Button size="sm" variant="primary" leftIcon={<Icon name="add" size={16} />} onClick={() => (createLink ? navigate(createLink) : setEditing({}))}>
                Add new
              </Button>
            )}
          </>
        }
      />
      {stats && <StatTiles stats={stats} filters={filters} setFilters={setFilters} />}
      {tabs && <Tabs className="mb-4" value={filters[tabs.key] || ''} onChange={(v) => setFilters({ [tabs.key]: v })} tabs={tabs.options} />}
      {(search || filterDefs.length > 0 || timespan) && (
        <div className="surface mb-4 flex flex-wrap items-center gap-2 p-3">
          {search && <SearchInput className="min-w-[220px] flex-1" value={q} onChange={setQ} placeholder={searchPlaceholder} />}
          {filterDefs.map((f) => (
            <SimpleSelect key={f.key} ariaLabel={f.label} value={filters[f.key]} onChange={(v) => setFilters({ [f.key]: v })} placeholder={f.label} options={f.options} className={filters[f.key] ? 'ring-1 ring-brand-blue rounded-lg' : ''} />
          ))}
          {timespan && <TimeRange value={filters} onChange={(r) => setFilters(r)} />}
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                setFilters(Object.fromEntries([...Object.keys(plainFilters), 'timespan', 'from', 'to'].map((k) => [k, ''])));
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-blue hover:bg-brand-blue-tint"
            >
              <Icon name="filter_alt_off" size={16} /> Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}
      {selected.length > 0 && bulk && (
        <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue-tint p-2.5 text-sm shadow-sm">
          <b>{selected.length} selected</b>
          <button type="button" onClick={() => setSelected([])} className="text-xs font-semibold text-brand-blue underline">
            Clear
          </button>
          {bulk.actions.map((a) => (
            <Button key={a.action} size="sm" variant={a.danger ? 'danger' : 'outline'} onClick={() => setConfirm({ bulk: a })}>
              {a.label}
            </Button>
          ))}
          {downloads
            .filter((d) => d.selection)
            .map((d) => (
              <Button key={d.path} size="sm" variant="outline" leftIcon={<Icon name={d.icon || 'folder_zip'} size={16} />} disabled={selected.length > (d.max || 500)} loading={doDownload.isPending && doDownload.variables === d} onClick={() => doDownload.mutate(d)}>
                {d.label}
              </Button>
            ))}
          {bulk.custom?.({ selected, clear: () => setSelected([]) })}
          {(bulk.pickers || []).map((p) => (
            <BulkPicker key={p.action} picker={p} disabled={runBulk.isPending} onPick={(value) => runBulk.mutate({ action: p.action, value })} />
          ))}
        </div>
      )}
      <DataTable
        columns={columns}
        rows={query.data?.data}
        query={query}
        selectable={Boolean(bulk)}
        selected={selected}
        onSelect={setSelected}
        onRowClick={onRowClick || (rowLink ? (r) => navigate(rowLink(r)) : undefined)}
        empty={<EmptyState title={`No ${title.toLowerCase()} found`} />}
        actions={
          rowActions || editFields || remove
            ? (row) => (
                <span className="inline-flex flex-wrap items-center justify-end gap-1 md:flex-nowrap">
                  {rowActions?.(row, helpers)}
                  {editFields && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                      {editLabel}
                    </Button>
                  )}
                  {remove && (
                    <button aria-label="Delete" onClick={() => setConfirm({ remove: row })} className="p-1 text-brand-gray-muted hover:text-brand-red">
                      <Icon name="delete" size={18} />
                    </button>
                  )}
                </span>
              )
            : undefined
        }
      />
      <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} limit={filters.limit} onLimit={(limit) => setFilters({ limit })} />
      {editing && (
        <RecordForm
          title={editing._id ? `Edit ${title}` : `Add ${title}`}
          fields={editing._id ? editFields : createFields}
          row={editing}
          invalidate={['admin']}
          onClose={() => setEditing(null)}
          onSubmit={(body) => (editing._id ? adminApi.patch(`${path}/${editing._id}`, body) : adminApi.post(path, body))}
        />
      )}
      {importing && <ImportModal state={importing} setState={setImporting} path={importPath} onDone={() => { setImporting(null); query.refetch(); }} />}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.bulk ? `${confirm.bulk.label} ${selected.length} records?` : 'Delete this record?'}
        message="This action is recorded in the audit log."
        danger={Boolean(confirm?.remove || confirm?.bulk?.danger)}
        confirmLabel={confirm?.bulk?.label || 'Delete'}
        loading={runBulk.isPending || del.isPending}
        onConfirm={() => (confirm.bulk ? runBulk.mutate({ action: confirm.bulk.action }) : del.mutate(confirm.remove._id))}
      />
    </div>
  );
};

export default ResourcePage;
