import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { candidateApi, employerPublicApi, jobApi, lookupApi } from '../services';
import useAuthStore from '../store/useAuthStore';

/** All dropdowns of a form in one call: useLookups('gender','heard_from') -> { gender: ['Male',...] } */
export function useLookups(...types) {
  const { data } = useQuery({
    queryKey: ['lookups', types.join(',')],
    queryFn: () => lookupApi.bulk(types),
    staleTime: 5 * 60 * 1000,
  });
  return useMemo(() => Object.fromEntries(types.map((t) => [t, (data?.[t] || []).map((o) => o.name)])), [data]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function usePublicSettings() {
  const { data } = useQuery({ queryKey: ['settings-public'], queryFn: lookupApi.settings, staleTime: 5 * 60 * 1000 });
  return useMemo(() => {
    const out = {};
    for (const [key, value] of Object.entries(data || {})) {
      const [group, name] = key.split('.');
      out[group] = { ...out[group], [name]: value };
    }
    return out;
  }, [data]);
}

/** Mutation with toast + cache invalidation. `invalidate`: query key prefixes to refresh. */
export function useAction(fn, { success, invalidate = [], onSuccess, onError, silent } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      if (success) toast.success(typeof success === 'function' ? success(data, vars) : success);
      invalidate.forEach((key) => client.invalidateQueries({ queryKey: [key] }));
      onSuccess?.(data, vars);
    },
    onError: (error, vars) => {
      if (!silent) toast.error(error.message);
      onError?.(error, vars);
    },
  });
}

/** Paginated list state kept in the URL so back/forward and sharing work. */
export function useUrlFilters(defaults = {}) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => ({ ...defaults, ...Object.fromEntries(params) }), [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const setFilters = useCallback(
    (patch) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!('page' in patch)) next.delete('page');
          Object.entries(patch).forEach(([k, v]) => {
            if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) next.delete(k);
            else next.set(k, Array.isArray(v) ? v.join(',') : v);
          });
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [filters, setFilters];
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | Freejobwala` : 'Freejobwala – Find jobs, hire talent';
  }, [title]);
}

const isCandidate = () => useAuthStore.getState().user?.role === 'candidate';

/** Saved jobs / followed companies for logged-in candidates; guests go to login. */
export function useSaveJob(job) {
  const client = useQueryClient();
  const [saved, setSaved] = useState(Boolean(job?.isSaved));
  useEffect(() => setSaved(Boolean(job?.isSaved)), [job?.isSaved]);
  const toggle = async () => {
    if (!isCandidate()) {
      toast('Please log in as a candidate to save jobs');
      return false;
    }
    const next = !saved;
    setSaved(next);
    try {
      await (next ? jobApi.save(job._id) : jobApi.unsave(job._id));
      client.invalidateQueries({ queryKey: ['saved-jobs'] });
      client.invalidateQueries({ queryKey: ['candidate-dashboard'] });
      toast.success(next ? 'Job saved' : 'Removed from saved jobs');
    } catch (e) {
      setSaved(!next);
      toast.error(e.message);
    }
    return true;
  };
  return [saved, toggle];
}

export function useFollowing() {
  const user = useAuthStore((s) => s.user);
  const client = useQueryClient();
  const { data } = useQuery({
    queryKey: ['following'],
    queryFn: () => employerPublicApi.following({ limit: 200 }),
    enabled: user?.role === 'candidate',
    staleTime: 60 * 1000,
  });
  const ids = useMemo(() => new Set((data?.data || []).map((f) => f.organization?._id || f.organization)), [data]);
  const toggle = async (id) => {
    if (!isCandidate()) return toast('Please log in as a candidate to follow companies');
    try {
      await (ids.has(id) ? employerPublicApi.unfollow(id) : employerPublicApi.follow(id));
      client.invalidateQueries({ queryKey: ['following'] });
      toast.success(ids.has(id) ? 'Unfollowed' : 'Following. You will hear about new jobs');
    } catch (e) {
      toast.error(e.message);
    }
    return undefined;
  };
  return { ids, toggle };
}

export const useCandidateProfile = (options) => useQuery({ queryKey: ['candidate-me'], queryFn: candidateApi.me, ...options });
