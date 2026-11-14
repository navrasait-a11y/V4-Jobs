import useAuthStore from '../store/useAuthStore';

const useAuth = () => {
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  const profile = useAuthStore((s) => s.profile);
  const impersonatedBy = useAuthStore((s) => s.impersonatedBy);
  const logout = useAuthStore((s) => s.logout);
  const setSession = useAuthStore((s) => s.setSession);
  const loadMe = useAuthStore((s) => s.loadMe);
  return { user, organization, profile, impersonatedBy, logout, setSession, loadMe, isAuthenticated: Boolean(user) };
};

export default useAuth;

/** Employer team permission check (owner holds everything). */
export function useCan() {
  const user = useAuthStore((s) => s.user);
  return (...perms) => {
    if (!user?.employer) return false;
    if (user.employer.isOwner) return true;
    const granted = user.employer.permissions || [];
    return perms.some((p) => granted.includes(p));
  };
}
