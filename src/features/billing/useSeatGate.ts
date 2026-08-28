// useSeatGate() — the ONE answer to "may this person edit records right now?".
//
// Before U7 the trial banner and the record forms disagreed: the banner said "read-only until a
// subscription is active" while every form still saved (DECISIONS E19). The gate below makes the
// banner true: a screen asks it once, gets `readOnly` and a `reason`, and locks its inputs.
// Every record screen should consult this hook — U7's own screens do; U3/U4 adopt it at merge.
import { useMemo } from 'react';
import type { Role, Seat } from '@/db/types';
import { useAuth } from '@/features/auth/AuthProvider';
import { describeSeat, type SeatState } from './billingModel';
import { useCurrentSeat } from './useCurrentSeat';

export interface SeatGate {
  /** Records must not be editable. */
  readOnly: boolean;
  /** Sentence for the banner — never empty when `readOnly`. */
  reason: string;
  state: SeatState;
  seat: Seat | null;
  daysLeft: number;
  /** True when the block is the seat (not the role) — the banner offers a Billing link. */
  isBilling: boolean;
}

export interface SeatGateOptions {
  /** Owner of the record being viewed; a supervisor/trainer never edits someone else's data. */
  ownerId?: string | null;
  /** Roles allowed to edit at all (default: handler only). */
  editableBy?: Role[];
}

export function useSeatGate(opts: SeatGateOptions = {}): SeatGate {
  const { user, role } = useAuth();
  const seat = useCurrentSeat();
  const { ownerId, editableBy = ['handler'] } = opts;
  return useMemo(() => {
    const view = describeSeat(seat);
    const base = { state: view.state, seat: seat ?? null, daysLeft: view.daysLeft };
    if (!user || !role) return { ...base, readOnly: true, reason: 'Sign in to edit records.', isBilling: false };
    if (!editableBy.includes(role)) {
      return { ...base, readOnly: true, reason: 'Supervisors and trainers can view and review handler records, but never edit handler data.', isBilling: false };
    }
    if (ownerId && ownerId !== user.id) {
      return { ...base, readOnly: true, reason: 'You can only edit your own records.', isBilling: false };
    }
    // Only handlers hold a paid seat — trainer / supervisor / billing manager are free.
    if (role === 'handler' && view.readOnly) {
      return {
        ...base,
        readOnly: true,
        isBilling: true,
        reason: view.state === 'none'
          ? 'This account has no subscription, so records are read-only. Existing records stay viewable and reportable.'
          : view.state === 'canceled_overdue'
            ? `Your subscription is canceled and overdue — Balance Due: $${view.balanceDueUSD.toFixed(2)}. Records are read-only until the balance is settled. Existing records stay viewable and reportable.`
            : `${seat?.plan === 'trial' ? 'Your 30-day trial has ended' : 'Your subscription has expired'} — records are read-only until a subscription is active. Existing records stay viewable and reportable.`,
      };
    }
    return { ...base, readOnly: false, reason: '', isBilling: false };
  }, [user, role, seat, ownerId, editableBy]);
}
