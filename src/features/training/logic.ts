// Pure rules for training records: applicability, target vs proofing, auto-naming, status,
// draft factories, validation and the auto-populate scaffold. No React here.
import type { Completion, Dog, EnvironmentUnit, EventInvitee, Exercise, ExerciseEnvironment, OdorPlacement, TrainingEvent, User } from '@/db/types';
import { deviceTimeZone, nowISO, uuid } from '@/db/util';

// ---------- drafts ----------
export type EventDraft = Omit<TrainingEvent, 'id' | 'owner_user_id' | 'created_at' | 'updated_at' | 'deleted_at'> & { id: string | null };
export type ExerciseDraft = Omit<Exercise, 'id' | 'owner_user_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'event_id'> & { id: string; isNew: boolean; localKey: string };
export type CompletionDraft = Omit<Completion, 'id' | 'owner_user_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'event_id' | 'exercise_id'> & { id: string | null; dirty: boolean; updated_at_seen?: string };

export function newEventDraft(user: User, tz = deviceTimeZone()): EventDraft {
  return {
    id: null,
    name: '',
    starts_at: nowISO(),
    tz,
    duration_min: null,
    location: { name: '', address: '', postal_code: '', lat: null, lng: null },
    venue_contact: '',
    group_id: null,
    optional_attendance: false,
    tags: [],
    comments_to_group: '',
    files: [],
    invitees: [{ user_id: user.id, is_leader: true, is_mandatory: true, response: 'attend', attended: false }],
    forecast: null,
  };
}

export function eventToDraft(e: TrainingEvent): EventDraft {
  return {
    id: e.id,
    name: e.name || '',
    starts_at: e.starts_at,
    tz: e.tz || deviceTimeZone(),
    duration_min: e.duration_min ?? null,
    location: { address: '', postal_code: '', ...(e.location || { name: '', lat: null, lng: null }) },
    venue_contact: e.venue_contact || '',
    group_id: e.group_id ?? null,
    optional_attendance: !!e.optional_attendance,
    tags: e.tags || [],
    comments_to_group: e.comments_to_group || '',
    files: e.files || [],
    invitees: (e.invitees || []).map((i) => ({ ...i })),
    forecast: e.forecast ?? null,
  };
}

export function newExerciseDraft(userId: string, kind: Exercise['kind'] = 'detection'): ExerciseDraft {
  const id = uuid();
  return { id, isNew: true, localKey: id, name: '', kind, monitor: '', goal: '', patrol_types: [], environments: [], blank_controlled_negative: false, version: 1, files: [], created_by: userId };
}
export function exerciseToDraft(x: Exercise): ExerciseDraft {
  return {
    id: x.id, isNew: false, localKey: x.id, name: x.name || '', kind: x.kind, monitor: x.monitor || '', goal: x.goal || '',
    patrol_types: [...(x.patrol_types || [])], environments: cloneEnvironments(x.environments || [], false),
    blank_controlled_negative: !!x.blank_controlled_negative, version: x.version || 1, files: x.files || [], created_by: x.created_by,
  };
}
export function cloneEnvironments(envs: ExerciseEnvironment[], freshIds: boolean): ExerciseEnvironment[] {
  return envs.map((e) => ({
    ...e,
    id: freshIds ? uuid() : e.id,
    units: (e.units || []).map((u) => ({ ...u, id: freshIds ? uuid() : u.id, odors: (u.odors || []).map((o) => ({ ...o, id: freshIds ? uuid() : o.id })) })),
  }));
}
export function newEnvironment(env_type = 'Vehicle'): ExerciseEnvironment {
  return { id: uuid(), env_type, count: 1, description: '', units: [] };
}
export function newUnit(name = ''): EnvironmentUnit {
  return { id: uuid(), name, odors: [] };
}
export function newOdor(category = 'Drugs'): OdorPlacement {
  return { id: uuid(), category, type: '', amount: null, unit: 'Grams', packaging: '', concealed: '' };
}

export function newCompletionDraft(dog: Dog, handlerId: string, exercise: ExerciseDraft | Exercise, tz = deviceTimeZone()): CompletionDraft {
  return {
    id: null, dirty: false,
    dog_id: dog.id, handler_id: handlerId,
    performed: 'performed', is_blind: null, monitor: exercise.monitor || '',
    odor_set_at: null, start_at: null, end_at: null, tz,
    weather: null, comments: '', summary: '', sections: {}, files: [],
    is_complete: false, is_outdated: false, exercise_version_seen: exercise.version || 1, saved_at: null,
    review: 'not_reviewed', reviewed_by: null, reviewed_at: null, rejection_reason: null, track_id: null,
  };
}
export function completionToDraft(c: Completion): CompletionDraft {
  return {
    id: c.id, dirty: false, updated_at_seen: c.updated_at,
    dog_id: c.dog_id, handler_id: c.handler_id, performed: c.performed || 'performed', is_blind: c.is_blind ?? null, monitor: c.monitor || '',
    odor_set_at: c.odor_set_at ?? null, start_at: c.start_at ?? null, end_at: c.end_at ?? null, tz: c.tz || deviceTimeZone(),
    weather: c.weather ? { ...c.weather } : null, comments: c.comments || '', summary: c.summary || '',
    sections: JSON.parse(JSON.stringify(c.sections || {})), files: c.files || [],
    is_complete: !!c.is_complete, is_outdated: !!c.is_outdated, exercise_version_seen: c.exercise_version_seen || 1, saved_at: c.saved_at ?? null,
    review: c.review || 'not_reviewed', reviewed_by: c.reviewed_by ?? null, reviewed_at: c.reviewed_at ?? null, rejection_reason: c.rejection_reason ?? null, track_id: c.track_id ?? null,
  };
}

// ---------- rules ----------
/** Dog applicability (help centre): detection exercises apply to detection dogs; patrol exercises to dogs whose Patrol Types cover every type in the exercise. */
export function exerciseAppliesToDog(ex: Pick<Exercise, 'kind' | 'patrol_types'>, dog: Pick<Dog, 'patrol_types' | 'odor_types'>): boolean {
  if (ex.kind === 'detection') return (dog.odor_types || []).length > 0;
  const types = ex.patrol_types || [];
  if (!types.length) return (dog.patrol_types || []).length > 0;
  return types.every((t) => (dog.patrol_types || []).includes(t));
}

/** Target vs Proofing per dog: explicit 'Proofing' rows stay proofing for everyone. */
export function odorCategoryForDog(odor: Pick<OdorPlacement, 'category'>, dog: Pick<Dog, 'odor_types'>): 'Target' | 'Proofing' {
  if (odor.category.trim().toLowerCase() === 'proofing') return 'Proofing';
  return (dog.odor_types || []).includes(odor.category) ? 'Target' : 'Proofing';
}

export function allOdors(ex: Pick<Exercise, 'environments'>): OdorPlacement[] {
  const out: OdorPlacement[] = [];
  for (const e of ex.environments || []) for (const u of e.units || []) for (const o of u.odors || []) out.push(o);
  return out;
}

/** List-row prefix: `Detection: Drugs` / `Detection: Proofing Only` / `Patrol: Obedience` / `Patrol: Multiple Types`. */
export function exerciseTypeLabel(ex: Pick<Exercise, 'kind' | 'patrol_types' | 'environments' | 'blank_controlled_negative'>, dog?: Pick<Dog, 'odor_types'> | null): string {
  if (ex.kind === 'patrol') {
    const t = ex.patrol_types || [];
    return t.length > 1 ? 'Patrol: Multiple Types' : `Patrol: ${t[0] || 'Unspecified'}`;
  }
  const odors = allOdors(ex);
  if (!odors.length) return ex.blank_controlled_negative ? 'Detection: Controlled Negative' : 'Detection';
  if (dog) {
    const targets = odors.filter((o) => odorCategoryForDog(o, dog) === 'Target');
    if (!targets.length) return 'Detection: Proofing Only';
    return `Detection: ${[...new Set(targets.map((o) => o.category))].join(', ')}`;
  }
  return `Detection: ${[...new Set(odors.map((o) => o.category))].join(', ')}`;
}

/** Rows left unnamed show type-style names. */
export function exerciseDisplayName(ex: Pick<Exercise, 'name' | 'kind' | 'patrol_types'>, index: number): string {
  if (ex.name && ex.name.trim()) return ex.name.trim();
  if (ex.kind === 'detection') return `Detection Exercise #${index + 1}`;
  const t = ex.patrol_types || [];
  if (t.length > 1) return 'Patrol Scenario Exercise';
  return t[0] ? `${t[0]} Exercise` : 'Patrol Exercise';
}

export function isScenario(ex: Pick<Exercise, 'kind' | 'patrol_types'>): boolean {
  return ex.kind === 'patrol' && (ex.patrol_types || []).length >= 2;
}

/** `Sniff of n <Env> where k had odors` per environment (details read view). */
export function environmentSummary(env: ExerciseEnvironment): string {
  const withOdor = (env.units || []).filter((u) => (u.odors || []).length > 0).length;
  const noun = env.count === 1 ? env.env_type : pluralise(env.env_type);
  return `Sniff of ${env.count} ${noun} where ${withOdor} had odors`;
}
function pluralise(s: string) {
  if (!s) return s;
  if (/(s|x|ch|sh)$/i.test(s)) return `${s}es`;
  return `${s}s`;
}

/** Shared-details fingerprint — a change here bumps Exercise.version. */
export function detailsFingerprint(ex: Pick<Exercise, 'name' | 'kind' | 'monitor' | 'goal' | 'patrol_types' | 'environments' | 'blank_controlled_negative'>): string {
  const envs = (ex.environments || []).map((e) => ({
    t: e.env_type, c: e.count, d: e.description || '',
    u: (e.units || []).map((u) => ({ n: u.name, o: (u.odors || []).map((o) => [o.category, o.type, o.amount, o.unit, o.packaging, o.concealed, o.height_ft ?? null, o.depth_ft ?? null]) })),
  }));
  return JSON.stringify([ex.name || '', ex.kind, ex.monitor || '', ex.goal || '', ex.patrol_types || [], envs, !!ex.blank_controlled_negative]);
}

export type CompletionStatus = 'rejected' | 'outdated' | 'complete' | 'incomplete';
export function completionStatus(c: Pick<Completion, 'review' | 'is_outdated' | 'is_complete'> | null | undefined): CompletionStatus {
  if (!c) return 'incomplete';
  if (c.review === 'rejected') return 'rejected';
  if (c.is_outdated) return 'outdated';
  return c.is_complete ? 'complete' : 'incomplete';
}

/** Event pill: Complete / Incomplete / k/n Complete for the dogs the viewer cares about. */
export function eventCompletionLabel(total: number, done: number): 'Complete' | 'Incomplete' | string {
  if (total === 0) return 'Incomplete';
  if (done === 0) return 'Incomplete';
  if (done >= total) return 'Complete';
  return `${done}/${total} Complete`;
}

// ---------- validation ----------
export interface EventErrors { starts_at?: string; duration_min?: string; location?: string }
export function validateEvent(d: EventDraft): EventErrors {
  const e: EventErrors = {};
  if (!d.starts_at || Number.isNaN(new Date(d.starts_at).getTime())) e.starts_at = 'Date & Time is required — enter the date and time of the training.';
  if (d.duration_min != null && (Number.isNaN(d.duration_min) || d.duration_min < 0)) e.duration_min = 'Duration must be a positive number of minutes.';
  return e;
}
export interface ExerciseErrors { kind?: string; patrol_types?: string; environments?: string; odors?: Record<string, string> }
export function validateExercise(x: ExerciseDraft): ExerciseErrors {
  const e: ExerciseErrors = {};
  if (x.kind !== 'detection' && x.kind !== 'patrol') e.kind = 'Choose Detection or Patrol.';
  if (x.kind === 'patrol' && !(x.patrol_types || []).some((t) => t && t.trim())) e.patrol_types = 'Patrol Type is required — add at least one patrol type.';
  if (x.kind === 'detection') {
    const odors = allOdors(x);
    if (!x.blank_controlled_negative && x.environments.length === 0) e.environments = 'Add an environment (or tick Blank / Controlled Negative for a sniff with no odor).';
    for (const env of x.environments) {
      if (!env.env_type || !env.env_type.trim()) e.environments = 'Each environment needs a type.';
      if (!env.count || env.count < 1) e.environments = 'Each environment needs a count of 1 or more.';
    }
    const odorErr: Record<string, string> = {};
    for (const o of odors) {
      const missing: string[] = [];
      if (!o.category?.trim()) missing.push('Category');
      if (!o.type?.trim()) missing.push('Type');
      if (o.amount == null || Number.isNaN(o.amount)) missing.push('Amount');
      if (!o.packaging?.trim()) missing.push('Packaging');
      if (!o.concealed?.trim()) missing.push('Concealed location');
      if (missing.length) odorErr[o.id] = `${listAnd(missing)} ${missing.length > 1 ? 'are' : 'is'} required for this odor.`;
    }
    if (Object.keys(odorErr).length) e.odors = odorErr;
  }
  return e;
}
/** "A", "A and B", "A, B and C" — field lists in error messages name what is missing. */
function listAnd(xs: string[]): string {
  if (xs.length <= 1) return xs[0] || '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
export function exerciseErrorSummary(e: ExerciseErrors): string | null {
  return e.kind || e.patrol_types || e.environments || (e.odors ? Object.values(e.odors)[0] : null) || null;
}
export interface CompletionErrors { dog?: string; comments?: string; times?: string }
export function validateCompletion(c: CompletionDraft, commentsMax: number): CompletionErrors {
  const e: CompletionErrors = {};
  if (!c.dog_id) e.dog = 'Dog is required — pick the dog that performed this exercise.';
  if ((c.comments || '').length > commentsMax) e.comments = `Handler Comments are limited to ${commentsMax.toLocaleString()} characters.`;
  if (c.start_at && c.end_at && new Date(c.end_at).getTime() < new Date(c.start_at).getTime()) e.times = 'End Time cannot be before Start Time.';
  return e;
}

// ---------- auto-populate ----------
/** New Training Record scaffold from the handler's most recent training record. Time = now; ids fresh. */
export function prefillFromPrevious(prev: TrainingEvent, prevExercises: Exercise[], user: User): { event: EventDraft; exercises: ExerciseDraft[] } {
  const d = eventToDraft(prev);
  const event: EventDraft = {
    ...d,
    id: null,
    starts_at: nowISO(),
    tz: deviceTimeZone(),
    forecast: null,
    files: [],
    invitees: d.invitees.length ? d.invitees.map((i) => ({ ...i, response: i.user_id === user.id ? 'attend' : 'undecided', attended: false })) : [{ user_id: user.id, is_leader: true, is_mandatory: true, response: 'attend', attended: false }],
  };
  if (!event.invitees.some((i) => i.user_id === user.id)) event.invitees.unshift({ user_id: user.id, is_leader: true, is_mandatory: true, response: 'attend', attended: false });
  const exercises = prevExercises.map((x) => {
    const id = uuid();
    return { ...exerciseToDraft(x), id, isNew: true, localKey: id, version: 1, files: [], created_by: user.id, environments: cloneEnvironments(x.environments || [], true) } as ExerciseDraft;
  });
  return { event, exercises };
}

/** Members of the event: creator + invitees + (group) members. */
export function inviteeIds(invitees: EventInvitee[]): string[] {
  return invitees.map((i) => i.user_id);
}

/** Predict the patrol type from past exercises (most frequent). */
export function predictPatrolType(exercises: Exercise[]): string | null {
  const counts = new Map<string, number>();
  for (const x of exercises) if (x.kind === 'patrol') for (const t of x.patrol_types || []) counts.set(t, (counts.get(t) || 0) + 1);
  let best: string | null = null, n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best;
}
