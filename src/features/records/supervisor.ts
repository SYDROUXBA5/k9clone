// Supervisor banners — Late Records / Not Reviewed / Live Tracks. Counts only; the review ACTIONS live in U5.
import type { ClassRecord, Completion, Deployment, Track, User } from '@/db/types';
import { DAY_MS, LATE_RECORDS_HANDLER_DAYS, LIVE_TRACKS_DAYS, SUPERVISOR_WINDOW_MONTHS } from './constants';

export interface SupervisorAlerts {
  lateHandlers: { id: string; name: string; lastTrainingAt: string | null }[];
  notReviewed: number;
  notReviewedBreakdown: { completions: number; deployments: number; classes: number };
  liveTracks: number;
  windowLabel: string;
  lateDays: number;
}

export function monthsAgo(now: number, months: number): number {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d.getTime();
}

export function getSupervisorAlerts(input: {
  managedIds: string[]; // handlers managed by this supervisor (never the supervisor)
  users: User[];
  completions: Completion[];
  deployments: Deployment[];
  classes: ClassRecord[];
  tracks: Track[];
  now: number;
}): SupervisorAlerts {
  const managed = new Set(input.managedIds);
  const since = monthsAgo(input.now, SUPERVISOR_WINDOW_MONTHS);
  const inWindow = (iso: string | null | undefined) => !!iso && new Date(iso).getTime() >= since;

  // Late Records [OURS, docs/DECISIONS.md E9]: managed handlers with no complete training record in the last N days
  // (the reference only captions the banner `Last 3 Months`; its exact rule is not documented).
  const lateCut = input.now - LATE_RECORDS_HANDLER_DAYS * DAY_MS;
  const lastByHandler = new Map<string, string>();
  for (const c of input.completions) {
    if (!managed.has(c.handler_id) || !c.is_complete) continue;
    const at = c.saved_at || c.start_at || c.created_at;
    const cur = lastByHandler.get(c.handler_id);
    if (!cur || cur < at) lastByHandler.set(c.handler_id, at);
  }
  const lateHandlers = input.managedIds
    .filter((id) => { const last = lastByHandler.get(id); return !last || new Date(last).getTime() < lateCut; })
    .map((id) => ({ id, name: input.users.find((u) => u.id === id)?.name || id, lastTrainingAt: lastByHandler.get(id) || null }));

  // Only SAVED completions (is_complete) can be reviewed — drafts a handler has not finished are not counted.
  const completions = input.completions.filter((c) => managed.has(c.handler_id) && c.is_complete && c.review === 'not_reviewed' && inWindow(c.start_at || c.saved_at || c.created_at)).length;
  const deployments = input.deployments.filter((d) => managed.has(d.handler_id) && d.review === 'not_reviewed' && inWindow(d.occurred_at)).length;
  const classes = input.classes.filter((c) => managed.has(c.owner_user_id) && c.review === 'not_reviewed' && inWindow(c.occurred_at)).length;

  const trackCut = input.now - LIVE_TRACKS_DAYS * DAY_MS;
  const liveTracks = input.tracks.filter((t) => managed.has(t.owner_user_id) && t.status !== 'discarded' && (t.status === 'active' || (t.started_at ? new Date(t.started_at).getTime() >= trackCut : false))).length;

  return {
    lateHandlers,
    notReviewed: completions + deployments + classes,
    notReviewedBreakdown: { completions, deployments, classes },
    liveTracks,
    windowLabel: `Last ${SUPERVISOR_WINDOW_MONTHS} Months`,
    lateDays: LATE_RECORDS_HANDLER_DAYS,
  };
}
