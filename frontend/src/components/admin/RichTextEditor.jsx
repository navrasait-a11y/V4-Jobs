import React, { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Youtube from '@tiptap/extension-youtube';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import Button from '../ui/Button';
import { Icon, Modal } from '../ui/feedback';
import { TextField } from '../ui/form';
import { adminApi } from '../../services';

const BLOCKS = [
  { value: 'p', label: 'Paragraph' },
  { value: 'h2', label: 'Heading' },
  { value: 'h3', label: 'Sub-heading' },
  { value: 'h4', label: 'Small heading' },
];

const Tool = ({ icon, label, active, disabled, onClick }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active || undefined}
    disabled={disabled}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-35', active ? 'bg-brand-blue text-white' : 'text-brand-dark hover:bg-brand-tint')}
  >
    <Icon name={icon} size={19} />
  </button>
);
const Divider = () => <span className="mx-1 h-6 w-px shrink-0 bg-brand-border" />;

/** Small form dialog used for links, image URLs and videos. */
const PromptDialog = ({ prompt, onClose }) => {
  const [values, setValues] = useState(() => Object.fromEntries(prompt.fields.map((f) => [f.key, f.value || ''])));
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={prompt.title}
      footer={
        <>
          {prompt.onRemove && (
            <Button size="sm" variant="ghost" onClick={() => { prompt.onRemove(); onClose(); }}>
              Remove
            </Button>
          )}
          <Button size="sm" variant="primaryBlue" disabled={!values[prompt.fields[0].key]?.trim()} onClick={() => { prompt.onSubmit(values); onClose(); }}>
            {prompt.submitLabel || 'Apply'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (values[prompt.fields[0].key]?.trim()) {
            prompt.onSubmit(values);
            onClose();
          }
        }}
      >
        {prompt.fields.map((f, i) => (
          <TextField key={f.key} label={f.label} value={values[f.key]} placeholder={f.placeholder} hint={f.hint} autoFocus={i === 0} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
        ))}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
};

const withScheme = (url) => (/^(https?:|mailto:|tel:|\/)/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);

/**
 * Visual editor for admin content (pages, blogs, FAQs, e-mails): a familiar toolbar instead of HTML.
 * value / onChange carry HTML, so the API and the public pages are unchanged. "HTML" mode stays
 * available for advanced edits; the API sanitises whatever is saved.
 * `variables` adds one-click {{variable}} chips (e-mail templates). `compact` = smaller toolbar.
 */
const RichTextEditor = ({ value = '', onChange, placeholder = 'Start writing…', compact = false, variables = [], minHeight = 320, label, required, error, hint }) => {
  const [source, setSource] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [prompt, setPrompt] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const lastEmitted = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Underline,
      Highlight,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Image.configure({ HTMLAttributes: { loading: 'lazy' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Youtube.configure({ nocookie: true, modestBranding: true }),
    ],
    content: value || '',
    editorProps: { attributes: { class: 'prose-content', 'aria-label': label || 'Content editor' } },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? '' : ed.getHTML();
      lastEmitted.current = html;
      onChange?.(html);
    },
  });

  // Content loaded later (edit forms) or changed in HTML mode.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value || '', false);
  }, [value, editor]);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setFullscreen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [fullscreen]);

  if (!editor) return null;
  const chain = () => editor.chain().focus();
  const is = (name, attrs) => editor.isActive(name, attrs);
  const block = is('heading', { level: 2 }) ? 'h2' : is('heading', { level: 3 }) ? 'h3' : is('heading', { level: 4 }) ? 'h4' : 'p';
  const setBlock = (b) => (b === 'p' ? chain().setParagraph().run() : chain().toggleHeading({ level: Number(b[1]) }).run());
  const inTable = is('table');
  const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ', ' ');
  const words = text.split(/\s+/).filter(Boolean).length;

  const uploadImage = async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast.error('Choose an image file');
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be 5 MB or smaller');
    setUploading(true);
    try {
      const m = await adminApi.upload('/cms/media', { file });
      chain().setImage({ src: m.url, alt: file.name.replace(/\.[^.]+$/, '') }).run();
    } catch (e) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
    return undefined;
  };

  const editLink = () => {
    const current = editor.getAttributes('link').href || '';
    setPrompt({
      title: current ? 'Edit link' : 'Add link',
      fields: [{ key: 'href', label: 'Link address', value: current, placeholder: 'https://example.com or /jobs', hint: 'Select text first to turn it into a link' }],
      onSubmit: ({ href }) => {
        if (editor.state.selection.empty && !current) chain().insertContent(`<a href="${withScheme(href)}">${href}</a>`).run();
        else chain().extendMarkRange('link').setLink({ href: withScheme(href) }).run();
      },
      onRemove: current ? () => chain().extendMarkRange('link').unsetLink().run() : undefined,
    });
  };

  const toolbar = (
    <div className="sticky top-0 z-10 flex items-center gap-0.5 overflow-x-auto border-b border-brand-border bg-white px-2 py-1.5">
      <select
        aria-label="Text style"
        value={block}
        onChange={(e) => setBlock(e.target.value)}
        disabled={source}
        className="mr-1 h-8 shrink-0 rounded-md border border-brand-border bg-white px-2 text-sm text-brand-dark"
      >
        {BLOCKS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </select>
      <Tool icon="format_bold" label="Bold (Ctrl+B)" active={is('bold')} disabled={source} onClick={() => chain().toggleBold().run()} />
      <Tool icon="format_italic" label="Italic (Ctrl+I)" active={is('italic')} disabled={source} onClick={() => chain().toggleItalic().run()} />
      <Tool icon="format_underlined" label="Underline (Ctrl+U)" active={is('underline')} disabled={source} onClick={() => chain().toggleUnderline().run()} />
      {!compact && <Tool icon="strikethrough_s" label="Strikethrough" active={is('strike')} disabled={source} onClick={() => chain().toggleStrike().run()} />}
      {!compact && <Tool icon="ink_highlighter" label="Highlight" active={is('highlight')} disabled={source} onClick={() => chain().toggleHighlight().run()} />}
      <Divider />
      <Tool icon="format_list_bulleted" label="Bulleted list" active={is('bulletList')} disabled={source} onClick={() => chain().toggleBulletList().run()} />
      <Tool icon="format_list_numbered" label="Numbered list" active={is('orderedList')} disabled={source} onClick={() => chain().toggleOrderedList().run()} />
      <Tool icon="format_quote" label="Quote" active={is('blockquote')} disabled={source} onClick={() => chain().toggleBlockquote().run()} />
      {!compact && <Tool icon="code_blocks" label="Code block" active={is('codeBlock')} disabled={source} onClick={() => chain().toggleCodeBlock().run()} />}
      <Divider />
      <Tool icon="format_align_left" label="Align left" active={editor.isActive({ textAlign: 'left' })} disabled={source} onClick={() => chain().setTextAlign('left').run()} />
      <Tool icon="format_align_center" label="Align centre" active={editor.isActive({ textAlign: 'center' })} disabled={source} onClick={() => chain().setTextAlign('center').run()} />
      <Tool icon="format_align_right" label="Align right" active={editor.isActive({ textAlign: 'right' })} disabled={source} onClick={() => chain().setTextAlign('right').run()} />
      <Divider />
      <Tool icon="link" label="Link" active={is('link')} disabled={source} onClick={editLink} />
      <Tool icon={uploading ? 'hourglass_top' : 'image'} label="Upload image" disabled={source || uploading} onClick={() => fileRef.current?.click()} />
      {!compact && (
        <>
          <Tool
            icon="add_photo_alternate"
            label="Image from URL"
            disabled={source}
            onClick={() =>
              setPrompt({
                title: 'Insert image from a link',
                fields: [
                  { key: 'src', label: 'Image URL', placeholder: 'https://…' },
                  { key: 'alt', label: 'Description (for accessibility and SEO)' },
                ],
                submitLabel: 'Insert',
                onSubmit: ({ src, alt }) => chain().setImage({ src: withScheme(src), alt }).run(),
              })
            }
          />
          <Tool
            icon="smart_display"
            label="YouTube video"
            disabled={source}
            onClick={() =>
              setPrompt({
                title: 'Embed a YouTube video',
                fields: [{ key: 'src', label: 'YouTube link', placeholder: 'https://www.youtube.com/watch?v=…' }],
                submitLabel: 'Embed',
                onSubmit: ({ src }) => {
                  if (!/youtu\.?be/.test(src)) return toast.error('Paste a YouTube link');
                  return chain().setYoutubeVideo({ src: src.trim() }).run();
                },
              })
            }
          />
          <Tool icon="table" label="Insert table" disabled={source || inTable} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
          <Tool icon="horizontal_rule" label="Divider line" disabled={source} onClick={() => chain().setHorizontalRule().run()} />
        </>
      )}
      <Divider />
      <Tool icon="format_clear" label="Clear formatting" disabled={source} onClick={() => chain().unsetAllMarks().clearNodes().run()} />
      <Tool icon="undo" label="Undo (Ctrl+Z)" disabled={source || !editor.can().undo()} onClick={() => chain().undo().run()} />
      <Tool icon="redo" label="Redo (Ctrl+Y)" disabled={source || !editor.can().redo()} onClick={() => chain().redo().run()} />
      <span className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
        <Tool icon="code" label={source ? 'Back to visual editor' : 'Edit HTML (advanced)'} active={source} onClick={() => setSource((v) => !v)} />
        <Tool icon={fullscreen ? 'close_fullscreen' : 'open_in_full'} label={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'} onClick={() => setFullscreen((v) => !v)} />
      </span>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { uploadImage(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );

  const tableBar = inTable && !source && (
    <div className="flex flex-wrap items-center gap-1 border-b border-brand-border bg-brand-tint px-2 py-1 text-xs">
      <span className="mr-1 font-semibold text-brand-gray">Table:</span>
      {[
        ['Row above', () => chain().addRowBefore().run()],
        ['Row below', () => chain().addRowAfter().run()],
        ['Column left', () => chain().addColumnBefore().run()],
        ['Column right', () => chain().addColumnAfter().run()],
        ['Delete row', () => chain().deleteRow().run()],
        ['Delete column', () => chain().deleteColumn().run()],
        ['Header row', () => chain().toggleHeaderRow().run()],
        ['Delete table', () => chain().deleteTable().run()],
      ].map(([text, fn]) => (
        <button key={text} type="button" onMouseDown={(e) => e.preventDefault()} onClick={fn} className={clsx('rounded px-2 py-1 font-medium hover:bg-white', /Delete/.test(text) ? 'text-brand-red' : 'text-brand-dark')}>
          {text}
        </button>
      ))}
    </div>
  );

  return (
    <div className={clsx(fullscreen && 'fixed inset-0 z-[60] flex flex-col bg-black/40 p-0 sm:p-6')}>
      {label && !fullscreen && (
        <p className="mb-1.5 text-sm font-medium text-brand-dark">
          {label}
          {required && <span className="text-brand-red"> *</span>}
        </p>
      )}
      <div className={clsx('rte flex flex-col overflow-hidden rounded-[var(--radius-input)] border bg-white', error ? 'border-brand-red' : 'border-[#D5DBE4] focus-within:border-[#98A2B3]', fullscreen && 'mx-auto h-full w-full max-w-5xl rounded-none sm:rounded-xl')}>
        {toolbar}
        {tableBar}
        {variables.length > 0 && !source && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-brand-border px-3 py-1.5 text-xs">
            <span className="text-brand-gray">Insert:</span>
            {variables.map((v) => (
              <button key={v} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().insertContent(`{{${v}}}`).run()} className="rounded-full bg-brand-blue-tint px-2 py-0.5 font-mono text-brand-blue hover:bg-brand-blue hover:text-white">
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        )}
        <div className={clsx('overflow-y-auto', fullscreen ? 'flex-1' : 'max-h-[70vh]')} style={fullscreen ? undefined : { minHeight }}>
          {source ? (
            <textarea
              aria-label="HTML source"
              value={value}
              spellCheck={false}
              onChange={(e) => onChange?.(e.target.value)}
              className="block h-full w-full resize-none p-4 font-mono text-[13px] leading-relaxed text-brand-dark outline-none"
              style={{ minHeight: fullscreen ? '100%' : minHeight }}
            />
          ) : (
            <EditorContent editor={editor} />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-brand-border bg-brand-tint/60 px-3 py-1.5 text-[11px] text-brand-gray-muted">
          <span>
            {words} words · {Math.max(1, Math.round(words / 200))} min read
          </span>
          <span className="hidden sm:inline">{source ? 'HTML mode - switch back to see formatting' : 'Tip: paste from Word or Google Docs keeps the formatting'}</span>
        </div>
      </div>
      {error && !fullscreen && <p className="mt-1 text-xs text-brand-red">{error}</p>}
      {hint && !error && !fullscreen && <p className="mt-1 text-xs text-brand-gray-muted">{hint}</p>}
      {prompt && <PromptDialog prompt={prompt} onClose={() => setPrompt(null)} />}
    </div>
  );
};

export default RichTextEditor;
