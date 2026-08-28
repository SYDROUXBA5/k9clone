// Records hub model — turns repository rows into the list the hub renders: one HubRecord per event /
// deployment / class / vet visit, each with child rows (exercise rows, per-handler rows for
// supervisors and trainers). Pure functions, no React: cheap to unit-test and to memoise.
import type { Ionicons } from '@expo/vector-icons';
import type {
  ClassRecord, Completion, Deployment, Dog, EntityName, Exercise, ReviewState, Role, TrainerComment, TrainingEvent, User, VetVisit,
} from '@/db/types';
import { DAY_MS } from './constants';
import { dayKeyInZone, monthKeyInZone, monthLabel, monthTitle, truncate } from './format';

export type HubKind = 'training' | 'deployment' | 'class' | 'vet';
export type DerivedStatus = 'incomplete' | 'rejected' | 'outdated' | 'reviewed' | 'not_reviewed' | 'complete' | 'upcoming' | 'due';
export type IconName = keyof typeof Ionicons.glyphMap;

export interface HubRow {
  id: string;
  kind: HubKind;
  entity: EntityName;
  entityId: string;
  icon: IconName;
  title: string;
  subtitle: string;
  dogIds: string[];
  dogNames: string[];
  handlerId: string | null;
  handlerName: string;
  status: DerivedStatus;
  statusLabel?: string;
  review: ReviewState | null;
  isOutdated: boolean;
  isIncomplete: boolean;
  isRejected: boolean;
  completionIds: string[];
  reportType: string;
  reportId: string;
  routeView: string;
  routeEdit: string;
  canEdit: boolean;
  canDelete: boolean;
  workMode: 'detection' | 'patrol' | null;
  patrolTypes: string[];
}

export interface HubRecord {
  id: string;
  kind: HubKind;
  entity: EntityName;
  at: string;
  tz: string;
  dayKey: string;
  monthKey: string;
  isUpcoming: boolean;
  title: string;
  location: string;
  ownerId: string;
  handlerIds: string[];
  handlerNames: string[];
  dogIds: string[];
  dogNames: string[];
  attendance: { label: string; tone: 'success' | 'warning' | 'muted' | 'danger'; undecided: boolean } | null;
  rows: HubRow[];
  // derived across rows
  isIncomplete: boolean;
  hasRejected: boolean;
  hasOutdated: boolean;
  workModes: ('detection' | 'patrol')[];
  patrolTypes: string[];
  odorTerms: string[];
  tags: string[];
  requestingUnit: string;
  hasArrests: boolean;
  vaccineDue: boolean;
  /** Handler comments / notes / summary text (lower-cased) — the `Comment` advanced filter. */
  commentText: string;
  /** Trainer comments appended to this record's rows (lower-cased) — the `Trainer Comments` advanced filter. */
  trainerCommentText: string;
  searchText: string;
  routeView: string;
  routeEdit: string;
  routeAddExercise?: string;
  reportType: string;
  reportId: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface HubContext {
  userId: string;
  role: Role;
  visibleIds: string[];
  now: number;
  users: User[];
  dogs: Dog[];
  events: TrainingEvent[];
  exercises: Exercise[];
  completions: Completion[];
  deployments: Deployment[];
  classes: ClassRecord[];
  vets: VetVisit[];
  vaccineDueVisitIds?: Set<string>;
  trainerComments?: TrainerComment[];
}

const PATROL_ICON: Record<string, IconName> = {
  Obedience: 'megaphone-outline',
  'Agility / Obstacle Course': 'trending-up-outline',
  'Criminal Apprehension / Aggression Control': 'walk-outline',
  'Area Search for Humans': 'people-outline',
  'Area Search for Evidence': 'finger-print-outline',
  'Evidence Search': 'finger-print-outline',
  'Building Search': 'business-outline',
  Tracking: 'footsteps-outline',
  'Non-Search': 'walk-outline',
  Other: 'ellipsis-horizontal-circle-outline',
};
export const KIND_ICON: Record<HubKind, IconName> = {
  training: 'calendar-outline',
  deployment: 'shield-half-outline',
  class: 'school-outline',
  vet: 'medkit-outline',
};
export const KIND_LABEL: Record<HubKind, string> = { training: 'Training', deployment: 'Deployment', class: 'Class', vet: 'Vet Visit' };

export function exerciseIcon(ex: { kind: string; patrol_types: string[] }): IconName {
  if (ex.kind === 'detection') return 'search-outline';
  if (ex.patrol_types.length > 1) return 'layers-outline';
  return PATROL_ICON[ex.patrol_types[0]] || 'ribbon-outline';
}

/** `Detection: Drugs` / `Detection: Proofing Only` / `Patrol: Obedience` / `Patrol: Multiple Types`. */
export function exerciseSubtitle(ex: Exercise): string {
  if (ex.kind === 'detection') {
    const cats = new Set<string>();
    for (const env of ex.environments || []) for (const u of env.units || []) for (const o of u.odors || []) if (o.category) cats.add(o.category);
    if (ex.blank_controlled_negative) return 'Detection: Controlled Negative';
    return cats.size ? `Detection: ${[...cats].join(', ')}` : 'Detection: Proofing Only';
  }
  if (ex.patrol_types.length > 1) return 'Patrol: Multiple Types';
  return `Patrol: ${ex.patrol_types[0] || 'Other'}`;
}

function odorTermsOf(ex: Exercise): string[] {
  const out: string[] = [];
  for (const env of ex.environments || []) for (const u of env.units || []) for (const o of u.odors || []) { if (o.category) out.push(o.category); if (o.type) out.push(o.type); }
  return out;
}

/** Aggregate one handler's completions of one exercise into a status. */
export function deriveStatus(completions: Completion[], applicable: number, upcoming: boolean): { status: DerivedStatus; label?: string; review: ReviewState | null; outdated: boolean; incomplete: boolean; rejected: boolean } {
  const m = Math.max(applicable, completions.length);
  const complete = completions.filter((c) => c.is_complete).length;
  if (upcoming && completions.length === 0) return { status: 'upcoming', label: 'Upcoming', review: null, outdated: false, incomplete: false, rejected: false };
  if (m === 0 || complete < m) {
    // An incomplete row still carries the review shield of what HAS been saved (grey outline = not reviewed),
    // so the supervisor "Not Reviewed" banner count and the Reviewed / Not Reviewed filter agree row for row.
    // Only SAVED (is_complete) completions carry a review state a supervisor can act on; drafts do not.
    const saved = completions.filter((c) => c.is_complete);
    const savedRejected = saved.some((c) => c.review === 'rejected');
    const review: ReviewState | null = saved.length === 0 ? null : savedRejected ? 'rejected' : saved.every((c) => c.review === 'reviewed') ? 'reviewed' : 'not_reviewed';
    return { status: 'incomplete', label: m > 1 && complete > 0 ? `${complete}/${m} Complete` : 'Incomplete', review, outdated: completions.some((c) => c.is_outdated), incomplete: true, rejected: savedRejected };
  }
  const rejected = completions.some((c) => c.review === 'rejected');
  const outdated = completions.some((c) => c.is_outdated);
  const allReviewed = completions.every((c) => c.review === 'reviewed');
  if (rejected) return { status: 'rejected', review: 'rejected', outdated, incomplete: false, rejected: true };
  if (outdated) return { status: 'outdated', review: allReviewed ? 'reviewed' : 'not_reviewed', outdated: true, incomplete: false, rejected: false };
  if (allReviewed) return { status: 'reviewed', review: 'reviewed', outdated: false, incomplete: false, rejected: false };
  return { status: 'not_reviewed', review: 'not_reviewed', outdated: false, incomplete: false, rejected: false };
}

function singleStatus(row: { review: ReviewState; is_complete: boolean }): { status: DerivedStatus; review: ReviewState; incomplete: boolean; rejected: boolean } {
  if (!row.is_complete) return { status: 'incomplete', review: row.review, incomplete: true, rejected: row.review === 'rejected' };
  if (row.review === 'rejected') return { status: 'rejected', review: row.review, incomplete: false, rejected: true };
  if (row.review === 'reviewed') return { status: 'reviewed', review: row.review, incomplete: false, rejected: false };
  return { status: 'not_reviewed', review: row.review, incomplete: false, rejected: false };
}

function dogApplies(dog: Dog, ex: Exercise): boolean {
  if (ex.kind === 'detection') return dog.odor_types.length > 0;
  return ex.patrol_types.length > 0 && ex.patrol_types.every((p) => dog.patrol_types.includes(p));
}

export function buildHubRecords(ctx: HubContext): HubRecord[] {
  const { userId, role, now } = ctx;
  const visible = new Set(ctx.visibleIds);
  const userById = new Map(ctx.users.map((u) => [u.id, u]));
  const dogById = new Map(ctx.dogs.map((d) => [d.id, d]));
  const nameOf = (id: string | null | undefined) => (id ? userById.get(id)?.name || 'Unknown handler' : '');
  const dogName = (id: string) => dogById.get(id)?.name || 'Unknown dog';
  const dogsOfHandler = (uid: string) => ctx.dogs.filter((d) => d.owner_user_id === uid && d.status !== 'retired');
  const isSupervisor = role === 'supervisor';
  const isTrainer = role === 'trainer';
  const out: HubRecord[] = [];

  // ---- training events ----
  const exByEvent = new Map<string, Exercise[]>();
  for (const ex of ctx.exercises) {
    const list = exByEvent.get(ex.event_id);
    if (list) list.push(ex); else exByEvent.set(ex.event_id, [ex]);
  }
  const cpByExercise = new Map<string, Completion[]>();
  for (const cp of ctx.completions) {
    const list = cpByExercise.get(cp.exercise_id);
    if (list) list.push(cp); else cpByExercise.set(cp.exercise_id, [cp]);
  }
  const cpHandlersByEvent = new Map<string, Set<string>>();
  for (const cp of ctx.completions) {
    let s = cpHandlersByEvent.get(cp.event_id);
    if (!s) { s = new Set(); cpHandlersByEvent.set(cp.event_id, s); }
    s.add(cp.handler_id);
  }

  const tcByRecord = new Map<string, string[]>();
  for (const tc of ctx.trainerComments || []) {
    const k = `${tc.record_type}:${tc.record_id}`;
    const l = tcByRecord.get(k);
    if (l) l.push(tc.text || ''); else tcByRecord.set(k, [tc.text || '']);
  }
  const trainerTextFor = (type: 'completion' | 'deployment' | 'class', ids: string[]) => ids.flatMap((id) => tcByRecord.get(`${type}:${id}`) || []).join(' ').toLowerCase();

  for (const ev of ctx.events) {
    const inviteeIds = ev.invitees.map((i) => i.user_id);
    const cpHandlers = cpHandlersByEvent.get(ev.id) || new Set<string>();
    let include = false;
    let handlerScope: Set<string>;
    if (isSupervisor) {
      handlerScope = new Set([...inviteeIds, ...cpHandlers].filter((h) => visible.has(h)));
      include = handlerScope.size > 0;
    } else if (isTrainer) {
      const isLeader = ev.invitees.some((i) => i.user_id === userId && i.is_leader);
      include = ev.owner_user_id === userId || isLeader || inviteeIds.includes(userId);
      handlerScope = new Set([...inviteeIds, ...cpHandlers]);
    } else {
      include = ev.owner_user_id === userId || inviteeIds.includes(userId) || cpHandlers.has(userId);
      // A handler who "deleted" a shared event from her records no longer sees it (unless she saved new completions since).
      if ((ev.removed_for || []).includes(userId) && !cpHandlers.has(userId)) include = false;
      handlerScope = new Set([userId]);
    }
    if (!include) continue;
    const upcoming = new Date(ev.starts_at).getTime() > now;
    const exercises = (exByEvent.get(ev.id) || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    const isLeaderOrOwner = ev.owner_user_id === userId || ev.invitees.some((i) => i.user_id === userId && i.is_leader);
    const canEdit = !isSupervisor && (isLeaderOrOwner || (!isTrainer && inviteeIds.includes(userId)));
    const canDelete = !isSupervisor && isLeaderOrOwner;
    const rows: HubRow[] = [];
    const recDogIds = new Set<string>();
    const recHandlerIds = new Set<string>();
    const workModes = new Set<'detection' | 'patrol'>();
    const patrolTypes = new Set<string>();
    const odorTerms: string[] = [];
    const haystack: string[] = [ev.name, ev.location?.name || '', ev.location?.address || '', ...(ev.tags || []), ev.comments_to_group || ''];
    const commentParts: string[] = [];
    const completionIdsSeen: string[] = [];

    for (const ex of exercises) {
      workModes.add(ex.kind);
      ex.patrol_types.forEach((p) => patrolTypes.add(p));
      odorTerms.push(...odorTermsOf(ex));
      haystack.push(ex.name, ex.goal || '', ex.monitor || '');
      const cps = (cpByExercise.get(ex.id) || []).filter((c) => handlerScope.has(c.handler_id));
      const subtitle = exerciseSubtitle(ex);
      const icon = exerciseIcon(ex);
      const exOwner = ex.created_by === userId || ex.owner_user_id === userId;
      const rowCanEdit = !isSupervisor && (isLeaderOrOwner || exOwner || (!isTrainer && cps.some((c) => c.handler_id === userId)));
      const rowCanDelete = !isSupervisor && (isLeaderOrOwner || exOwner || (!isTrainer && cps.some((c) => c.handler_id === userId)));
      const routeView = `/records/training/${ev.id}?exercise=${ex.id}`;
      const routeEdit = `/records/training/${ev.id}?exercise=${ex.id}&mode=edit`;
      if (isSupervisor || isTrainer) {
        // one row per handler with completions (plus, when nothing is saved yet, one row for the exercise itself)
        const byHandler = new Map<string, Completion[]>();
        for (const c of cps) { const l = byHandler.get(c.handler_id); if (l) l.push(c); else byHandler.set(c.handler_id, [c]); }
        if (byHandler.size === 0) {
          rows.push({
            id: `${ex.id}`, kind: 'training', entity: 'exercise', entityId: ex.id, icon, title: ex.name, subtitle,
            dogIds: [], dogNames: [], handlerId: null, handlerName: upcoming ? '' : '—',
            ...pack(deriveStatus([], 0, upcoming)),
            completionIds: [], reportType: 'full_exercise', reportId: ex.id, routeView, routeEdit, canEdit: rowCanEdit, canDelete: rowCanDelete,
            workMode: ex.kind, patrolTypes: ex.patrol_types,
          });
        }
        for (const [hid, list] of byHandler) {
          recHandlerIds.add(hid);
          const dIds = [...new Set(list.map((c) => c.dog_id))];
          dIds.forEach((d) => recDogIds.add(d));
          for (const c of list) { haystack.push(c.comments || ''); commentParts.push(c.comments || '', c.summary || ''); completionIdsSeen.push(c.id); }
          rows.push({
            id: `${ex.id}:${hid}`, kind: 'training', entity: 'exercise', entityId: ex.id, icon, title: ex.name, subtitle,
            dogIds: dIds, dogNames: dIds.map(dogName), handlerId: hid, handlerName: nameOf(hid),
            ...pack(deriveStatus(list, list.length, upcoming)),
            completionIds: list.map((c) => c.id), reportType: 'full_exercise', reportId: list[0]?.id || ex.id,
            routeView: `${routeView}&handler=${hid}`, routeEdit, canEdit: rowCanEdit, canDelete: rowCanDelete,
            workMode: ex.kind, patrolTypes: ex.patrol_types,
          });
        }
      } else {
        const mine = cps.filter((c) => c.handler_id === userId);
        // "Deleted" from this handler's records (shared exercise kept for the other handlers).
        if (mine.length === 0 && (ex.removed_for || []).includes(userId)) continue;
        const applicableDogs = dogsOfHandler(userId).filter((d) => dogApplies(d, ex));
        const ownEvent = ev.owner_user_id === userId || ex.created_by === userId;
        // Shared exercises are hidden for handlers whose dogs they do not apply to; your own exercises always show.
        if (mine.length === 0 && applicableDogs.length === 0 && !upcoming && !ownEvent) continue;
        const applicable = mine.length ? mine.length : Math.max(applicableDogs.length, ownEvent ? 1 : 0);
        const dIds = mine.length ? [...new Set(mine.map((c) => c.dog_id))] : applicableDogs.map((d) => d.id);
        dIds.forEach((d) => recDogIds.add(d));
        recHandlerIds.add(userId);
        for (const c of mine) { haystack.push(c.comments || ''); commentParts.push(c.comments || '', c.summary || ''); completionIdsSeen.push(c.id); }
        rows.push({
          id: ex.id, kind: 'training', entity: 'exercise', entityId: ex.id, icon, title: ex.name, subtitle,
          dogIds: dIds, dogNames: dIds.map(dogName), handlerId: userId, handlerName: nameOf(userId),
          ...pack(deriveStatus(mine, applicable, upcoming)),
          completionIds: mine.map((c) => c.id), reportType: 'full_exercise', reportId: mine[0]?.id || ex.id,
          routeView, routeEdit, canEdit: rowCanEdit, canDelete: rowCanDelete,
          workMode: ex.kind, patrolTypes: ex.patrol_types,
        });
      }
    }
    if (isSupervisor && rows.length === 0 && exercises.length === 0) continue;
    // Supervisor / trainer: the Handler line and the "n handlers" chip name the same people — handlers with saved
    // rows, or (nothing saved yet, e.g. UPCOMING) the invitees in scope.
    const handlerIds = recHandlerIds.size ? [...recHandlerIds] : (isSupervisor || isTrainer) ? [...handlerScope] : [];
    if (!handlerIds.length && !isSupervisor) handlerIds.push(userId);
    handlerIds.forEach((h) => haystack.push(nameOf(h)));
    const myInvite = ev.invitees.find((i) => i.user_id === userId);
    let attendance: HubRecord['attendance'] = null;
    if (isSupervisor || isTrainer) {
      const n = handlerIds.length;
      attendance = { label: `${n} handler${n === 1 ? '' : 's'}`, tone: 'muted', undecided: false };
    } else if (myInvite) {
      if (upcoming) {
        if (ev.optional_attendance && myInvite.response === 'undecided') attendance = { label: 'Undecided', tone: 'warning', undecided: true };
        else if (myInvite.response === 'decline') attendance = { label: 'Declined', tone: 'danger', undecided: false };
        else attendance = { label: 'Attending', tone: 'success', undecided: false };
      } else {
        attendance = myInvite.response === 'decline' && !myInvite.attended ? { label: 'Declined', tone: 'muted', undecided: false } : { label: 'Attended', tone: 'success', undecided: false };
      }
    }
    const dogIds = [...recDogIds];
    out.push({
      id: ev.id, kind: 'training', entity: 'training_event', at: ev.starts_at, tz: ev.tz,
      dayKey: dayKeyInZone(ev.starts_at, ev.tz), monthKey: monthKeyInZone(ev.starts_at, ev.tz), isUpcoming: upcoming,
      title: ev.name || 'Training', location: ev.location?.name || ev.location?.address || '',
      ownerId: ev.owner_user_id, handlerIds, handlerNames: handlerIds.map(nameOf), dogIds, dogNames: dogIds.map(dogName),
      attendance, rows,
      isIncomplete: rows.some((r) => r.isIncomplete), hasRejected: rows.some((r) => r.isRejected), hasOutdated: rows.some((r) => r.isOutdated),
      workModes: [...workModes], patrolTypes: [...patrolTypes], odorTerms, tags: ev.tags || [], requestingUnit: '', hasArrests: false, vaccineDue: false,
      commentText: commentParts.join(' ').toLowerCase(), trainerCommentText: trainerTextFor('completion', completionIdsSeen),
      searchText: [...haystack, ...dogIds.map(dogName)].join(' ').toLowerCase(),
      routeView: `/records/training/${ev.id}`, routeEdit: `/records/training/${ev.id}?mode=edit`, routeAddExercise: `/records/training/${ev.id}?add=exercise`,
      reportType: 'full_exercise', reportId: rows[0]?.reportId || ev.id, canEdit, canDelete,
    });
  }

  // ---- deployments ----
  for (const d of ctx.deployments) {
    const scoped = isSupervisor ? visible.has(d.owner_user_id) || visible.has(d.handler_id) : !isTrainer && (d.owner_user_id === userId || d.handler_id === userId);
    if (!scoped) continue;
    const st = singleStatus(d);
    const notDeployed = d.request_fulfillment !== 'deployed';
    const fulfilment = d.request_fulfillment === 'not_deployed' ? 'Dog Not Deployed At Scene' : d.request_fulfillment === 'cancelled_enroute' ? 'Request Cancelled Enroute' : '';
    const sub = d.kind === 'detection' ? `Detection: ${(d.detection as { items_seized?: { odor_type?: string }[] } | null)?.items_seized?.[0]?.odor_type || 'Search'}` : d.patrol_types.length > 1 ? 'Patrol: Multiple Types' : `Patrol: ${d.patrol_types[0] || 'Non-Search'}`;
    const canEdit = !isSupervisor && d.owner_user_id === userId;
    const row: HubRow = {
      id: d.id, kind: 'deployment', entity: 'deployment', entityId: d.id,
      icon: d.kind === 'detection' ? 'search-outline' : PATROL_ICON[d.patrol_types[0]] || 'walk-outline',
      // `<case number>` · `Patrol: <type>` · reason for deployment · request fulfilment (when the dog was not deployed)
      title: d.case_number || 'N/A', subtitle: [sub, truncate(d.reason, 70), notDeployed ? fulfilment : ''].filter(Boolean).join(' · '),
      dogIds: [d.dog_id], dogNames: [dogName(d.dog_id)], handlerId: d.handler_id, handlerName: nameOf(d.handler_id),
      status: st.status, review: st.review, isOutdated: false, isIncomplete: st.incomplete, isRejected: st.rejected,
      completionIds: [], reportType: 'full_deployment', reportId: d.id,
      routeView: `/records/deployment/${d.id}`, routeEdit: `/records/deployment/${d.id}?mode=edit`, canEdit, canDelete: canEdit,
      workMode: d.kind, patrolTypes: d.patrol_types,
    };
    const hay = [d.case_number, d.reason, d.requesting_unit, d.summary, d.location?.name || '', d.location?.address || '', ...(d.tags || []), dogName(d.dog_id), nameOf(d.handler_id), fulfilment];
    out.push({
      id: d.id, kind: 'deployment', entity: 'deployment', at: d.occurred_at, tz: d.tz,
      dayKey: dayKeyInZone(d.occurred_at, d.tz), monthKey: monthKeyInZone(d.occurred_at, d.tz), isUpcoming: false,
      title: 'Deployment', location: d.location?.name || d.location?.address || '',
      ownerId: d.owner_user_id, handlerIds: [d.handler_id], handlerNames: [nameOf(d.handler_id)], dogIds: [d.dog_id], dogNames: [dogName(d.dog_id)],
      attendance: null, rows: [row],
      isIncomplete: st.incomplete, hasRejected: st.rejected, hasOutdated: false,
      workModes: [d.kind], patrolTypes: d.patrol_types,
      odorTerms: ((d.detection as { items_seized?: { odor_type?: string }[] } | null)?.items_seized || []).map((i) => i.odor_type || '').filter(Boolean),
      tags: d.tags || [], requestingUnit: d.requesting_unit || '', hasArrests: (d.arrests || []).length > 0, vaccineDue: false,
      commentText: [d.summary || '', d.reason || ''].join(' ').toLowerCase(), trainerCommentText: trainerTextFor('deployment', [d.id]),
      searchText: hay.join(' ').toLowerCase(),
      routeView: row.routeView, routeEdit: row.routeEdit, reportType: 'full_deployment', reportId: d.id, canEdit, canDelete: canEdit,
    });
  }

  // ---- classes ----
  for (const cl of ctx.classes) {
    const scoped = isSupervisor ? visible.has(cl.owner_user_id) : !isTrainer && cl.owner_user_id === userId;
    if (!scoped) continue;
    const st = singleStatus(cl);
    const canEdit = !isSupervisor && cl.owner_user_id === userId;
    const row: HubRow = {
      id: cl.id, kind: 'class', entity: 'class_record', entityId: cl.id, icon: 'school-outline',
      title: cl.title || 'Class', subtitle: [cl.instructor ? `Instructor: ${cl.instructor}` : '', cl.duration_min ? `${Math.round(cl.duration_min / 60 * 10) / 10} h` : ''].filter(Boolean).join(' · '),
      dogIds: [], dogNames: [], handlerId: cl.owner_user_id, handlerName: nameOf(cl.owner_user_id),
      status: st.status, review: st.review, isOutdated: false, isIncomplete: st.incomplete, isRejected: st.rejected,
      completionIds: [], reportType: 'full_class', reportId: cl.id,
      routeView: `/records/class/${cl.id}`, routeEdit: `/records/class/${cl.id}?mode=edit`, canEdit, canDelete: canEdit,
      workMode: null, patrolTypes: [],
    };
    out.push({
      id: cl.id, kind: 'class', entity: 'class_record', at: cl.occurred_at, tz: cl.tz,
      dayKey: dayKeyInZone(cl.occurred_at, cl.tz), monthKey: monthKeyInZone(cl.occurred_at, cl.tz), isUpcoming: new Date(cl.occurred_at).getTime() > now,
      title: 'Class', location: cl.location || '',
      ownerId: cl.owner_user_id, handlerIds: [cl.owner_user_id], handlerNames: [nameOf(cl.owner_user_id)], dogIds: [], dogNames: [],
      attendance: null, rows: [row],
      isIncomplete: st.incomplete, hasRejected: st.rejected, hasOutdated: false,
      workModes: [], patrolTypes: [], odorTerms: [], tags: [], requestingUnit: '', hasArrests: false, vaccineDue: false,
      commentText: (cl.notes || '').toLowerCase(), trainerCommentText: trainerTextFor('class', [cl.id]),
      searchText: [cl.title, cl.instructor, cl.location, cl.notes, nameOf(cl.owner_user_id)].join(' ').toLowerCase(),
      routeView: row.routeView, routeEdit: row.routeEdit, reportType: 'full_class', reportId: cl.id, canEdit, canDelete: canEdit,
    });
  }

  // ---- vet visits ----
  for (const v of ctx.vets) {
    const scoped = isSupervisor ? visible.has(v.owner_user_id) : !isTrainer && v.owner_user_id === userId;
    if (!scoped) continue;
    const canEdit = !isSupervisor && v.owner_user_id === userId;
    const due = !!ctx.vaccineDueVisitIds?.has(v.id);
    const row: HubRow = {
      id: v.id, kind: 'vet', entity: 'vet_visit', entityId: v.id, icon: 'medkit-outline',
      title: `Vet Visit - ${monthLabel(v.date, v.tz)}`, subtitle: [v.name && !/^vet visit$/i.test(v.name.trim()) ? v.name : '', (v.care_types || []).join(', ')].filter(Boolean).join(' · ') || 'Vet visit',
      dogIds: [v.dog_id], dogNames: [dogName(v.dog_id)], handlerId: v.owner_user_id, handlerName: nameOf(v.owner_user_id),
      status: due ? 'due' : 'complete', statusLabel: due ? 'Vaccination due' : undefined, review: null, isOutdated: false, isIncomplete: false, isRejected: false,
      completionIds: [], reportType: 'vet_visit', reportId: v.id,
      routeView: `/records/vet/${v.id}`, routeEdit: `/records/vet/${v.id}?mode=edit`, canEdit, canDelete: canEdit,
      workMode: null, patrolTypes: [],
    };
    out.push({
      id: v.id, kind: 'vet', entity: 'vet_visit', at: v.date, tz: v.tz,
      dayKey: dayKeyInZone(v.date, v.tz), monthKey: monthKeyInZone(v.date, v.tz), isUpcoming: new Date(v.date).getTime() > now,
      title: 'Vet Visit', location: v.location || '',
      ownerId: v.owner_user_id, handlerIds: [v.owner_user_id], handlerNames: [nameOf(v.owner_user_id)], dogIds: [v.dog_id], dogNames: [dogName(v.dog_id)],
      attendance: null, rows: [row],
      isIncomplete: false, hasRejected: false, hasOutdated: false,
      workModes: [], patrolTypes: [], odorTerms: [], tags: [], requestingUnit: '', hasArrests: false, vaccineDue: due,
      commentText: (v.notes || '').toLowerCase(), trainerCommentText: '',
      searchText: [v.name, v.location, ...(v.care_types || []), v.notes, dogName(v.dog_id), nameOf(v.owner_user_id)].join(' ').toLowerCase(),
      routeView: row.routeView, routeEdit: row.routeEdit, reportType: 'vet_visit', reportId: v.id, canEdit, canDelete: canEdit,
    });
  }

  out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return out;
}

function pack(s: ReturnType<typeof deriveStatus>) {
  return { status: s.status, statusLabel: s.label, review: s.review, isOutdated: s.outdated, isIncomplete: s.incomplete, isRejected: s.rejected };
}

// ---------------------------------------------------------------------------------------------
// Criteria (filter dialog + chips + saved searches)
// ---------------------------------------------------------------------------------------------
export type RecordTypeFilter = 'All' | 'Training' | 'Deployment' | 'Class' | 'Vet Visit';
export type WorkModeFilter = 'Detect & Patrol' | 'Detection' | 'Patrol';
export type DateRangeFilter = 'All Time' | 'This Month' | 'Last Month' | 'Last 30 Days' | 'Last 90 Days' | 'This Year' | 'Last Year' | 'Custom...';
export type TodoFilter = '' | 'incomplete' | 'outdated' | 'rejected' | 'vaccinations';

export interface Criteria {
  recordType: RecordTypeFilter;
  workMode: WorkModeFilter;
  patrolType: string; // 'All Patrol Types' | filter vocab | typed value
  dog: string; // '' = All Dogs, else dog id
  handler: string; // '' = All Handlers, else user id
  handlers: string[]; // extra handler set (Late Records banner)
  dateRange: DateRangeFilter;
  from: string | null; // YYYY-MM-DD (Custom...)
  to: string | null;
  q: string;
  day: string | null; // YYYY-MM-DD from the calendar
  todo: TodoFilter;
  review: '' | 'reviewed' | 'not_reviewed';
  completion: '' | 'complete' | 'not_complete';
  deploymentTag: string; // '' | '<Any Tag>' | tag
  requestingUnit: string;
  odorType: string;
  arrests: boolean;
  /** Handler comments contain this text. */
  comment: string;
  /** '' = any · 'any' = has trainer comments · other = trainer comments contain this text. */
  trainerComments: string;
}

export const ALL_PATROL_TYPES = 'All Patrol Types';
export const ANY_TAG = '<Any Tag>';
export const TRAINER_COMMENTS_ANY = 'any';

export const EMPTY_CRITERIA: Criteria = {
  recordType: 'All', workMode: 'Detect & Patrol', patrolType: ALL_PATROL_TYPES, dog: '', handler: '', handlers: [],
  dateRange: 'All Time', from: null, to: null, q: '', day: null, todo: '', review: '', completion: '',
  deploymentTag: '', requestingUnit: '', odorType: '', arrests: false, comment: '', trainerComments: '',
};

export function normalizeCriteria(raw: unknown): Criteria {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Criteria>;
  return { ...EMPTY_CRITERIA, ...r, handlers: Array.isArray(r.handlers) ? r.handlers : [] };
}

/** Which criteria are non-default (drives the chips and the "filter active" state). */
export function activeCriteriaKeys(c: Criteria): (keyof Criteria)[] {
  const keys: (keyof Criteria)[] = [];
  if (c.recordType !== 'All') keys.push('recordType');
  if (c.workMode !== 'Detect & Patrol') keys.push('workMode');
  if (c.patrolType && c.patrolType !== ALL_PATROL_TYPES) keys.push('patrolType');
  if (c.dog) keys.push('dog');
  if (c.handler) keys.push('handler');
  if (c.handlers.length) keys.push('handlers');
  if (c.dateRange !== 'All Time') keys.push('dateRange');
  if (c.q.trim()) keys.push('q');
  if (c.day) keys.push('day');
  if (c.todo) keys.push('todo');
  if (c.review) keys.push('review');
  if (c.completion) keys.push('completion');
  if (c.deploymentTag) keys.push('deploymentTag');
  if (c.requestingUnit) keys.push('requestingUnit');
  if (c.odorType) keys.push('odorType');
  if (c.arrests) keys.push('arrests');
  if (c.comment.trim()) keys.push('comment');
  if (c.trainerComments) keys.push('trainerComments');
  return keys;
}

export function clearCriterion(c: Criteria, key: keyof Criteria): Criteria {
  const next = { ...c };
  switch (key) {
    case 'dateRange': next.dateRange = 'All Time'; next.from = null; next.to = null; break;
    case 'handlers': next.handlers = []; break;
    default: (next as unknown as Record<string, unknown>)[key] = EMPTY_CRITERIA[key];
  }
  return next;
}

/** Date window (ms) for a preset. `to` is exclusive. */
export function dateWindow(c: Criteria, now = Date.now()): { from: number | null; to: number | null } {
  const d = new Date(now);
  const startOfMonth = (y: number, m: number) => new Date(y, m, 1).getTime();
  switch (c.dateRange) {
    case 'This Month': return { from: startOfMonth(d.getFullYear(), d.getMonth()), to: startOfMonth(d.getFullYear(), d.getMonth() + 1) };
    case 'Last Month': return { from: startOfMonth(d.getFullYear(), d.getMonth() - 1), to: startOfMonth(d.getFullYear(), d.getMonth()) };
    case 'Last 30 Days': return { from: now - 30 * DAY_MS, to: null };
    case 'Last 90 Days': return { from: now - 90 * DAY_MS, to: null };
    case 'This Year': return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: new Date(d.getFullYear() + 1, 0, 1).getTime() };
    case 'Last Year': return { from: new Date(d.getFullYear() - 1, 0, 1).getTime(), to: new Date(d.getFullYear(), 0, 1).getTime() };
    case 'Custom...': {
      const f = c.from ? new Date(c.from + 'T00:00:00').getTime() : null;
      const t = c.to ? new Date(c.to + 'T00:00:00').getTime() + DAY_MS : null;
      return { from: Number.isFinite(f as number) ? f : null, to: Number.isFinite(t as number) ? t : null };
    }
    default: return { from: null, to: null };
  }
}

const KIND_OF_TYPE: Record<Exclude<RecordTypeFilter, 'All'>, HubKind> = { Training: 'training', Deployment: 'deployment', Class: 'class', 'Vet Visit': 'vet' };

/** Filter-vocab spelling → predicate on a record/row patrol-type list. */
export function patrolTypeMatches(filterValue: string, patrolTypes: string[]): boolean {
  const v = filterValue.trim().toLowerCase();
  if (!v || v === ALL_PATROL_TYPES.toLowerCase()) return true;
  const lower = patrolTypes.map((p) => p.toLowerCase());
  switch (v) {
    case 'scenario (multiple)': return patrolTypes.length >= 2;
    case 'agility': return lower.some((p) => p.includes('agility'));
    case 'apprehension': return lower.some((p) => p.includes('apprehension'));
    case 'area search for humans': return lower.some((p) => p.includes('humans'));
    case 'evidence search': return lower.some((p) => p.includes('evidence'));
    case 'other training': return lower.some((p) => p === 'other' || p.includes('other'));
    default: return lower.some((p) => p === v || p.includes(v));
  }
}

export function applyCriteria(records: HubRecord[], c: Criteria, now = Date.now()): HubRecord[] {
  const keys = activeCriteriaKeys(c);
  if (!keys.length) return records;
  const win = dateWindow(c, now);
  const q = c.q.trim().toLowerCase();
  const wantKind = c.recordType === 'All' ? null : KIND_OF_TYPE[c.recordType];
  const wantMode = c.workMode === 'Detection' ? 'detection' : c.workMode === 'Patrol' ? 'patrol' : null;
  const handlerSet = new Set<string>([...(c.handler ? [c.handler] : []), ...c.handlers]);
  const patrolActive = !!c.patrolType && c.patrolType !== ALL_PATROL_TYPES;
  const out: HubRecord[] = [];
  for (const r of records) {
    if (wantKind && r.kind !== wantKind) continue;
    if (c.day && r.dayKey !== c.day) continue;
    if (win.from != null || win.to != null) {
      const t = new Date(r.at).getTime();
      if (win.from != null && t < win.from) continue;
      if (win.to != null && t >= win.to) continue;
    }
    if (q && !r.searchText.includes(q)) continue;
    if (c.deploymentTag) {
      if (r.kind !== 'deployment') continue;
      if (c.deploymentTag === ANY_TAG ? r.tags.length === 0 : !r.tags.some((t) => t.toLowerCase().includes(c.deploymentTag.toLowerCase()))) continue;
    }
    if (c.requestingUnit && !r.requestingUnit.toLowerCase().includes(c.requestingUnit.toLowerCase())) continue;
    if (c.odorType && !r.odorTerms.some((o) => o.toLowerCase().includes(c.odorType.toLowerCase()))) continue;
    if (c.arrests && !r.hasArrests) continue;
    if (c.comment.trim() && !r.commentText.includes(c.comment.trim().toLowerCase())) continue;
    if (c.trainerComments) {
      if (!r.trainerCommentText) continue;
      if (c.trainerComments !== TRAINER_COMMENTS_ANY && !r.trainerCommentText.includes(c.trainerComments.trim().toLowerCase())) continue;
    }
    if (c.todo === 'vaccinations' && !r.vaccineDue) continue;
    // row-level narrowing
    let rows = r.rows;
    if (wantMode) rows = rows.filter((row) => row.workMode === wantMode);
    if (patrolActive) rows = rows.filter((row) => patrolTypeMatches(c.patrolType, row.patrolTypes));
    if (c.dog) rows = rows.filter((row) => row.dogIds.includes(c.dog));
    if (handlerSet.size) rows = rows.filter((row) => (row.handlerId ? handlerSet.has(row.handlerId) : false));
    if (c.todo === 'incomplete') rows = rows.filter((row) => row.isIncomplete);
    if (c.todo === 'outdated') rows = rows.filter((row) => row.isOutdated);
    if (c.todo === 'rejected') rows = rows.filter((row) => row.isRejected);
    if (c.review) rows = rows.filter((row) => row.review === c.review);
    if (c.completion === 'complete') rows = rows.filter((row) => !row.isIncomplete && row.status !== 'upcoming');
    if (c.completion === 'not_complete') rows = rows.filter((row) => row.isIncomplete);
    if (rows.length === 0) continue;
    out.push(rows === r.rows ? r : { ...r, rows });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------------------------
export interface HubSection { key: string; title: string; data: HubRecord[] }

export function groupByMonth(records: HubRecord[], now = Date.now()): HubSection[] {
  const upcoming: HubRecord[] = [];
  const byMonth = new Map<string, HubRecord[]>();
  const nowDate = new Date(now);
  const thisMonth = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`;
  for (const r of records) {
    if (r.isUpcoming) { upcoming.push(r); continue; }
    const l = byMonth.get(r.monthKey);
    if (l) l.push(r); else byMonth.set(r.monthKey, [r]);
  }
  const sections: HubSection[] = [];
  if (upcoming.length) sections.push({ key: 'upcoming', title: 'UPCOMING', data: upcoming.slice().sort((a, b) => (a.at < b.at ? -1 : 1)) });
  const months = [...byMonth.keys()].sort((a, b) => (a < b ? 1 : -1));
  for (const m of months) sections.push({ key: m, title: m === thisMonth ? 'THIS MONTH' : monthTitle(m), data: byMonth.get(m)! });
  return sections;
}
