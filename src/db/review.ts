// Supervisor review loop + outdated-record loop — repository-level helpers (U5).
//   review:    setReviewed / rejectRecord / markResubmitted (+ effectiveReview applied lazily on read)
//   outdated:  saveExerciseDetails (bumps Exercise.version, snapshots the previous Details, flags completions)
//              isOutdated / outdatedDiff / acknowledgeOutdated
//   save path: afterHandlerSave(type, id) — call from every handler save (U3/U4): resets a rejected /
//              reviewed record to Not Reviewed and raises the opt-in "ready for review / comments" notifications.
//   banners:   getSupervisorBanners(user) — Late Records / Not Reviewed / Live Tracks for U2's Records hub.
// Every write goes through Repository.upsert, so History rows appear automatically.
import { managedUserIds } from './access';
import { notify, notifyAll } from './notify';
import type { Repository } from './repository';
import type { ClassRecord, Completion, Deployment, Exercise, ExerciseDetails, ExerciseVersionSnapshot, ReviewFields, ReviewState, User, UUID } from './types';
import { deviceTimeZone, nowISO } from './util';
import { LATE_RECORD_DAYS } from './vocab';

export type ReviewableType = 'completion' | 'deployment' | 'class';
export type ReviewableRow = Completion | Deployment | ClassRecord;
const ENTITY = { completion: 'completion', deployment: 'deployment', class: 'class_record' } as const;
export const REVIEWABLE_LABEL: Record<ReviewableType, string> = { completion: 'Training record', deployment: 'Deployment record', class: 'Class record' };
const DAY = 86400000;

export function reviewEntityOf(type: ReviewableType) { return ENTITY[type]; }
export function getReviewable(repo: Repository, type: ReviewableType, id: UUID): ReviewableRow | undefined {
  return repo.getSync(ENTITY[type], id) as ReviewableRow | undefined;
}
/** The handler who owns a reviewable row. */
export function handlerOf(row: ReviewableRow): UUID {
  return (row as Completion).handler_id || row.owner_user_id;
}
/** Route of the standalone review view (exists regardless of merge order). */
export function reviewRoute(type: ReviewableType, id: UUID) { return `/review/${type}/${id}`; }
/** Route of the record's own editor (U3/U4). */
export function recordRoute(type: ReviewableType, row: ReviewableRow): string {
  if (type === 'completion') return `/records/training/${(row as Completion).event_id}?completion=${row.id}`;
  if (type === 'deployment') return `/records/deployment/${row.id}`;
  return `/records/class/${row.id}`;
}

// ---------- review state ----------
/** Lazy rule: a REJECTED record the handler edited after the review (updated_at > reviewed_at) reads as Not Reviewed. */
export function effectiveReview(row: Pick<ReviewFields, 'review' | 'reviewed_at'> & { updated_at: string }): ReviewState {
  if (row.review === 'rejected' && row.reviewed_at && row.updated_at > row.reviewed_at) return 'not_reviewed';
  return row.review;
}
/** True while the rejection banner should show: rejected and not re-saved since. */
export function isRejectedOpen(row: Pick<ReviewFields, 'review' | 'reviewed_at' | 'rejection_reason'> & { updated_at: string }): boolean {
  return effectiveReview(row) === 'rejected';
}

export async function setReviewed(repo: Repository, type: ReviewableType, id: UUID, supervisorId: UUID) {
  const at = nowISO();
  await repo.upsert(ENTITY[type], { id, review: 'reviewed', reviewed_by: supervisorId, reviewed_at: at, reviewed_tz: deviceTimeZone(), rejection_reason: null }, { actor_id: supervisorId, at, label: 'Review: reviewed' });
}

/** Set back to Not Reviewed explicitly (the trio's first button). */
export async function setNotReviewed(repo: Repository, type: ReviewableType, id: UUID, supervisorId: UUID) {
  const at = nowISO();
  await repo.upsert(ENTITY[type], { id, review: 'not_reviewed', reviewed_by: null, reviewed_at: null, reviewed_tz: null, rejection_reason: null }, { actor_id: supervisorId, at, label: 'Review: not reviewed' });
}

export type RejectResult = { ok: true } | { ok: false; error: string };
export async function rejectRecord(repo: Repository, type: ReviewableType, id: UUID, supervisorId: UUID, reason: string): Promise<RejectResult> {
  const text = (reason || '').trim();
  if (!text) return { ok: false, error: 'Please enter a rejection reason.' };
  const row = getReviewable(repo, type, id);
  if (!row) return { ok: false, error: 'Record not found.' };
  const at = nowISO();
  await repo.upsert(ENTITY[type], { id, review: 'rejected', reviewed_by: supervisorId, reviewed_at: at, reviewed_tz: deviceTimeZone(), rejection_reason: text }, { actor_id: supervisorId, at, label: 'Review: rejected' });
  const supervisor = repo.getSync('user', supervisorId);
  await notify(repo, {
    user_id: handlerOf(row),
    type: 'record_rejected',
    title: `${REVIEWABLE_LABEL[type]} rejected`,
    body: `${supervisor?.name || 'Your supervisor'} rejected this record with the following comments: “${text}”. Update the record and re-save to remove the Rejected status.`,
    link: reviewRoute(type, id),
    at,
  });
  return { ok: true };
}

/**
 * The handler re-saved a reviewed / rejected record → back to Not Reviewed so the supervisor reviews again.
 * Call from every handler save path (U3/U4) — afterHandlerSave() wraps it together with the opt-in notifications.
 */
export async function markResubmitted(repo: Repository, type: ReviewableType, id: UUID, opts: { actor_id?: UUID | null; at?: string } = {}) {
  const row = getReviewable(repo, type, id);
  if (!row || row.review === 'not_reviewed') return false;
  const at = opts.at || nowISO();
  await repo.upsert(ENTITY[type], { id, review: 'not_reviewed', reviewed_by: null, reviewed_at: null, reviewed_tz: null, rejection_reason: null }, { actor_id: opts.actor_id ?? handlerOf(row), at, label: 'Re-saved: back to Not Reviewed' });
  return true;
}

/** Supervisors of a handler (direct managers + the supervisors who manage those supervisors). */
export function supervisorsOf(repo: Repository, handlerId: UUID): UUID[] {
  const out = new Set<UUID>();
  for (const s of repo.snapshot('user')) {
    if (!s.roles.includes('supervisor') || s.id === handlerId) continue;
    if (managedUserIds(repo, s.id, 'supervisor').includes(handlerId)) out.add(s.id);
  }
  return [...out];
}
export function trainersOf(repo: Repository, handlerId: UUID): UUID[] {
  const out = new Set<UUID>();
  for (const t of repo.snapshot('user')) {
    if (!t.roles.includes('trainer') || t.id === handlerId) continue;
    if (managedUserIds(repo, t.id, 'trainer').includes(handlerId)) out.add(t.id);
  }
  return [...out];
}

/** Opt-in "ready for review" (supervisors) and "ready for comments" (trainers) notifications after a handler save. */
export async function notifyManagersOfSave(repo: Repository, type: ReviewableType, id: UUID) {
  const row = getReviewable(repo, type, id);
  if (!row) return { supervisors: 0, trainers: 0 };
  const handler = repo.getSync('user', handlerOf(row));
  const name = handler?.name || 'A handler';
  const link = reviewRoute(type, id);
  const supervisors = await notifyAll(repo, supervisorsOf(repo, handlerOf(row)), {
    type: type === 'deployment' ? 'deployment_ready_for_supervisor_review' : 'exercise_ready_for_supervisor_review',
    title: `${REVIEWABLE_LABEL[type]} ready for review`,
    body: `${name} saved a ${REVIEWABLE_LABEL[type].toLowerCase()} that is ready for your review.`,
    link,
  });
  const trainers = type === 'completion'
    ? await notifyAll(repo, trainersOf(repo, handlerOf(row)), { type: 'exercise_ready_for_comments', title: 'Exercise ready for comments', body: `${name} completed an exercise you can comment on.`, link })
    : 0;
  return { supervisors, trainers };
}

/** One call for every handler save path: reset review + notify opt-in managers. */
export async function afterHandlerSave(repo: Repository, type: ReviewableType, id: UUID, opts: { actor_id?: UUID | null } = {}) {
  const resubmitted = await markResubmitted(repo, type, id, opts);
  const notified = await notifyManagersOfSave(repo, type, id);
  return { resubmitted, ...notified };
}

// ---------- outdated (shared Exercise Details edited after completions) ----------
export const DETAIL_KEYS: (keyof ExerciseDetails)[] = ['name', 'kind', 'monitor', 'goal', 'patrol_types', 'environments', 'blank_controlled_negative'];
export function exerciseDetailsOf(ex: Exercise): ExerciseDetails {
  return { name: ex.name, kind: ex.kind, monitor: ex.monitor, goal: ex.goal, patrol_types: ex.patrol_types || [], environments: ex.environments || [], blank_controlled_negative: !!ex.blank_controlled_negative };
}
export function detailsChanged(a: ExerciseDetails, b: ExerciseDetails): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** True when the shared details moved on after this completion was saved. Read lazily — the flag column is a cache. */
export function isOutdated(repo: Repository, c: Pick<Completion, 'exercise_id' | 'exercise_version_seen' | 'is_outdated' | 'is_complete' | 'saved_at'>): boolean {
  if (!c.saved_at && !c.is_complete) return false; // never saved → nothing to be outdated
  const ex = repo.getSync('exercise', c.exercise_id);
  if (!ex) return !!c.is_outdated;
  return (ex.version || 1) > (c.exercise_version_seen || 1);
}

/**
 * Save the shared Details of an exercise. When completions have been saved against it, the previous
 * Details are snapshotted onto Exercise.versions[], version bumps, every saved completion is flagged
 * outdated (until its handler re-saves) and its handler is notified (Record Updates).
 */
export async function saveExerciseDetails(repo: Repository, exerciseId: UUID, patch: Partial<ExerciseDetails>, actorId: UUID): Promise<{ bumped: boolean; version: number; flagged: number }> {
  const ex = repo.getSync('exercise', exerciseId);
  if (!ex) throw new Error('Exercise not found');
  const before = exerciseDetailsOf(ex);
  const after: ExerciseDetails = { ...before, ...patch };
  if (!detailsChanged(before, after)) return { bumped: false, version: ex.version || 1, flagged: 0 };
  const at = nowISO();
  const saved = repo.snapshot('completion').filter((c) => c.exercise_id === exerciseId && (c.saved_at || c.is_complete));
  const currentVersion = ex.version || 1;
  if (!saved.length) {
    await repo.upsert('exercise', { id: exerciseId, ...after }, { actor_id: actorId, at, label: `${after.name} — details` });
    return { bumped: false, version: currentVersion, flagged: 0 };
  }
  // saved_at is the instant this version was superseded (the save instant), not the record's stale updated_at.
  const snapshot: ExerciseVersionSnapshot = { version: currentVersion, saved_at: at, tz: deviceTimeZone(), saved_by: ex.owner_user_id, details: before };
  const versions = [...(ex.versions || []).filter((v) => v.version !== currentVersion), snapshot];
  const version = currentVersion + 1;
  await repo.upsert('exercise', { id: exerciseId, ...after, version, versions }, { actor_id: actorId, at, label: `${after.name} — details (v${version})` });
  const actor = repo.getSync('user', actorId);
  const handlers = new Set<UUID>();
  for (const c of saved) {
    await repo.upsert('completion', { id: c.id, is_outdated: true }, { actor_id: actorId, at, label: 'Outdated: exercise details changed' });
    handlers.add(c.handler_id || c.owner_user_id);
  }
  await notifyAll(repo, [...handlers], {
    type: 'record_update',
    title: 'Exercise details changed',
    body: `${actor?.name || 'A trainer'} modified the details of “${after.name}” after you saved your completion. Your completion is outdated — review the changes and re-save.`,
    link: `/review/exercise/${exerciseId}`,
    at,
  });
  return { bumped: true, version, flagged: saved.length };
}

/** Handler acknowledges the new details: version seen = current, flag cleared, record re-saved (→ Not Reviewed if it was rejected). */
export async function acknowledgeOutdated(repo: Repository, completionId: UUID, actorId: UUID) {
  const c = repo.getSync('completion', completionId);
  if (!c) return;
  const ex = repo.getSync('exercise', c.exercise_id);
  const at = nowISO();
  await repo.upsert('completion', { id: completionId, exercise_version_seen: ex?.version || c.exercise_version_seen || 1, is_outdated: false, saved_at: at }, { actor_id: actorId, at, label: 'Acknowledged exercise changes & re-saved' });
  await afterHandlerSave(repo, 'completion', completionId, { actor_id: actorId });
}

/** Human lines for a Details block — the unit the red/green diff compares. */
export function detailsLines(d: ExerciseDetails): string[] {
  const lines: string[] = [];
  lines.push(`Name: ${d.name || '—'}`);
  lines.push(`Type: ${d.kind === 'detection' ? 'Detection' : 'Patrol'}`);
  if (d.monitor) lines.push(`Exercise Monitor: ${d.monitor}`);
  if (d.patrol_types?.length) lines.push(`Patrol Types: ${d.patrol_types.join(', ')}${d.patrol_types.length > 1 ? ' (Scenario)' : ''}`);
  if (d.kind === 'detection') lines.push(`Blank / Controlled Negative: ${d.blank_controlled_negative ? 'Yes' : 'No'}`);
  for (const env of d.environments || []) {
    lines.push(`Environment: ${env.env_type}${env.count ? ` ×${env.count}` : ''}${env.description ? ` — ${env.description}` : ''}`);
    for (const u of env.units || []) {
      lines.push(`  ${u.name}`);
      for (const o of u.odors || []) lines.push(`    Odor: ${o.category} · ${o.type}${o.amount != null ? ` · ${o.amount} ${o.unit}` : ''}${o.packaging ? ` · ${o.packaging}` : ''}${o.concealed ? ` · ${o.concealed}` : ''}`);
    }
  }
  const goal = (d.goal || '').trim();
  if (goal) {
    // sentence-level lines so a single amended sentence shows as one red + one green line
    const sentences = goal.split(/(?<=[.!?])\s+/).filter(Boolean);
    lines.push('Goal:');
    for (const s of sentences) lines.push(`  ${s}`);
  }
  return lines;
}

export type DiffLine = { kind: 'same' | 'del' | 'add'; text: string };
/** Line diff (LCS). Red (del) = previous, green (add) = current. */
export function lineDiff(prev: string[], next: string[]): DiffLine[] {
  const n = prev.length, m = next.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = prev[i] === next[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (prev[i] === next[j]) { out.push({ kind: 'same', text: prev[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: 'del', text: prev[i] }); i++; }
    else { out.push({ kind: 'add', text: next[j] }); j++; }
  }
  while (i < n) out.push({ kind: 'del', text: prev[i++] });
  while (j < m) out.push({ kind: 'add', text: next[j++] });
  return out;
}

/** The snapshot a completion last saw (its exercise_version_seen) vs the current details. */
export function outdatedDiff(repo: Repository, c: Completion): { previous: ExerciseVersionSnapshot | null; current: ExerciseDetails; diff: DiffLine[]; changedBy: User | undefined } | null {
  const ex = repo.getSync('exercise', c.exercise_id);
  if (!ex) return null;
  const seen = c.exercise_version_seen || 1;
  const versions = ex.versions || [];
  const previous = versions.find((v) => v.version === seen) || [...versions].reverse().find((v) => v.version <= seen) || versions[0] || null;
  const current = exerciseDetailsOf(ex);
  const diff = lineDiff(previous ? detailsLines(previous.details) : [], detailsLines(current));
  const lastEditor = repo.snapshot('history_event').filter((h) => h.entity === 'exercise' && h.entity_id === ex.id && h.action === 'modify').sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const changedBy = lastEditor ? repo.getSync('user', lastEditor.actor_id) : repo.getSync('user', ex.owner_user_id);
  return { previous, current, diff, changedBy };
}

// ---------- "late" — ONE definition, used by Manage and by the review queue ----------
/**
 * A record is LATE when its exercise completion is still not saved LATE_RECORD_DAYS (7) days after the
 * event — the same threshold as the "Exercise Completions … 7 days past due" notification.
 * Manage's Late Records column and the queue's LATE RECORDS banner both read this helper, so the two
 * numbers can never drift apart. ("No complete training in 30 days" is a different, handler-level flag:
 * it is surfaced as NO TRAINING IN 30 DAYS, never as "late".)
 */
export const LATE_RULE_TEXT = `an exercise completion still not saved ${LATE_RECORD_DAYS} days after the event`;
export function isLateCompletion(repo: Repository, c: Completion, nowMs = Date.now()): boolean {
  if (c.is_complete || c.saved_at) return false;
  const ev = repo.getSync('training_event', c.event_id);
  const when = new Date(ev?.starts_at || c.created_at).getTime();
  return nowMs - when > LATE_RECORD_DAYS * DAY;
}
/** Late completions of the given handlers, optionally limited to a window (ms since epoch). */
export function lateCompletionsOf(repo: Repository, handlerIds: Iterable<UUID>, opts: { sinceMs?: number; nowMs?: number } = {}): Completion[] {
  const now = opts.nowMs ?? Date.now();
  const ids = new Set(handlerIds);
  const out: Completion[] = [];
  for (const c of repo.snapshot('completion')) {
    if (!ids.has(c.handler_id || c.owner_user_id)) continue;
    if (opts.sinceMs != null) {
      const ev = repo.getSync('training_event', c.event_id);
      if (new Date(ev?.starts_at || c.created_at).getTime() < opts.sinceMs) continue;
    }
    if (isLateCompletion(repo, c, now)) out.push(c);
  }
  return out;
}

// ---------- supervisor banners (Records hub, U2) ----------
export interface SupervisorBanners {
  late: { count: number; items: Completion[] };
  notReviewed: { count: number; items: Array<{ type: ReviewableType; row: ReviewableRow }> };
  liveTracks: { count: number; items: UUID[] };
  /** Handlers with no complete training in the last 30 days (Manage "Late" flag). */
  inactiveHandlers: UUID[];
}
export function getSupervisorBanners(repo: Repository, user: Pick<User, 'id'>, opts: { months?: number; now?: number } = {}): SupervisorBanners {
  const now = opts.now ?? Date.now();
  const since = now - (opts.months ?? 3) * 30 * DAY;
  const managed = new Set(managedUserIds(repo, user.id, 'supervisor'));
  const late: Completion[] = [];
  const notReviewed: SupervisorBanners['notReviewed']['items'] = [];
  for (const c of repo.snapshot('completion')) {
    const h = c.handler_id || c.owner_user_id;
    if (!managed.has(h)) continue;
    const ev = repo.getSync('training_event', c.event_id);
    const when = ev ? new Date(ev.starts_at).getTime() : new Date(c.created_at).getTime();
    if (when < since) continue;
    if (!c.is_complete && !c.saved_at) { if (isLateCompletion(repo, c, now)) late.push(c); continue; }
    if (effectiveReview(c) === 'not_reviewed') notReviewed.push({ type: 'completion', row: c });
  }
  for (const d of repo.snapshot('deployment')) {
    if (!managed.has(d.handler_id || d.owner_user_id)) continue;
    if (new Date(d.occurred_at).getTime() < since) continue;
    if (d.is_complete && effectiveReview(d) === 'not_reviewed') notReviewed.push({ type: 'deployment', row: d });
  }
  for (const k of repo.snapshot('class_record')) {
    if (!managed.has(k.owner_user_id)) continue;
    if (new Date(k.occurred_at).getTime() < since) continue;
    if (k.is_complete && effectiveReview(k) === 'not_reviewed') notReviewed.push({ type: 'class', row: k });
  }
  const liveTracks = repo.snapshot('track').filter((t) => managed.has(t.owner_user_id) && (t.status === 'active' || (t.started_at && now - new Date(t.started_at).getTime() < 3 * DAY && t.status !== 'discarded'))).map((t) => t.id);
  const inactiveHandlers: UUID[] = [];
  for (const h of managed) {
    const u = repo.getSync('user', h);
    if (!u?.roles.includes('handler')) continue;
    const recent = repo.snapshot('completion').some((c) => (c.handler_id || c.owner_user_id) === h && (c.is_complete || c.saved_at) && now - new Date(c.saved_at || c.updated_at).getTime() <= 30 * DAY);
    if (!recent) inactiveHandlers.push(h);
  }
  return { late: { count: late.length, items: late }, notReviewed: { count: notReviewed.length, items: notReviewed }, liveTracks: { count: liveTracks.length, items: liveTracks }, inactiveHandlers };
}
