// Manage page numbers per handler: Last 3 Months (Late Records · Training Hours · Total Deploys),
// Training By Month (12 bars, green ≥ 16 h) and Deployments By Month, last record date, inactive flags.
// Training hours = the duration of every event the handler saved at least one completion for
// (one attendance = one duration, however many exercises), bucketed by the event's month.
import type { Repository } from '@/db/repository';
import { isLateCompletion } from '@/db/review';
import type { Seat, User, UUID } from '@/db/types';
import { INACTIVE_TRAINING_DAYS, TRAINING_HOURS_GREEN } from '@/db/vocab';

const DAY = 86400000;
export interface MonthBucket { key: string; label: string; hours: number; deploys: number; green: boolean }
export interface HandlerStats {
  user: User;
  agencyName: string;
  dogs: number;
  lastRecordAt: string | null;
  late3m: number;
  hours3m: number;
  deploys3m: number;
  months: MonthBucket[]; // 12, oldest → newest (current month last)
  hoursThisMonth: number;
  deploysThisMonth: number;
  /** No complete training saved in the last 30 days — an activity flag, NOT the "late" rule (see db/review.ts). */
  noTraining30d: boolean;
  /** No active subscription (seat) — hidden unless "Show Inactive". */
  inactive: boolean;
  seat: Seat | null;
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d: Date) => d.toLocaleString('en-US', { month: 'short' });

export function monthBuckets(now = new Date()): MonthBucket[] {
  const out: MonthBucket[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: monthKey(d), label: monthLabel(d), hours: 0, deploys: 0, green: false });
  }
  return out;
}

export function activeSeatOf(repo: Repository, userId: UUID, nowMs = Date.now()): Seat | null {
  const seats = repo.snapshot('seat').filter((s) => s.user_id === userId).sort((a, b) => (a.ends < b.ends ? 1 : -1));
  const s = seats[0] || null;
  return s;
}
export function isActiveHandler(repo: Repository, userId: UUID, nowMs = Date.now()): boolean {
  const s = activeSeatOf(repo, userId, nowMs);
  return !!s && s.status === 'active' && new Date(s.ends).getTime() >= nowMs;
}

export function handlerStats(repo: Repository, handlerId: UUID, now = new Date()): HandlerStats | null {
  const user = repo.getSync('user', handlerId);
  if (!user) return null;
  const nowMs = now.getTime();
  const since3m = nowMs - 90 * DAY;
  const months = monthBuckets(now);
  const byKey = new Map(months.map((m) => [m.key, m]));
  const dogs = repo.snapshot('dog').filter((d) => d.owner_user_id === handlerId).length;
  let last: string | null = null;
  const bump = (iso: string | null | undefined) => { if (iso && (!last || iso > last)) last = iso; };

  // training: one duration per attended event
  const eventsSeen = new Map<UUID, { starts: string; minutes: number }>();
  let late3m = 0;
  let recentTraining = false;
  for (const c of repo.snapshot('completion')) {
    if ((c.handler_id || c.owner_user_id) !== handlerId) continue;
    const ev = repo.getSync('training_event', c.event_id);
    const starts = ev?.starts_at || c.created_at;
    const startsMs = new Date(starts).getTime();
    const saved = !!(c.is_complete || c.saved_at);
    if (!saved) {
      // ONE definition of late (db/review.ts): a completion still not saved 7 days after the event.
      if (startsMs >= since3m && isLateCompletion(repo, c, nowMs)) late3m++;
      continue;
    }
    bump(c.saved_at || c.updated_at);
    if (nowMs - new Date(c.saved_at || c.updated_at).getTime() <= INACTIVE_TRAINING_DAYS * DAY) recentTraining = true;
    if (!eventsSeen.has(c.event_id)) {
      let minutes = ev?.duration_min ?? null;
      if (minutes == null && c.start_at && c.end_at) minutes = Math.max(0, (new Date(c.end_at).getTime() - new Date(c.start_at).getTime()) / 60000);
      eventsSeen.set(c.event_id, { starts, minutes: minutes || 0 });
    }
  }
  let hours3m = 0;
  for (const { starts, minutes } of eventsSeen.values()) {
    const d = new Date(starts);
    const b = byKey.get(monthKey(d));
    if (b) b.hours += minutes / 60;
    if (d.getTime() >= since3m) hours3m += minutes / 60;
  }
  let deploys3m = 0;
  for (const dp of repo.snapshot('deployment')) {
    if ((dp.handler_id || dp.owner_user_id) !== handlerId) continue;
    bump(dp.submitted_at || dp.updated_at);
    const d = new Date(dp.occurred_at);
    const b = byKey.get(monthKey(d));
    if (b) b.deploys++;
    if (d.getTime() >= since3m) deploys3m++;
  }
  for (const k of repo.snapshot('class_record')) if (k.owner_user_id === handlerId) bump(k.updated_at);
  for (const v of repo.snapshot('vet_visit')) if (v.owner_user_id === handlerId) bump(v.updated_at);
  for (const m of months) { m.hours = Math.round(m.hours * 10) / 10; m.green = m.hours >= TRAINING_HOURS_GREEN; }
  const cur = months[months.length - 1];
  const seat = activeSeatOf(repo, handlerId, nowMs);
  return {
    user,
    agencyName: (user.agency_id ? repo.getSync('agency', user.agency_id)?.name : null) || user.department || '',
    dogs,
    lastRecordAt: last,
    late3m,
    hours3m: Math.round(hours3m * 10) / 10,
    deploys3m,
    months,
    hoursThisMonth: cur.hours,
    deploysThisMonth: cur.deploys,
    noTraining30d: !recentTraining,
    inactive: !isActiveHandler(repo, handlerId, nowMs),
    seat,
  };
}

/** Records + History counts for one handler — used to prove remove / transfer keeps everything. */
export function handlerRecordCounts(repo: Repository, handlerId: UUID) {
  const own = (rows: { owner_user_id: string; handler_id?: string }[]) => rows.filter((r) => (r.handler_id || r.owner_user_id) === handlerId).length;
  const completions = own(repo.snapshot('completion'));
  const deployments = own(repo.snapshot('deployment'));
  const classes = own(repo.snapshot('class_record'));
  const vet = own(repo.snapshot('vet_visit'));
  const history = repo.snapshot('history_event').filter((h) => h.owner_user_id === handlerId || h.actor_id === handlerId).length;
  return { completions, deployments, classes, vet, records: completions + deployments + classes + vet, history };
}
