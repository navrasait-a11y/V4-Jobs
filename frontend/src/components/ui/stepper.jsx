import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Icon } from './feedback';
import Button from './Button';

/**
 * Progress header for multi-step forms. Steps already reached (or every step, with `free`) are
 * clickable; a step with errors shows a red badge. Phones get a compact "Step 2 of 5" bar.
 * steps: { key, title, hint? }[]
 */
export const Stepper = ({ steps, current, reached = current, onStep, errorSteps = [], free = false, plain = false, className = '' }) => {
  const pct = Math.round(((current + 1) / steps.length) * 100);
  const canGo = (i) => free || i <= reached;
  return (
    <nav aria-label="Form steps" className={clsx(!plain && 'surface p-3 sm:p-4', className)}>
      <div className="sm:hidden">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-brand-blue">
            Step {current + 1} of {steps.length}
          </span>
          <span className="text-brand-gray-muted">{pct}%</span>
        </div>
        <p className="mt-1 text-[15px] font-bold text-brand-dark">{steps[current].title}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-tint" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand-blue transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto no-scrollbar">
          {steps.map((s, i) => (
            <button
              key={s.key}
              type="button"
              disabled={!canGo(i)}
              onClick={() => onStep?.(i)}
              aria-current={i === current ? 'step' : undefined}
              className={clsx(
                'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40',
                i === current
                  ? 'border-brand-blue bg-brand-blue text-white'
                  : errorSteps.includes(i)
                    ? 'border-brand-red text-brand-red'
                    : i < reached || free
                      ? 'border-brand-blue/40 text-brand-blue'
                      : 'border-brand-border text-brand-gray',
              )}
            >
              {i + 1}. {s.short || s.title}
            </button>
          ))}
        </div>
      </div>

      <ol className="hidden items-start sm:flex">
        {steps.map((s, i) => {
          const done = i < current || (free && i !== current && !errorSteps.includes(i));
          const bad = errorSteps.includes(i);
          const active = i === current;
          return (
            <li key={s.key} className="flex min-w-0 flex-1 items-start">
              <button
                type="button"
                disabled={!canGo(i)}
                onClick={() => onStep?.(i)}
                aria-current={active ? 'step' : undefined}
                className="group flex min-w-0 flex-col items-center gap-1.5 px-1 text-center disabled:cursor-not-allowed"
              >
                <span
                  className={clsx(
                    'grid h-9 w-9 place-items-center rounded-full border-2 text-sm font-bold transition-all',
                    active && 'border-brand-blue bg-brand-blue text-white shadow-[0_0_0_4px_var(--color-brand-blue-tint)]',
                    !active && bad && 'border-brand-red bg-brand-red-tint text-brand-red',
                    !active && !bad && done && 'border-brand-green bg-brand-green text-white',
                    !active && !bad && !done && 'border-[#D5DBE4] bg-white text-brand-gray-muted group-enabled:group-hover:border-brand-blue',
                  )}
                >
                  {bad && !active ? <Icon name="priority_high" size={18} /> : done && !active ? <Icon name="check" size={18} /> : i + 1}
                </span>
                <span className={clsx('line-clamp-2 text-xs font-semibold leading-tight', active ? 'text-brand-blue' : bad ? 'text-brand-red' : 'text-brand-gray')}>{s.title}</span>
              </button>
              {i < steps.length - 1 && <span aria-hidden className={clsx('mt-[18px] h-0.5 min-w-3 flex-1 rounded-full transition-colors', i < current ? 'bg-brand-green' : 'bg-brand-border')} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

/** Sticky Back / Next / Submit bar for a stepped form. */
export const StepNav = ({ current, total, onBack, onNext, submitLabel = 'Submit', loading, extra, nextLabel = 'Save & continue' }) => {
  const last = current === total - 1;
  return (
    <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-t-xl border border-brand-border bg-white/95 p-3 shadow-[0_-6px_18px_-12px_rgba(17,24,39,0.35)] backdrop-blur">
      {current > 0 ? (
        <Button variant="outline" size="sm" leftIcon={<Icon name="arrow_back" size={16} />} onClick={onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {extra}
        {last ? (
          <Button key="submit" type="submit" size="sm" variant="primary" loading={loading}>
            {submitLabel}
          </Button>
        ) : (
          <Button
            key="next"
            size="sm"
            variant="primary"
            onClick={(e) => {
              e.preventDefault();
              onNext();
            }}
            rightIcon={<Icon name="arrow_forward" size={16} />}
          >
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  );
};

/** Does error key `k` (e.g. "salary.max", "job.title") belong to a step owning `fields`? */
const owns = (fields = [], k) => {
  const key = k.replace(/^(job|employer)\./, '');
  return fields.includes(key) || fields.includes(key.split('.')[0]);
};

/**
 * Step state for a long form. `validate()` returns { field: message } for the whole form; "Next" only
 * blocks on the current step's fields, the final submit jumps to the first step that has an error.
 */
export function useSteps(steps, { validate, setErrors, scrollRef, watch }) {
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  // Live clean-up: once a field the client validated is fixed, its message disappears while typing.
  const validateRef = useRef(validate);
  const clientKeys = useRef(new Set());
  useEffect(() => {
    validateRef.current = validate;
  });
  const watched = useRef(watch);
  useEffect(() => {
    if (watched.current === watch) return;
    watched.current = watch;
    setErrors((prev) => {
      const keys = Object.keys(prev || {});
      if (!keys.length) return prev;
      const now = validateRef.current();
      const out = {};
      for (const k of keys) {
        if (clientKeys.current.has(k) && !(k in now)) continue;
        out[k] = k in now ? now[k] : prev[k];
      }
      return Object.keys(out).length === keys.length && keys.every((k) => out[k] === prev[k]) ? prev : out;
    });
  }, [watch, setErrors]);
  const check = () => {
    const all = validateRef.current();
    Object.keys(all).forEach((k) => clientKeys.current.add(k));
    return all;
  };
  const stepOf = useCallback(
    (keys) => {
      const idx = keys.map((k) => steps.findIndex((s) => owns(s.fields, k))).filter((i) => i >= 0);
      return idx.length ? Math.min(...idx) : -1;
    },
    [steps],
  );
  const goTo = useCallback((i) => {
    if (i < 0) return;
    setStep(i);
    setReached((r) => Math.max(r, i));
  }, []);
  // Scroll after the new step has rendered, so the page height is already the new step's.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (scrollRef?.current) scrollRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, scrollRef]);
  const next = () => {
    const all = check();
    const seen = steps.slice(0, step + 1).flatMap((s) => s.fields || []);
    setErrors(Object.fromEntries(Object.entries(all).filter(([k]) => owns(seen, k))));
    if (Object.keys(all).some((k) => owns(steps[step].fields, k))) {
      toast.error('Please fix the highlighted fields');
      return false;
    }
    goTo(step + 1);
    return true;
  };
  const validateAll = () => {
    const all = check();
    setErrors(all);
    const keys = Object.keys(all);
    if (!keys.length) return true;
    goTo(stepOf(keys));
    toast.error('Please fix the highlighted fields');
    return false;
  };
  /** Moves to the step of server-side field errors. */
  const showErrors = (fieldErrors = {}) => goTo(stepOf(Object.keys(fieldErrors)));
  const errorSteps = (errors = {}) => [
    ...new Set(
      Object.keys(errors)
        .map((k) => stepOf([k]))
        .filter((i) => i >= 0),
    ),
  ];
  return { step, reached, goTo, next, validateAll, showErrors, errorSteps, last: step === steps.length - 1, stepOf };
}
