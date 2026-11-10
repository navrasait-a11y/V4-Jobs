import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Avatar, SearchInput } from '../../components/ui/data';
import { EmptyState, Icon, Spinner } from '../../components/ui/feedback';
import useAuth from '../../hooks/useAuth';
import { useAction, useDocumentTitle } from '../../hooks/useData';
import { getSocket, useSocketEvent } from '../../hooks/useRealtime';
import { chatApi } from '../../services';
import { formatDate, timeAgo } from '../../utils/format';

const peerOf = (c, me) => (c.participants || []).find((p) => String(p.user) !== String(me)) || c.participants?.[0] || {};
const peerName = (p) => p.profile?.fullName || p.profile?.displayName || p.profile?.name || 'Conversation';

const Thread = ({ conversation, me, onBack }) => {
  const client = useQueryClient();
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const typingTimer = useRef(null);
  const id = conversation._id;
  const { data, isPending } = useQuery({ queryKey: ['messages', id], queryFn: () => chatApi.messages(id, { limit: 50 }) });
  const messages = Array.isArray(data) ? data : [];

  useEffect(() => {
    chatApi.read(id).then(() => client.invalidateQueries({ queryKey: ['chat-unread'] })).catch(() => {});
  }, [id, client, messages.length]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  useSocketEvent('chat:message', (e) => {
    if (e.conversationId === id) client.invalidateQueries({ queryKey: ['messages', id] });
  });
  useSocketEvent('chat:deleted', (e) => {
    if (e.conversationId === id) client.invalidateQueries({ queryKey: ['messages', id] });
  });
  useSocketEvent('chat:typing', (e) => {
    if (e.conversationId !== id || e.userId === me) return;
    setTyping(e.isTyping);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 4000);
  });

  const send = useAction((body) => chatApi.send(id, { clientId: crypto.randomUUID(), ...body }), { invalidate: ['messages', 'conversations'], onSuccess: () => setText('') });
  const attach = useAction(async (file) => {
    const { key, name, mime, size } = await chatApi.attach(file);
    return chatApi.send(id, { clientId: crypto.randomUUID(), attachments: [{ key, name, mime, size }] });
  }, { invalidate: ['messages', 'conversations'] });
  const remove = useAction(chatApi.removeMessage, { invalidate: ['messages'] });
  const peer = peerOf(conversation, me);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-brand-border px-4 py-3">
        <button onClick={onBack} aria-label="Back to conversations" className="md:hidden">
          <Icon name="arrow_back" />
        </button>
        <Avatar name={peerName(peer)} src={peer.profile?.avatar?.url || peer.profile?.logo?.url} size={38} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand-dark">{peerName(peer)}</p>
          <p className="h-4 truncate text-xs text-brand-gray-muted">{typing ? 'typing...' : conversation.job?.title || peer.profile?.organizationName || ''}</p>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-brand-tint p-4">
        {isPending && <Spinner className="mx-auto" />}
        {messages.map((m) => {
          const mine = (m.sender?._id || m.sender) === me;
          return (
            <div key={m._id} className={clsx('group flex items-end gap-1', mine && 'justify-end')}>
              {mine && !m.deletedAt && (
                <button onClick={() => remove.mutate(m._id)} aria-label="Delete message" className="hidden text-brand-gray-muted hover:text-brand-red group-hover:block">
                  <Icon name="delete" size={15} />
                </button>
              )}
              <div className={clsx('max-w-[78%] rounded-xl px-3 py-2 text-sm', mine ? 'bg-brand-blue text-white' : 'border border-brand-border bg-white text-brand-dark')}>
                {m.deletedAt ? <i className="opacity-70">Message deleted</i> : <span className="whitespace-pre-wrap break-words">{m.body}</span>}
                {m.attachments?.map((a) => (
                  <a key={a.key} href={a.url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 underline">
                    <Icon name="attach_file" size={15} /> {a.name}
                  </a>
                ))}
                <p className={clsx('mt-0.5 text-[10px]', mine ? 'text-white/70' : 'text-brand-gray-muted')}>{timeAgo(m.createdAt)}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-center gap-2 border-t border-brand-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send.mutate({ body: text.trim() });
        }}
      >
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach file" className="text-brand-gray hover:text-brand-blue">
          <Icon name="attach_file" />
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*,.pdf,.doc,.docx"
          onChange={(e) => {
            if (e.target.files?.[0]) attach.mutate(e.target.files[0]);
            e.target.value = '';
          }}
        />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            getSocket().emit('chat:typing', { conversationId: id, isTyping: Boolean(e.target.value) });
          }}
          aria-label="Message"
          placeholder="Type a message"
          className="h-10 min-w-0 flex-1 rounded-lg border border-brand-border px-3 text-sm outline-none focus:border-brand-blue focus:shadow-[0_0_0_3px_var(--color-brand-blue-tint)]"
        />
        <button type="submit" disabled={send.isPending || !text.trim()} aria-label="Send" className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-blue text-white disabled:opacity-50">
          <Icon name="send" size={18} />
        </button>
      </form>
    </div>
  );
};

const Messages = () => {
  useDocumentTitle('Messages');
  const { user } = useAuth();
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['conversations', 'direct'], queryFn: () => chatApi.conversations({ type: 'direct' }) });
  const items = (query.data?.data || []).filter((c) => peerName(peerOf(c, user._id)).toLowerCase().includes(search.toLowerCase()));
  const active = items.find((c) => c._id === activeId);

  return (
    <div className="flex h-[calc(100vh-7.5rem)] overflow-hidden surface">
      <div className={clsx('w-full shrink-0 flex-col border-r border-brand-border md:flex md:w-[320px]', active ? 'hidden' : 'flex')}>
        <div className="border-b border-brand-border p-4">
          <h1 className="mb-3 text-lg font-bold text-brand-dark">Messages</h1>
          <SearchInput value={search} onChange={setSearch} placeholder="Search conversations" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {query.isPending && <Spinner className="mx-auto mt-6" />}
          {query.data && !items.length && <EmptyState className="m-3 border-0" icon="forum" title="No conversations" description="Chats start once you connect over a job." />}
          {items.map((c) => {
            const peer = peerOf(c, user._id);
            return (
              <button key={c._id} onClick={() => setActiveId(c._id)} className={clsx('flex w-full items-center gap-3 border-b border-brand-border/60 px-4 py-3 text-left hover:bg-brand-tint', c._id === activeId && 'bg-brand-blue-tint')}>
                <Avatar name={peerName(peer)} src={peer.profile?.avatar?.url || peer.profile?.logo?.url} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-brand-dark">{peerName(peer)}</p>
                    <span className="shrink-0 text-[11px] text-brand-gray-muted">{formatDate(c.lastMessage?.at || c.updatedAt, 'd MMM')}</span>
                  </div>
                  <p className="truncate text-xs text-brand-gray">{c.lastMessage?.body || c.lastMessage?.text || ''}</p>
                </div>
                {c.unread > 0 && <span className="rounded-full bg-brand-orange px-1.5 py-0.5 text-[10px] font-bold text-white">{c.unread}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {active ? (
        <Thread key={active._id} conversation={active} me={user._id} onBack={() => setActiveId(null)} />
      ) : (
        <div className="hidden flex-1 items-center justify-center text-sm text-brand-gray-muted md:flex">Select a conversation</div>
      )}
    </div>
  );
};

export default Messages;
