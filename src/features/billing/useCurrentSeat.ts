// The signed-in user's seat, read LIVE.
//
// `useAuth().seat` is memoised against the `user` entity only, so a write to a `seat` row does not
// re-render it — the Billing screen changed the plan and the page kept showing the old one. This
// hook subscribes to the `seat` entity itself, so the plan, the banner and the read-only gate all
// move together. (Left as an additive hook rather than a change to AuthProvider, which other units
// are building on in parallel.)
import { useMemo } from 'react';
import { useList } from '@/db/provider';
import type { Seat } from '@/db/types';
import { useAuth } from '@/features/auth/AuthProvider';

export function useCurrentSeat(): Seat | null {
  const { user, seat: fallback } = useAuth();
  const seats = useList('seat');
  return useMemo(() => {
    if (!user) return null;
    const mine = seats.filter((s) => s.user_id === user.id).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return mine[0] || fallback || null;
  }, [seats, user, fallback]);
}
