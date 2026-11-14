import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import Button from "../ui/Button";
import { Alert, Icon, Modal, Skeleton } from "../ui/feedback";
import { FileDropzone } from "../ui/form";

const ACCEPT = ".xlsx,.csv";
const MAX_MB = 20;
const extOf = (name = "") =>
  (name.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
const sizeLabel = (b) =>
  b >= 1024 * 1024
    ? `${(b / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;

const REQUIRED_BADGE = {
  true: { label: "Required", className: "bg-red-50 text-red-700" },
  either: { label: "One of", className: "bg-brand-amber-tint text-[#92400E]" },
  false: { label: "Optional", className: "bg-brand-tint text-brand-gray" },
};

/** Column-by-column format guide built from the same spec as the downloadable sample. */
const FormatGuide = ({ spec }) => {
  const required = spec.columns
    .filter((c) => c.required === true)
    .map((c) => c.header);
  const either = spec.columns
    .filter((c) => c.required === "either")
    .map((c) => c.header);
  return (
    <details className="group rounded-xl border border-brand-border" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-brand-dark [&::-webkit-details-marker]:hidden">
        <span>
          Column guide
          <span className="ml-2 text-xs font-normal text-brand-gray-muted">
            {spec.columns.length} columns · required:{" "}
            {[
              ...required,
              ...(either.length ? [either.join(" or ")] : []),
            ].join(", ") || "none"}
          </span>
        </span>
        <Icon
          name="expand_more"
          size={20}
          className="shrink-0 text-brand-gray transition-transform group-open:rotate-180"
        />
      </summary>
      <ul className="max-h-72 divide-y divide-brand-border overflow-y-auto border-t border-brand-border sm:hidden">
        {spec.columns.map((c) => {
          const badge =
            REQUIRED_BADGE[String(c.required)] || REQUIRED_BADGE.false;
          return (
            <li key={c.header} className="space-y-1 px-4 py-2.5 text-[13px]">
              <p className="flex items-center justify-between gap-2">
                <span className="font-medium text-brand-dark">{c.header}</span>
                <span
                  className={clsx(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
              </p>
              {c.hint && <p className="text-brand-gray">{c.hint}</p>}
              {c.values && (
                <p className="text-xs text-brand-gray">
                  Allowed: {c.values.join(", ")}
                </p>
              )}
              {c.example && (
                <p className="break-words text-xs text-brand-gray-muted">
                  e.g. {c.example}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div className="hidden max-h-72 overflow-auto border-t border-brand-border sm:block">
        <table className="w-full table-fixed text-left text-[13px]">
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[92px]" />
            <col />
            <col className="w-[28%]" />
          </colgroup>
          <thead className="sticky top-0 bg-brand-tint text-xs uppercase tracking-wide text-brand-gray">
            <tr>
              <th className="px-3 py-2 font-semibold">Column heading</th>
              <th className="px-3 py-2 font-semibold">Required</th>
              <th className="px-3 py-2 font-semibold">What to enter</th>
              <th className="px-3 py-2 font-semibold">Example</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {spec.columns.map((c) => {
              const badge =
                REQUIRED_BADGE[String(c.required)] || REQUIRED_BADGE.false;
              return (
                <tr key={c.header} className="align-top">
                  <td className="break-words px-3 py-2 font-medium text-brand-dark">
                    {c.header}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={clsx(
                        "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-brand-gray">
                    {c.hint || "—"}
                    {c.values && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {c.values.map((v) => (
                          <code
                            key={v}
                            className="rounded bg-brand-tint px-1.5 py-0.5 text-[11px] text-brand-dark"
                          >
                            {v}
                          </code>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="break-words px-3 py-2 text-brand-gray">
                    {c.example || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
};

const Stat = ({ label, value, tone }) => (
  <div className="rounded-lg border border-brand-border px-3 py-2.5">
    <p className={clsx("text-lg font-bold", tone || "text-brand-dark")}>
      {(value || 0).toLocaleString("en-IN")}
    </p>
    <p className="text-xs text-brand-gray-muted">{label}</p>
  </div>
);

function downloadErrors(errors, name) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    "Row,Problem",
    ...errors.map((e) => `${e.row ?? ""},${esc(e.message || e.error || e)}`),
  ].join("\n");
  const href = URL.createObjectURL(
    new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = href;
  a.download = `${name || "import"}-errors.csv`;
  a.click();
  URL.revokeObjectURL(href);
}

/** What the import did, with every rejected row and why. */
const ImportResult = ({ result, name }) => {
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const added = result.created ?? result.inserted ?? 0;
  const skipped = result.skipped || 0;
  return (
    <div className="space-y-4">
      <Alert tone={errors.length ? "warning" : "success"}>
        {errors.length
          ? `Import finished. ${errors.length.toLocaleString("en-IN")} row${errors.length > 1 ? "s were" : " was"} not imported. Fix ${errors.length > 1 ? "them" : "it"} in your file and import again.`
          : "Import finished with no errors."}
      </Alert>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Rows in file" value={result.total} />
        <Stat label="Added" value={added} tone="text-brand-green" />
        <Stat
          label={result.updated !== undefined ? "Updated" : "Skipped"}
          value={result.updated !== undefined ? result.updated : skipped}
        />
        <Stat
          label="Errors"
          value={errors.length}
          tone={errors.length ? "text-brand-red" : undefined}
        />
      </div>
      {result.updated !== undefined && skipped > 0 && (
        <p className="text-xs text-brand-gray">
          {skipped.toLocaleString("en-IN")} rows were skipped because they
          already exist or repeat inside the file.
        </p>
      )}
      {errors.length > 0 && (
        <div className="rounded-xl border border-brand-border">
          <div className="flex items-center justify-between gap-2 border-b border-brand-border px-4 py-2.5">
            <p className="text-sm font-semibold text-brand-dark">
              Rows not imported
            </p>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Icon name="download" size={16} />}
              onClick={() => downloadErrors(errors, name)}
            >
              Error list
            </Button>
          </div>
          <ul className="max-h-60 divide-y divide-brand-border overflow-y-auto text-[13px]">
            {errors.slice(0, 200).map((e, i) => (
              <li key={i} className="flex gap-3 px-4 py-2">
                {e.row !== undefined && (
                  <span className="w-16 shrink-0 font-medium text-brand-dark">
                    Row {e.row}
                  </span>
                )}
                <span className="text-brand-red">
                  {typeof e === "string" ? e : e.message || e.error}
                </span>
              </li>
            ))}
          </ul>
          {errors.length > 200 && (
            <p className="border-t border-brand-border px-4 py-2 text-xs text-brand-gray-muted">
              Showing the first 200. Download the error list for all of them.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

/** Duplicate check (dry run) summary for imports that support it. */
const DuplicateCheck = ({ check }) => (
  <div className="rounded-lg bg-brand-tint p-3 text-sm text-brand-dark">
    <p>
      <b>{check.total}</b> rows · <b>{check.duplicatesInFile?.length || 0}</b>{" "}
      repeated inside the file · <b>{check.existingInDatabase?.length || 0}</b>{" "}
      already on the platform
    </p>
    {(check.duplicatesInFile || []).slice(0, 5).map((d) => (
      <p key={`f${d.row}`} className="text-xs text-brand-gray">
        Row {d.row} repeats row {d.duplicateOf} ({d.value})
      </p>
    ))}
    {(check.existingInDatabase || []).slice(0, 5).map((d) => (
      <p key={`d${d.row}`} className="text-xs text-brand-gray">
        Row {d.row} exists: {d.mobile || d.email}
      </p>
    ))}
  </div>
);

/**
 * The one import dialog used everywhere: format guide + sample download, file picker, options,
 * then the result with every rejected row.
 *
 * guide:    { key, load: () => Promise<spec>, download: (format) => Promise }
 * onImport: (file, { mode, dryRun }) => Promise<result>
 * modes:    optional [{ value, label, hint, danger? }] (adds a duplicate check before importing)
 * children: extra options (e.g. "Publish right away")
 */
export default function ImportDialog({
  open,
  onClose,
  title,
  description,
  guide,
  onImport,
  modes,
  onDone,
  renderError,
  children,
}) {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState(modes?.[0]?.value);
  const [check, setCheck] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null); // 'import' | 'check' | 'xlsx' | 'csv'
  const [error, setError] = useState(null);
  const spec = useQuery({
    queryKey: ["import-template", guide.key],
    queryFn: guide.load,
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });

  const reset = () => {
    setFile(null);
    setCheck(null);
    setResult(null);
    setError(null);
  };
  const close = () => {
    if (busy === "import") return;
    reset();
    onClose();
  };
  const pick = (f) => {
    if (![".xlsx", ".csv"].includes(extOf(f.name))) {
      toast.error(
        extOf(f.name) === ".xls"
          ? "Old .xls files are not supported. In Excel use File > Save As > Excel Workbook (.xlsx)."
          : "Upload an Excel (.xlsx) or CSV file.",
      );
      return;
    }
    setFile(f);
    setCheck(null);
    setError(null);
  };
  const run = async (dryRun) => {
    setBusy(dryRun ? "check" : "import");
    setError(null);
    try {
      const r = await onImport(file, { mode, dryRun });
      if (dryRun) setCheck(r);
      else {
        setResult(r);
        onDone?.(r);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };
  const sample = async (format) => {
    setBusy(format);
    try {
      await guide.download(format);
    } catch (e) {
      toast.error(e.message || "Could not download the sample");
    } finally {
      setBusy(null);
    }
  };
  const danger = modes?.find((m) => m.value === mode)?.danger;

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      subtitle={result ? file?.name : description}
      size="lg"
      footer={
        result ? (
          <>
            <Button size="sm" variant="outline" onClick={reset}>
              Import another file
            </Button>
            <Button size="sm" variant="primaryBlue" onClick={close}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={close}
              disabled={busy === "import"}
            >
              Cancel
            </Button>
            {modes && (
              <Button
                size="sm"
                variant="outline"
                disabled={!file || Boolean(busy)}
                loading={busy === "check"}
                onClick={() => run(true)}
              >
                Check duplicates
              </Button>
            )}
            <Button
              size="sm"
              variant={danger ? "danger" : "primaryBlue"}
              disabled={!file || Boolean(busy && busy !== "import")}
              loading={busy === "import"}
              onClick={() => run(false)}
            >
              Import
            </Button>
          </>
        )
      }
    >
      {result ? (
        <ImportResult
          result={result}
          name={spec.data?.filename?.replace(/-sample$/, "")}
        />
      ) : (
        <div className="space-y-4">
          <section className="rounded-xl border border-brand-blue/20 bg-brand-blue-tint/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-brand-blue">
                  <Icon name="table_view" size={22} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-brand-dark">
                    Start from the sample file
                  </p>
                  <p className="text-xs text-brand-gray">
                    {spec.data?.intro ||
                      "It has the exact column headings, example rows and an Instructions sheet."}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primaryBlue"
                  leftIcon={<Icon name="download" size={16} />}
                  loading={busy === "xlsx"}
                  disabled={Boolean(busy)}
                  onClick={() => sample("xlsx")}
                >
                  Excel sample
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white"
                  loading={busy === "csv"}
                  disabled={Boolean(busy)}
                  onClick={() => sample("csv")}
                >
                  CSV sample
                </Button>
              </div>
            </div>
          </section>

          {file ? (
            <div className="flex items-center gap-3 rounded-xl border border-brand-border p-3">
              <Icon
                name={
                  extOf(file.name) === ".csv" ? "description" : "table_view"
                }
                size={24}
                className="shrink-0 text-brand-green"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-brand-dark">
                  {file.name}
                </p>
                <p className="text-xs text-brand-gray-muted">
                  {sizeLabel(file.size)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busy)}
                onClick={() => setFile(null)}
              >
                Change
              </Button>
            </div>
          ) : (
            <FileDropzone
              accept={ACCEPT}
              maxSizeMb={MAX_MB}
              onFile={pick}
              label="Drag and drop your filled file here"
              hint={`Excel (.xlsx) or CSV, up to ${MAX_MB} MB`}
            />
          )}

          {modes && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold text-brand-dark">
                How to import
              </legend>
              {modes.map((m) => (
                <label
                  key={m.value}
                  className={clsx(
                    "flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm",
                    mode === m.value
                      ? "border-brand-blue bg-brand-blue-tint/40"
                      : "border-brand-border",
                  )}
                >
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === m.value}
                    onChange={() => setMode(m.value)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium text-brand-dark">
                      {m.label}
                    </span>
                    <span className="text-xs text-brand-gray-muted">
                      {m.hint}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {children}
          {check && <DuplicateCheck check={check} />}
          {error &&
            (renderError?.(error) || (
              <Alert tone="error">{error.message}</Alert>
            ))}
          {spec.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}
          {spec.isError && (
            <Alert tone="warning">
              The column guide could not be loaded.{" "}
              <button
                type="button"
                className="font-semibold text-brand-blue underline"
                onClick={() => spec.refetch()}
              >
                Retry
              </button>
            </Alert>
          )}
          {spec.data && (
            <>
              <FormatGuide spec={spec.data} />
              <ul className="list-disc space-y-1 pl-5 text-xs text-brand-gray">
                {spec.data.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
