// Report record selection — turns the repository snapshots + report params into the exact row sets a
// report renders. Pure functions (no React) so the 1,000-record path is cheap and testable.
import type {
  ClassRecord, Completion, Deployment, Dog, Exercise, Role, TrainerComment, Track, TrainingEvent, User, Vaccination, VetVisit,
} from '@/db/types';
import { partsInZone } from '@/ui/datetime';
import type { ReportParams } from './params';

export interface ReportSource {
  users: User[];
  dogs: Dog[];
  events: TrainingEvent[];
  exercises: Exercise[];
  completions: Completion[];
  deployments: Deployment[];
  classes: ClassRecord[];
  vets: VetVisit[];
  vaccinations: Vaccination[];
  trainerComments: TrainerComment[];
  tracks: Track[];
}

export interface ReportScope {
  userId: string;
  role: Role;
  /** Ids whose records this role may report on (self, plus managed handlers). */
  visibleIds: string[];
}

/** The rows a report works from, after mode / dog / handler / date filtering. */
export interface ReportSet {
  completions: Completion[];
  deployments: Deployment[];
  classes: ClassRecord[];
  vets: VetVisit[];
  vaccinations: Vaccination[];
  /** ids of the handlers actually present in the set (report headers and supervisor grouping) */
  handlerIds: string[];
  dogIds: string[];
  /** earliest / latest instant present, for the "Using all N records from … to …" line */
  firstAt: string | null;
  lastAt: string | null;
  total: number;
}

const startMs = (from: string | null) => (from ? new Date(`${from}T00:00:00`).getTime() : null);
const endMs = (to: string | null) => (to ? new Date(`${to}T00:00:00`).getTime() + 86400000 : null);

function inRange(iso: string | null | undefined, from: number | null, to: number | null): boolean {
  if (!iso) return from == null && to == null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  if (from != null && t < from) return false;
  if (to != null && t >= to) return false;
  return true;
}

export function selectRecords(src: ReportSource, scope: ReportScope, p: ReportParams): ReportSet {
  const from = startMs(p.from);
  const to = endMs(p.to);
  const visible = new Set(scope.visibleIds.length ? scope.visibleIds : [scope.userId]);
  const handlerOk = (id: string) => visible.has(id) && (!p.handler || p.handler === id);
  const dogOk = (id: string | null | undefined) => !p.dog || p.dog === id;
  const idSet = p.mode === 'custom' && p.ids?.length ? new Set(p.ids) : null;

  const completions = src.completions.filter((c) =>
    handlerOk(c.handler_id) && dogOk(c.dog_id) && inRange(c.start_at || c.saved_at || c.created_at, from, to)
    && (!idSet || idSet.has(c.event_id) || idSet.has(c.exercise_id) || idSet.has(c.id)));

  const deployments = src.deployments.filter((d) =>
    handlerOk(d.handler_id) && dogOk(d.dog_id) && inRange(d.occurred_at, from, to) && (!idSet || idSet.has(d.id)));

  const classes = src.classes.filter((c) =>
    handlerOk(c.owner_user_id) && !p.dog && inRange(c.occurred_at, from, to) && (!idSet || idSet.has(c.id)));

  // A Records row's "View Report" on a vet record hands over one id — the report is then that visit
  // alone, not every visit in range.
  const oneVet = p.id && (p.type === 'vet_visit' || p.type === 'vaccination_summary') ? p.id : null;
  const vets = src.vets.filter((v) =>
    handlerOk(v.owner_user_id) && dogOk(v.dog_id) && (oneVet ? v.id === oneVet : inRange(v.date, from, to))
    && (!idSet || idSet.has(v.id)));

  const vetIds = new Set(vets.map((v) => v.id));
  const vaccinations = src.vaccinations.filter((x) =>
    handlerOk(x.owner_user_id) && dogOk(x.dog_id)
    && (oneVet ? vetIds.has(x.vet_visit_id || '') : vetIds.has(x.vet_visit_id || '') || inRange(x.given_at, from, to)));

  const handlerIds = [...new Set([
    ...completions.map((c) => c.handler_id),
    ...deployments.map((d) => d.handler_id),
    ...classes.map((c) => c.owner_user_id),
    ...vets.map((v) => v.owner_user_id),
  ])];
  const dogIds = [...new Set([...completions.map((c) => c.dog_id), ...deployments.map((d) => d.dog_id), ...vets.map((v) => v.dog_id)])];

  const instants = [
    ...completions.map((c) => c.start_at || c.saved_at || c.created_at),
    ...deployments.map((d) => d.occurred_at),
    ...classes.map((c) => c.occurred_at),
    ...vets.map((v) => v.date),
  ].filter((x): x is string => !!x).sort();

  return {
    completions, deployments, classes, vets, vaccinations, handlerIds, dogIds,
    firstAt: instants[0] || null,
    lastAt: instants[instants.length - 1] || null,
    total: completions.length + deployments.length + classes.length + vets.length,
  };
}

// ---------------------------------------------------------------------------------------------
// Small shared helpers used by every aggregate
// ---------------------------------------------------------------------------------------------
export const DOW_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Display order for every day-of-week chart and the heatmap: Monday → Sunday. */
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Day-of-week (0=Sun) and hour (0-23) of an instant, read in the RECORD's zone. */
export function dowHour(iso: string, tz: string): { dow: number; hour: number; y: number; m: number; d: number } {
  const p = partsInZone(iso, tz);
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return { dow, hour: p.hh, y: p.y, m: p.m, d: p.d };
}

/** Minutes between two instants; null when either end is missing. */
export function minutesBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 60000);
}

export function tally<T>(rows: T[], keyOf: (r: T) => string | string[] | null | undefined): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = keyOf(r);
    const keys = k == null ? [] : Array.isArray(k) ? k : [k];
    for (const key of keys) {
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Every odor placement inside an exercise definition, flattened. */
export function odorsOf(ex: Exercise | undefined): { env: string; unit: string; category: string; type: string; amount: number | null; unitLabel: string; packaging: string; concealed: string; height_ft?: number | null; depth_ft?: number | null; description: string }[] {
  if (!ex) return [];
  const out: ReturnType<typeof odorsOf> = [];
  for (const env of ex.environments || []) {
    for (const u of env.units || []) {
      for (const o of u.odors || []) {
        out.push({
          env: env.env_type || '', unit: u.name || '', category: o.category || '', type: o.type || '',
          amount: o.amount ?? null, unitLabel: o.unit || '', packaging: o.packaging || '', concealed: o.concealed || '',
          height_ft: o.height_ft ?? null, depth_ft: o.depth_ft ?? null, description: env.description || '',
        });
      }
    }
  }
  return out;
}

export function indexById<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}
