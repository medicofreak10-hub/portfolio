import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export function useStatus() {
  return useQuery({ queryKey: ['status'], queryFn: () => api.get('/status'), refetchInterval: 60000 });
}
export function useLiveInterval() {
  const { data } = useStatus();
  return data?.market?.open ? 60000 : 5 * 60000;
}
export function useLive(key, url, opts = {}) {
  const interval = useLiveInterval();
  return useQuery({ queryKey: Array.isArray(key) ? key : [key], queryFn: () => api.get(url), refetchInterval: opts.interval ?? interval, ...opts });
}
export function useRefresh() {
  const qc = useQueryClient();
  return (keys) => (keys || [null]).forEach((k) => qc.invalidateQueries(k ? { queryKey: [k] } : undefined));
}
