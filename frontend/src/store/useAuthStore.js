import { create } from 'zustand';
import http, { hasSessionHint, refreshSession, setAccessToken, setSessionExpiredHandler } from '../services/api';
import { setMonitoringUser } from '../utils/monitoring';

const ADMIN_ROLES = ['admin', 'super_admin'];

const useAuthStore = create((set, get) => ({
  user: null,
  organization: null,
  profile: null,
  impersonatedBy: null,
  status: 'loading', // loading | ready

  /** Stores the payload returned by login / register / OTP / Google / guest flows. */
  setSession: ({ user, organization, profile, tokens }) => {
    if (tokens?.accessToken) setAccessToken(tokens.accessToken);
    set({ user, organization: organization ?? null, profile: profile ?? null, status: 'ready' });
  },

  loadMe: async () => {
    const { data } = await http.get('/auth/me');
    set({ user: data.user, organization: data.organization ?? null, profile: data.profile ?? null, impersonatedBy: data.impersonatedBy ?? null, status: 'ready' });
    return data;
  },

  /** Restores the session from the httpOnly refresh cookie on page load. */
  bootstrap: async () => {
    if (!hasSessionHint()) return set({ status: 'ready' });
    try {
      await refreshSession();
      await get().loadMe();
    } catch (e) {
      // Only a rejected session logs the user out. A network blip must not end it.
      if (e.response?.status === 401) setAccessToken(null);
      set({ user: null, organization: null, profile: null, status: 'ready' });
    }
  },

  logout: async ({ allDevices = false } = {}) => {
    try {
      await http.post('/auth/logout', { allDevices });
    } catch {
      /* local logout still proceeds */
    }
    get().clear();
  },

  clear: () => {
    setAccessToken(null);
    set({ user: null, organization: null, profile: null, impersonatedBy: null, status: 'ready' });
  },
}));

setSessionExpiredHandler(() => useAuthStore.getState().clear());

export const isAdminRole = (role) => ADMIN_ROLES.includes(role);

/** Home route for a role after login. */
export const dashboardPath = (role) => (isAdminRole(role) ? '/admin/overview' : role === 'employer' ? '/employer/dashboard' : '/candidate/dashboard');

// Tag error reports with the signed-in user id and role (never e-mail or name).
useAuthStore.subscribe((s, prev) => {
  if (s.user?._id !== prev.user?._id) setMonitoringUser(s.user);
});

export default useAuthStore;
