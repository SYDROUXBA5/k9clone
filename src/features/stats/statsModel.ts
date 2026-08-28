// STATS maths (bar §2.14 / PT-STA-01…03). Pure functions so the numbers can be checked without a
// browser. Ranges are the evidenced strings `Last 7 Days` / `Last 30 Days` / `Last 90 Days` plus a
// custom from/to; there is deliberately NO accuracy or hit-rate statistic anywhere (PT-STA-03).
import type { ClassRecord, Completion, Deployment, Dog, Exercise, TrainingEvent } from '@/db/types';

export const DAY_MS = 86400000;

export type RangeKey = 'last_7' | 'last_30' | 'last_90' | 'custom';
export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: 'last_7', label: 'Last 7 Days' },
  { value: 'last_30', label: 'Last 30 Days' },
  { value: 'last_90', label: 'Last 90 Days' },
  { value: 'custom', label: 'Custom…' },
];
export const RANGE_DAYS: Record<Exclude<RangeKey, 'custom'>, number> = { last_7: 7, last_30: 30, last_90: 90 };

export interface Range { from: number; to: number; label: string }

export function resolveRange(key: RangeKey, now: number, customFrom?: string | null, customTo?: string | null): Range {
  if (key === 'custom') {
    const from = customFrom ? new Date(customFrom).getTime() : now - 30 * DAY_MS;
    const to = customTo ? new Date(customTo).getTime() : now;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    return { from: lo, to: hi, label: 'Custom range' };
  }
  const days = RANGE_DAYS[key];
  return { from: now - days * DAY_MS, to: now, label: `Last ${days} Days` };
}

const inRange = (iso: string | null | undefined, r: Range) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= r.from && t <= r.to;
};

/** Minutes a completion represents: its own start/end, else the parent event's duration. */
export function completionMinutes(c: Completion, event?: TrainingEvent): number {
  if (c.start_at && c.end_at) {
    const m = (new Date(c.end_at).getTime() - new Date(c.start_at).getTime()) / 60000;
    if (Number.isFinite(m) && m > 0) return m;
  }
  return event?.duration_min ?? 0;
}

/** Bucket a completion's hours: detection, one patrol type, or `Scenario (multiple)` — never double-counted. */
export function trainingBucket(ex: Exercise | undefined): string {
  if (!ex) return 'Other';
  if (ex.kind === 'detection') return 'Detection';
  const types = ex.patrol_types || [];
  if (types.length > 1) return 'Scenario (multiple)';
  return types[0] || 'Other';
}

export interface Bar { key: string; label: string; value: number; sub?: string }

export interface TrainingStats {
  events: number;
  exercises: number;
  hours: number;
  classHours: number;
  classes: number;
  /** Hours by patrol type / detection — the `Hours Trained` chart. */
  byBucket: Bar[];
  /** Hours per dog. */
  byDog: Bar[];
}

export interface DetectionStats {
  exercises: number;
  hides: number;
  controlledNegatives: number;
  blindAnswered: number;
  blindYes: number;
  /** Percentage of ANSWERED completions that were blind, or null when nobody answered. */
  blindPct: number | null;
}

export interface DeploymentStats {
  total: number;
  patrol: number;
  detection: number;
  arrests: number;
  seizureIncidents: number;
  byOutcome: Bar[];
  byReason: Bar[];
}

export interface StatsInput {
  range: Range;
  /** null = every dog the user owns (total). */
  dogId: string | null;
  userIds: string[];
  dogs: Dog[];
  events: TrainingEvent[];
  exercises: Exercise[];
  completions: Completion[];
  deployments: Deployment[];
  classes: ClassRecord[];
}

export function computeTraining(input: StatsInput): TrainingStats {
  const { range, dogId, userIds } = input;
  const eventById = new Map(input.events.map((e) => [e.id, e]));
  const exById = new Map(input.exercises.map((e) => [e.id, e]));
  const dogById = new Map(input.dogs.map((d) => [d.id, d]));
  const users = new Set(userIds);

  const rows = input.completions.filter((c) =>
    users.has(c.handler_id)
    && (!dogId || c.dog_id === dogId)
    && inRange(c.start_at || eventById.get(c.event_id)?.starts_at, range));

  const bucketMin = new Map<string, number>();
  const dogMin = new Map<string, number>();
  const eventIds = new Set<string>();
  const exerciseIds = new Set<string>();
  let totalMin = 0;
  for (const c of rows) {
    const ex = exById.get(c.exercise_id);
    const min = completionMinutes(c, eventById.get(c.event_id));
    totalMin += min;
    eventIds.add(c.event_id);
    exerciseIds.add(c.exercise_id);
    const b = trainingBucket(ex);
    bucketMin.set(b, (bucketMin.get(b) || 0) + min);
    dogMin.set(c.dog_id, (dogMin.get(c.dog_id) || 0) + min);
  }

  const classRows = input.classes.filter((cl) => users.has(cl.owner_user_id) && inRange(cl.occurred_at, range));
  const classMin = classRows.reduce((n, cl) => n + (cl.duration_min || 0), 0);

  const hrs = (m: number) => Math.round((m / 60) * 10) / 10;
  return {
    events: eventIds.size,
    exercises: exerciseIds.size,
    hours: hrs(totalMin),
    classes: classRows.length,
    classHours: hrs(classMin),
    byBucket: [...bucketMin.entries()]
      .map(([k, m]) => ({ key: k, label: k, value: hrs(m), sub: `${hrs(m)} h` }))
      .sort((a, b) => b.value - a.value),
    byDog: [...dogMin.entries()]
      .map(([k, m]) => ({ key: k, label: dogById.get(k)?.name || 'Unknown dog', value: hrs(m), sub: `${hrs(m)} h` }))
      .sort((a, b) => b.value - a.value),
  };
}

export function computeDetection(input: StatsInput): DetectionStats {
  const { range, dogId, userIds } = input;
  const eventById = new Map(input.events.map((e) => [e.id, e]));
  const exById = new Map(input.exercises.map((e) => [e.id, e]));
  const users = new Set(userIds);
  const rows = input.completions.filter((c) =>
    users.has(c.handler_id)
    && (!dogId || c.dog_id === dogId)
    && inRange(c.start_at || eventById.get(c.event_id)?.starts_at, range)
    && exById.get(c.exercise_id)?.kind === 'detection');

  let hides = 0;
  let controlledNegatives = 0;
  let blindAnswered = 0;
  let blindYes = 0;
  for (const c of rows) {
    const ex = exById.get(c.exercise_id);
    if (ex?.blank_controlled_negative) controlledNegatives++;
    for (const env of ex?.environments || []) for (const u of env.units || []) hides += (u.odors || []).length;
    if (c.is_blind !== null && c.is_blind !== undefined) { blindAnswered++; if (c.is_blind) blindYes++; }
  }
  return {
    exercises: rows.length,
    hides,
    controlledNegatives,
    blindAnswered,
    blindYes,
    blindPct: blindAnswered ? Math.round((blindYes / blindAnswered) * 100) : null,
  };
}

const OUTCOME_LABEL: Record<string, string> = {
  deployed: 'Dog Deployed At Scene',
  not_deployed: 'Dog Not Deployed At Scene',
  cancelled_enroute: 'Request Cancelled Enroute',
};

export function computeDeployments(input: StatsInput): DeploymentStats {
  const { range, dogId, userIds } = input;
  const users = new Set(userIds);
  const rows = input.deployments.filter((d) =>
    users.has(d.handler_id) && (!dogId || d.dog_id === dogId) && inRange(d.occurred_at, range));

  const byOutcome = new Map<string, number>();
  const byReason = new Map<string, number>();
  let arrests = 0;
  let seizures = 0;
  let patrol = 0;
  let detection = 0;
  for (const d of rows) {
    if (d.kind === 'detection') detection++; else patrol++;
    byOutcome.set(d.request_fulfillment, (byOutcome.get(d.request_fulfillment) || 0) + 1);
    const reason = firstSentence(d.reason) || 'No reason recorded';
    byReason.set(reason, (byReason.get(reason) || 0) + 1);
    arrests += (d.arrests || []).length;
    const items = (d.detection as { items_seized?: unknown[] } | null)?.items_seized;
    if (Array.isArray(items) && items.length) seizures++;
  }
  return {
    total: rows.length,
    patrol,
    detection,
    arrests,
    seizureIncidents: seizures,
    byOutcome: [...byOutcome.entries()]
      .map(([k, v]) => ({ key: k, label: OUTCOME_LABEL[k] || k, value: v, sub: `${v}` }))
      .sort((a, b) => b.value - a.value),
    byReason: [...byReason.entries()]
      .map(([k, v]) => ({ key: k, label: k, value: v, sub: `${v}` }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
  };
}

/** First sentence of a free-text reason, trimmed for a chart label. */
export function firstSentence(s: string | null | undefined, max = 52): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const cut = t.split(/[.;—]/)[0].trim() || t;
  return cut.length > max ? `${cut.slice(0, max - 1)}…` : cut;
}
