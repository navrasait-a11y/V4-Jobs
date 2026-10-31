import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Icon, Spinner } from '../ui/feedback';
import { assistantApi, chatApi } from '../../services';
import useAuthStore, { isAdminRole } from '../../store/useAuthStore';
import { useAction } from '../../hooks/useData';
import { useSocketEvent } from '../../hooks/useRealtime';
import { formatLocations, formatSalary } from '../../utils/format';

const WELCOME = ['Recommend jobs for me', 'Show remote jobs', 'Check my applications', 'Talk to support team'];
const STORE = 'fjw_assistant_thread';

const readThread = (key) => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE));
    return saved?.key === key ? saved.items : [];
  } catch {
    return [];
  }
};
const saveThread = (key, items) => {
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ key, items: items.slice(-30) }));
  } catch {
    /* storage blocked */
  }
};

const Composer = ({ onSend, busy, placeholder }) => {
  const [text, setText] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setText('');
    onSend(body);
  };
  return (
    <form onSubmit={submit} className="flex gap-2 border-t border-brand-border p-2.5">
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={placeholder} aria-label="Message" className="h-10 min-w-0 flex-1 rounded-lg border border-brand-border px-3 text-sm outline-none focus:border-[#98A2B3]" />
      <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-orange text-white disabled:opacity-50">
        <Icon name="send" size={18} />
      </button>
    </form>
  );
};

const Bubble = ({ mine, children }) => <div className={clsx('w-fit max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 text-sm', mine ? 'ml-auto bg-brand-blue text-white' : 'bg-brand-tint text-brand-dark')}>{children}</div>;

const Chips = ({ items, onPick }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((s) => (
      <button key={s} type="button" onClick={() => onPick(s)} className="rounded-full border border-brand-border bg-white px-3 py-1 text-xs font-medium text-brand-dark hover:bg-brand-tint">
        {s}
      </button>
    ))}
  </div>
);

const JobRow = ({ job, onNavigate }) => (
  <Link to={`/jobs/${job.slug || job._id}`} onClick={onNavigate} className="block rounded-lg border border-brand-border bg-white p-2.5 hover:border-[#AEB7C4]">
    <div className="flex items-start justify-between gap-2">
      <p className="min-w-0 truncate text-sm font-semibold text-brand-dark">{job.title}</p>
      {job.matchScore > 0 && <span className="shrink-0 rounded bg-brand-tint px-1.5 py-0.5 text-[11px] font-semibold text-brand-blue">{Math.round(job.matchScore)}% match</span>}
    </div>
    <p className="truncate text-xs text-brand-gray">{[job.orgSnapshot?.name, formatLocations(job)].filter(Boolean).join(' · ')}</p>
    {formatSalary(job) && <p className="truncate text-xs text-brand-gray-muted">{formatSalary(job)}</p>}
  </Link>
);

const Assistant = ({ user, onHandoff, onNavigate }) => {
  const threadKey = user?._id || 'guest';
  const [items, setItems] = useState(() => readThread(threadKey));
  const endRef = useRef(null);
  const ask = useMutation({
    mutationFn: assistantApi.message,
    onSuccess: (reply) => setItems((all) => [...all, { id: crypto.randomUUID(), from: 'bot', ...reply }]),
    onError: (e) => setItems((all) => [...all, { id: crypto.randomUUID(), from: 'bot', text: e.status === 429 ? 'You are sending messages too fast. Please wait a moment.' : 'I could not get an answer just now. Please try again.', failed: true }]),
  });

  useEffect(() => saveThread(threadKey, items), [threadKey, items]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items, ask.isPending]);

  const send = (text) => {
    setItems((all) => [...all, { id: crypto.randomUUID(), from: 'me', text }]);
    ask.mutate(text);
  };
  const last = items.at(-1);
  return (
    <>
      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        <Bubble>Hi{user?.fullName ? ` ${user.fullName.split(' ')[0]}` : ''}, I can find jobs, check your applications and answer questions.</Bubble>
        {!items.length && <Chips items={WELCOME} onPick={send} />}
        {items.map((m) =>
          m.from === 'me' ? (
            <Bubble key={m.id} mine>
              {m.text}
            </Bubble>
          ) : (
            <div key={m.id} className="space-y-2">
              <Bubble>{m.text}</Bubble>
              {m.jobs?.map((job) => <JobRow key={job._id} job={job} onNavigate={onNavigate} />)}
              {m.links?.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
                  {m.links.map((l) => (
                    <Link key={l.to} to={l.to} onClick={onNavigate} className="text-xs font-semibold text-brand-blue hover:underline">
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
              {m.handoff && (
                <button type="button" onClick={onHandoff} className="rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white">
                  {user ? 'Message support team' : 'Log in to message support'}
                </button>
              )}
              {m === last && m.suggestions?.length > 0 && <Chips items={m.suggestions} onPick={send} />}
            </div>
          ),
        )}
        {ask.isPending && <Spinner className="ml-1" />}
        <div ref={endRef} />
      </div>
      <Composer onSend={send} busy={ask.isPending} placeholder="Ask about jobs, profile, billing..." />
    </>
  );
};

/** The live thread with the portal team. New replies arrive over the socket. */
const SupportThread = ({ user }) => {
  const [conversationId, setConversationId] = useState(null);
  const client = useQueryClient();
  const endRef = useRef(null);
  const { data: conversations } = useQuery({ queryKey: ['conversations', 'support'], queryFn: () => chatApi.conversations({ type: 'support' }) });
  const activeId = conversationId || conversations?.data?.[0]?._id;
  const { data: messages, isPending } = useQuery({
    queryKey: ['messages', activeId],
    queryFn: () => chatApi.messages(activeId, { limit: 30 }),
    enabled: Boolean(activeId),
  });
  useSocketEvent('chat:message', (e) => {
    if (e.conversationId === activeId) client.invalidateQueries({ queryKey: ['messages', activeId] });
  });
  const items = Array.isArray(messages) ? messages : messages?.messages || [];
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items.length]);

  const send = useAction(
    async (body) => {
      if (activeId) return chatApi.send(activeId, { body, clientId: crypto.randomUUID() });
      const created = await chatApi.support({ message: body });
      setConversationId(created._id || created.conversation?._id);
      return created;
    },
    { invalidate: ['messages', 'conversations'] },
  );

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        <p className="rounded-lg bg-brand-tint px-3 py-2 text-xs text-brand-gray">Your message goes to our support team. Their reply will appear here.</p>
        {activeId && isPending && <Spinner className="mx-auto" />}
        {items.map((m) => (
          <Bubble key={m._id} mine={(m.sender?._id || m.sender) === user._id}>
            {m.body}
          </Bubble>
        ))}
        <div ref={endRef} />
      </div>
      <Composer onSend={(body) => send.mutate(body)} busy={send.isPending} placeholder="Write to the support team..." />
    </>
  );
};

/** Help widget: an assistant for instant answers, and the support team thread for everything else. */
const HelpChatWidget = () => {
  const user = useAuthStore((s) => s.user);
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('assistant');

  if (isAdminRole(user?.role) || pathname.startsWith('/admin')) return null;
  const close = () => setOpen(false);
  const tabButton = (id, label) => (
    <button type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={clsx('flex-1 rounded-md py-1.5 text-xs font-semibold', tab === id ? 'bg-white text-brand-blue' : 'text-white/85 hover:text-white')}>
      {label}
    </button>
  );

  return (
    <div className={clsx('fixed right-4 z-40 sm:bottom-5 sm:right-5', pathname.startsWith('/jobs/') ? 'bottom-20 lg:bottom-5' : 'bottom-4')}>
      {open && (
        <div className="mb-3 flex h-[540px] max-h-[75dvh] w-[370px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden surface shadow-2xl animate-fade-up">
          <div className="bg-brand-blue px-4 pb-2.5 pt-3 text-white">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Need help?</p>
              <button onClick={close} aria-label="Close chat">
                <Icon name="close" size={20} />
              </button>
            </div>
            {user && (
              <div className="mt-2 flex gap-1 rounded-lg bg-white/15 p-0.5">
                {tabButton('assistant', 'Assistant')}
                {tabButton('team', 'Support team')}
              </div>
            )}
          </div>
          {tab === 'team' && user ? (
            <SupportThread user={user} />
          ) : (
            <Assistant
              user={user}
              onNavigate={close}
              onHandoff={() => {
                if (user) setTab('team');
                else window.location.assign('/login');
              }}
            />
          )}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-label="Toggle help chat" className="ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-ink text-white shadow-lg hover:bg-brand-dark">
        <Icon name={open ? 'close' : 'support_agent'} size={24} />
      </button>
    </div>
  );
};

export default HelpChatWidget;
