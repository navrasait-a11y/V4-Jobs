import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { SOCKET_URL, getAccessToken, refreshSession } from '../services/api';
import { chatApi, notificationApi } from '../services';
import useAuthStore from '../store/useAuthStore';

let socket = null;

/** One shared socket per tab. Websocket only: the API runs clustered without sticky polling. */
export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, { path: '/socket.io', transports: ['websocket'], autoConnect: false, auth: (cb) => cb({ token: getAccessToken() }) });
    socket.on('connect_error', async (e) => {
      if (e.message !== 'UNAUTHORIZED') return;
      try {
        await refreshSession();
        socket.connect();
      } catch {
        /* session ended; the API client handles logout */
      }
    });
  }
  return socket;
}

/** Keeps the socket tied to the session and refreshes badges on live events. */
export function useRealtimeSession() {
  const userId = useAuthStore((s) => s.user?._id);
  const client = useQueryClient();
  useEffect(() => {
    if (!userId) return undefined;
    const s = getSocket();
    s.connect();
    const onNotification = (n) => {
      client.invalidateQueries({ queryKey: ['notifications'] });
      toast(n.title);
    };
    const onMessage = () => {
      client.invalidateQueries({ queryKey: ['chat-unread'] });
      client.invalidateQueries({ queryKey: ['conversations'] });
    };
    s.on('notification:new', onNotification);
    s.on('chat:message', onMessage);
    return () => {
      s.off('notification:new', onNotification);
      s.off('chat:message', onMessage);
      s.disconnect();
    };
  }, [userId, client]);
}

export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const s = getSocket();
    const fn = (payload) => ref.current(payload);
    s.on(event, fn);
    return () => s.off(event, fn);
  }, [event]);
}

export function useBadges() {
  const enabled = useAuthStore((s) => Boolean(s.user));
  const notifications = useQuery({ queryKey: ['notifications', 'latest'], queryFn: () => notificationApi.list({ limit: 10 }), enabled, refetchInterval: 120000 });
  const chat = useQuery({ queryKey: ['chat-unread'], queryFn: chatApi.unread, enabled, refetchInterval: 120000 });
  return { notifications: notifications.data?.data || [], unread: notifications.data?.meta?.unread || 0, chatUnread: chat.data?.unread || 0 };
}

/** Screen a notification opens, from `data.screen`. */
export function notificationLink(n, role) {
  const d = n.data || {};
  const employer = role === 'employer';
  switch (d.screen) {
    case 'job':
      return `/jobs/${d.slug || d.jobId}`;
    case 'application':
      return employer ? `/employer/applications/${d.applicationId}` : '/candidate/applications';
    case 'interview':
      return employer ? '/employer/interviews' : '/candidate/interviews';
    case 'chat':
      return employer ? '/employer/messages' : '/candidate/messages';
    case 'profile_views':
      return '/candidate/profile-views';
    case 'job_alert':
      return '/candidate/job-alerts';
    case 'billing':
      return employer ? '/employer/packages-billing' : '/candidate/billing';
    case 'mailbox':
      return employer ? '/employer/mailbox' : '/candidate/mailbox';
    case 'employer_job':
    case 'job_callbacks':
      return d.jobId ? `/employer/jobs?callbacks=${d.jobId}` : '/employer/jobs';
    case 'kyc':
      return '/employer/settings?tab=verification';
    case 'profile':
      return employer ? '/employer/settings' : '/candidate/profile';
    case 'enquiries':
      return '/employer/enquiries';
    default:
      return null;
  }
}
