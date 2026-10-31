import React, { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Button from '../ui/Button';
import { DataTable, PageHeader, Pagination, SearchInput, SimpleSelect, Tabs } from '../ui/data';
import { ConfirmDialog, Drawer, EmptyState, Icon } from '../ui/feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '../ui/form';
import { useAction, useDocumentTitle, useUrlFilters } from '../../hooks/useData';
import useDebounce from '../../hooks/useDebounce';
import { adminApi } from '../../services';
import { TIMESPAN_OPTIONS, toInputDate, toInputDateTime } from '../../utils/format';

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

/** Reads a field's form value out of a record. */
function initialValue(field, row) {
  const v = get(row || {}, field.from || field.key);
  if (field.type === 'checkbox') return v ?? field.default ?? false;
  if (field.type === 'list') return (v || []).join(', ');
  if (field.type === 'date') return toInputDate(v);
  if (field.type === 'datetime') return toInputDateTime(v);
  return v ?? field.default ?? '';
}

function toBody(fields, values) {
  let body = {};
  for (const f of fields) {
    let v = values[f.key];
    if (f.type === 'list') v = String(v).split(',').map((x) => x.trim()).filter(Boolean);
    else if (f.type === 'number') v = v === '' ? undefined : Number(v);
    else if (f.type === 'datetime' && v) v = new Date(v).toISOString();
    else if (v === '') v = undefined;
    if (v !== undefined) body = setPath(body, f.key, v);
  }
  return body;
}

const FieldInput = ({ field, value, onChange, error }) => {
  const common = { label: field.label, required: field.required, hint: field.hint, error };
  const change = (e) => onChange(e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  switch (field.type) {
    case 'textarea':
    case 'html':
      return <TextAreaField {...common} rows={field.rows || (field.type === 'html' ? 12 : 3)} value={value} onChange={change} />;
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

export const RecordForm = ({ title, fields, row, onSubmit, onClose, invalidate, success = 'Saved' }) => {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.key, initialValue(f, row)])));
  const [errors, setErrors] = useState({});
  const save = useAction(() => onSubmit(toBody(fields, values)), { success, invalidate, onSuccess: onClose, onError: (e) => setErrors(e.fieldErrors || {}) });
  return (
    <Drawer open onClose={onClose} title={title} footer={<Button type="submit" form="record-form" size="sm" variant="primaryBlue" loading={save.isPending}>Save</Button>}>
      <form
        id="record-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {fields.map((f) => (
          <FieldInput key={f.key} field={f} value={values[f.key]} error={errors[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
        ))}
      </form>
    </Drawer>
  );
};

/**
 * Config-driven admin list. config: { title, subtitle, path, columns, tabs, filters, search, timespan,
 * bulk: { path, actions }, exportPath, importPath, createFields, editFields, rowActions(row, helpers), params }
 */
const ResourcePage = ({ config }) => {
  const { title, subtitle, path: rawPath, columns, tabs, filters: filterDefs = [], search = true, timespan = true, bulk, exportPath, importPath, createFields, editFields, rowActions, onRowClick, params: fixed, remove, headerActions } = config;
  useDocumentTitle(title);
  const [path] = rawPath.split('?');
  const key = ['admin', path];
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const [q, setQ] = useState(filters.q || '');
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const fileRef = useRef(null);
  const debounced = useDebounce(q, 400);
  useEffect(() => {
    if (debounced !== (filters.q || '')) setFilters({ q: debounced });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = { limit: 20, ...fixed, ...filters };
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
    const { page: _p, ...rest } = filters;
    return adminApi.download(exportPath, rest, `${title.toLowerCase()}.xlsx`);
  }, { success: 'Export downloaded' });
  const doImport = useAction((file) => adminApi.upload(importPath, { file }), { ...inv, success: 'Import finished' });
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
                    if (e.target.files?.[0]) doImport.mutate(e.target.files[0]);
                    e.target.value = '';
                  }}
                />
                <Button size="sm" variant="outline" loading={doImport.isPending} onClick={() => fileRef.current?.click()}>
                  Import
                </Button>
              </>
            )}
            {exportPath && (
              <Button size="sm" variant="outline" loading={doExport.isPending} onClick={() => doExport.mutate()}>
                Export
              </Button>
            )}
            {createFields && (
              <Button size="sm" variant="primary" onClick={() => setEditing({})}>
                Add new
              </Button>
            )}
          </>
        }
      />
      {tabs && <Tabs className="mb-4" value={filters[tabs.key] || ''} onChange={(v) => setFilters({ [tabs.key]: v })} tabs={tabs.options} />}
      <div className="mb-4 flex flex-wrap gap-2">
        {search && <SearchInput className="min-w-[220px] flex-1" value={q} onChange={setQ} placeholder="Search" />}
        {filterDefs.map((f) => (
          <SimpleSelect key={f.key} ariaLabel={f.label} value={filters[f.key]} onChange={(v) => setFilters({ [f.key]: v })} placeholder={f.label} options={f.options} />
        ))}
        {timespan && <SimpleSelect ariaLabel="Time range" value={filters.timespan} onChange={(v) => setFilters({ timespan: v })} placeholder="All time" options={TIMESPAN_OPTIONS} />}
      </div>
      {selected.length > 0 && bulk && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-blue-tint p-2.5 text-sm">
          <b>{selected.length} selected</b>
          {bulk.actions.map((a) => (
            <Button key={a.action} size="sm" variant={a.danger ? 'danger' : 'outline'} onClick={() => setConfirm({ bulk: a })}>
              {a.label}
            </Button>
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
        onRowClick={onRowClick}
        empty={<EmptyState title={`No ${title.toLowerCase()} found`} />}
        actions={
          rowActions || editFields || remove
            ? (row) => (
                <span className="inline-flex flex-wrap justify-end gap-1">
                  {rowActions?.(row, helpers)}
                  {editFields && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                      Edit
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
      <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} />
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
