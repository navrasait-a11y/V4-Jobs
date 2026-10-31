import React, { useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import Button from './Button';

export const Icon = ({ name, size = 20, fill = false, className = '' }) => (
  <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size, ...(fill ? { fontVariationSettings: "'FILL' 1" } : {}) }} aria-hidden="true">
    {name}
  </span>
);

export const Spinner = ({ size = 28, className = '' }) => (
  <svg className={clsx('animate-spin text-brand-blue', className)} style={{ width: size, height: size }} viewBox="0 0 24 24" role="status" aria-label="Loading">
    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
    <path className="opacity-80" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z" />
  </svg>
);

export const PageLoader = ({ className = 'min-h-[50vh]' }) => (
  <div className={clsx('flex items-center justify-center', className)}>
    <Spinner />
  </div>
);

export const Skeleton = ({ className = 'h-4 w-full' }) => <div className={clsx('animate-pulse rounded-md bg-[#E9EEF5]', className)} />;

export const CardSkeleton = ({ count = 3 }) => (
  <div className="space-y-3">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="surface p-5">
        <div className="flex gap-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const EmptyState = ({ icon = 'inbox', title, description, action, className = '' }) => (
  <div className={clsx('rounded-[var(--radius-card)] border border-dashed border-[#D5DBE4] bg-white px-6 py-10 text-center', className)}>
    <Icon name={icon} size={30} className="text-brand-gray-muted" />
    {title && <p className="mt-3 font-semibold text-brand-dark">{title}</p>}
    {description && <p className="mx-auto mt-1 max-w-md text-sm text-brand-gray">{description}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

export const ErrorState = ({ error, onRetry, className = '' }) => (
  <div className={clsx('rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center', className)} role="alert">
    <Icon name="error" size={28} className="text-brand-red" />
    <p className="mt-2 text-sm font-semibold text-brand-dark">{error?.message || 'Something went wrong'}</p>
    {error?.requestId && <p className="mt-1 text-xs text-brand-gray-muted">Reference: {error.requestId}</p>}
    {onRetry && (
      <Button variant="outline" size="sm" className="mt-3" onClick={() => onRetry()}>
        Try again
      </Button>
    )}
  </div>
);

/** Renders loading / error / empty states around query data. */
export const QueryState = ({ query, isEmpty, empty, skeleton, children }) => {
  if (query.isPending) return skeleton || <PageLoader className="min-h-[240px]" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (isEmpty) return empty;
  return children;
};

export const Alert = ({ tone = 'info', children, className = '' }) => {
  const tones = {
    info: 'bg-brand-blue-tint border-brand-blue/20 text-brand-dark',
    warning: 'bg-brand-amber-tint border-amber-300/50 text-brand-dark',
    error: 'bg-red-50 border-red-200 text-red-700',
    success: 'bg-brand-green-tint border-brand-green/30 text-brand-dark',
  };
  const icons = { info: 'info', warning: 'warning', error: 'error', success: 'check_circle' };
  return (
    <div className={clsx('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm', tones[tone], className)} role={tone === 'error' ? 'alert' : undefined}>
      <Icon name={icons[tone]} size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};

/** Traps Tab inside a dialog, locks page scroll and returns focus to where it was. */
function useDialog(open, onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [...(ref.current?.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([tabindex="-1"]),textarea:not([disabled]),select:not([disabled])') || [])].filter((el) => el.offsetParent !== null);
    (ref.current?.querySelector('input,textarea') || focusable()[0])?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current?.();
      if (e.key !== 'Tab') return;
      const list = focusable();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      before?.focus?.();
    };
  }, [open]);
  return ref;
}

export const Modal = ({ open, onClose, title, subtitle, size = 'md', children, footer }) => {
  const ref = useDialog(open, onClose);

  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-brand-dark/50 p-0 animate-fade-in sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={clsx('sheet-up flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-[var(--shadow-modal)] sm:rounded-xl', widths[size])}>
        {title && (
          <div className="flex items-start justify-between gap-3 border-b border-brand-border px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-brand-dark">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-brand-gray-muted">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-brand-gray hover:bg-brand-tint">
              <Icon name="close" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-brand-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
};

export const ConfirmDialog = ({ open, onClose, onConfirm, title = 'Are you sure?', message, confirmLabel = 'Confirm', danger = false, loading = false }) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    size="sm"
    footer={
      <>
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant={danger ? 'danger' : 'primaryBlue'} size="sm" loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <p className="text-sm text-brand-gray">{message}</p>
  </Modal>
);

export const Drawer = ({ open, onClose, title, subtitle, children, footer, width = 'max-w-xl' }) => {
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-brand-dark/40 animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={clsx('flex h-full w-full flex-col bg-white shadow-[var(--shadow-modal)] animate-slide-in', width)}>
        <div className="flex items-start justify-between gap-3 border-b border-brand-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-brand-dark">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-brand-gray-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-brand-gray hover:bg-brand-tint">
            <Icon name="close" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-brand-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
};
