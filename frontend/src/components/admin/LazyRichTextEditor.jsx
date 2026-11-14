import React, { Suspense, lazy } from 'react';
import { Skeleton } from '../ui/feedback';

// The editor (tiptap + ProseMirror) is ~390 KB. Loading it only where a form actually shows it keeps
// every admin list page light, so moving between pages stays instant.
const RichTextEditor = lazy(() => import('./RichTextEditor'));

const EditorSkeleton = ({ label, minHeight = 240 }) => (
  <div aria-busy="true" aria-label={label ? `${label} (loading editor)` : 'Loading editor'}>
    {label && <Skeleton className="mb-2 h-4 w-40" />}
    <div className="overflow-hidden rounded-[var(--radius-input)] border border-brand-border">
      <Skeleton className="h-10 w-full rounded-none" />
      <div className="space-y-2 p-3" style={{ minHeight }}>
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  </div>
);

/** Same props as RichTextEditor; shows a skeleton while the editor code downloads. */
const LazyRichTextEditor = (props) => (
  <Suspense fallback={<EditorSkeleton label={props.label} minHeight={props.minHeight} />}>
    <RichTextEditor {...props} />
  </Suspense>
);

export default LazyRichTextEditor;
