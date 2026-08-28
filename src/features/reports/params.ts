// Report parameters — the dialog's state, the /reports/view query string, and the labels both share.
// Every report is a (mode, type, dog, date range, handler) tuple; single-record reports add an id.
import type { Role } from '@/db/types';

export type ReportMode = 'standard' | 'custom';

export interface ReportParams {
  mode: ReportMode;
  type: string;
  /** '' = all dogs */
  dog: string;
  /** '' = every handler in scope (supervisor variants group by handler) */
  handler: string;
  /** YYYY-MM-DD inclusive, null = open ended */
  from: string | null;
  to: string | null;
  /** Custom mode: the hub record ids checkmarked on the Records page. */
  ids: string[] | null;
  /** Full Record reports: the completion / deployment / class / vet visit id. */
  id: string | null;
}

export const EMPTY_PARAMS: ReportParams = {
  mode: 'standard', type: 'training_summary', dog: '', handler: '', from: null, to: null, ids: null, id: null,
};

/** Report types offered for a role. Supervisor adds the two group variants. */
export interface ReportTypeOption { value: string; label: string; group: string; description: string }

export const REPORT_TYPE_OPTIONS: ReportTypeOption[] = [
  { value: 'full_exercise', label: 'Full Record — Exercise', group: 'Full Record', description: 'Every field of one training record: overview, odors, outcome, weather, comments, review state.' },
  { value: 'full_deployment', label: 'Full Record — Deployment', group: 'Full Record', description: 'Every field of one deployment: overview, search work, indications, seizures, arrests, narrative.' },
  { value: 'full_class', label: 'Full Record — Class', group: 'Full Record', description: 'Every field of one class record: instructor, location, duration, notes, review state.' },
  { value: 'training_summary', label: 'Training Summary', group: 'Summary', description: 'Graphical summary of key training statistics: hours, exercises, detection totals, blind work.' },
  { value: 'deployment_summary', label: 'Deployment Summary', group: 'Summary', description: 'Deployment counts by reason, outcome and fulfilment, plus the day-and-hour heatmap.' },
  { value: 'exercise_log', label: 'Exercise Log', group: 'Summary', description: 'One row per exercise record with its completion status.' },
  { value: 'deployment_log', label: 'Deployment Log', group: 'Summary', description: 'One row per deployment with simple detection and patrol statistics.' },
  { value: 'exercise_odor_list', label: 'Exercise Odor List', group: 'Summary', description: 'Target and proofing odors per dog, with one row per odor used in a detection exercise.' },
  { value: 'vet_visit', label: 'Vet Visit', group: 'Veterinary', description: 'Full details of veterinary records and the vaccination table with next-due dates.' },
  { value: 'vaccination_summary', label: 'Vaccination Summary', group: 'Veterinary', description: 'Core and other vaccinations per dog with next-due and overdue flags.' },
];

export const SUPERVISOR_TYPE_OPTIONS: ReportTypeOption[] = [
  { value: 'training_summary_by_handler', label: 'Training Summary By Handler', group: 'Supervisor', description: 'Group report: the training summary broken out by handler.' },
  { value: 'not_reviewed_list', label: 'Not-Reviewed Records', group: 'Supervisor', description: 'Group report: every record in range still waiting for a supervisor review, by handler.' },
];

export function typeOptionsFor(role: Role | null): ReportTypeOption[] {
  return role === 'supervisor' || role === 'trainer' ? [...REPORT_TYPE_OPTIONS, ...SUPERVISOR_TYPE_OPTIONS] : REPORT_TYPE_OPTIONS;
}

export function typeOption(value: string): ReportTypeOption | undefined {
  return [...REPORT_TYPE_OPTIONS, ...SUPERVISOR_TYPE_OPTIONS].find((o) => o.value === value);
}

/** False for a ?type= that no dialog can produce — the viewer says so rather than guessing. */
export function isKnownType(value: string): boolean {
  return !!typeOption(value);
}

export function typeLabel(value: string): string {
  return typeOption(value)?.label || 'Report type not recognised';
}

/** The report title printed at the top of the page. */
export const REPORT_TITLE: Record<string, string> = {
  full_exercise: 'Training Report',
  full_deployment: 'Deployment Report',
  full_class: 'Class Report',
  training_summary: 'Training Summary',
  training_summary_by_handler: 'Training Summary',
  deployment_summary: 'Deployment Summary',
  exercise_log: 'Exercise Log',
  deployment_log: 'Deployment Log',
  exercise_odor_list: 'Exercise Odor List',
  vet_visit: 'Veterinary Report',
  vaccination_summary: 'Vaccination Summary',
  not_reviewed_list: 'Not-Reviewed Records',
};

export const SINGLE_RECORD_TYPES = ['full_exercise', 'full_deployment', 'full_class'];
export const CSV_TYPES = ['training_summary', 'training_summary_by_handler', 'deployment_summary', 'exercise_log', 'deployment_log', 'exercise_odor_list', 'vet_visit', 'vaccination_summary', 'not_reviewed_list'];

export function isSingleRecord(type: string): boolean {
  return SINGLE_RECORD_TYPES.includes(type);
}

// ---------------------------------------------------------------------------------------------
// Query string <-> params
// ---------------------------------------------------------------------------------------------
export function paramsToQuery(p: ReportParams): string {
  const q: string[] = [`type=${encodeURIComponent(p.type)}`];
  if (p.id) q.push(`id=${encodeURIComponent(p.id)}`);
  if (p.dog) q.push(`dog=${encodeURIComponent(p.dog)}`);
  if (p.handler) q.push(`handler=${encodeURIComponent(p.handler)}`);
  if (p.from) q.push(`from=${p.from}`);
  if (p.to) q.push(`to=${p.to}`);
  if (p.mode === 'custom' && p.ids?.length) q.push(`ids=${p.ids.map(encodeURIComponent).join(',')}`);
  return q.join('&');
}

export function paramsFromQuery(raw: Record<string, string | string[] | undefined>): ReportParams {
  const one = (k: string): string => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] || '' : v || '';
  };
  const ids = one('ids') ? one('ids').split(',').filter(Boolean) : null;
  return {
    mode: ids?.length ? 'custom' : 'standard',
    type: one('type') || 'training_summary',
    dog: one('dog'),
    handler: one('handler'),
    from: one('from') || null,
    to: one('to') || null,
    ids,
    id: one('id') || null,
  };
}

// ---------------------------------------------------------------------------------------------
// Date range presets (the dialog's Date Range dropdown)
// ---------------------------------------------------------------------------------------------
export const RANGE_PRESETS = ['All', 'This Month', 'Last Month', 'Last 30 Days', 'Last 90 Days', 'This Year', 'Last Year', 'Custom…'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function presetRange(preset: RangePreset, now = Date.now()): { from: string | null; to: string | null } {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (preset) {
    case 'This Month': return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
    case 'Last Month': return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case 'Last 30 Days': return { from: ymd(new Date(now - 30 * 86400000)), to: ymd(d) };
    case 'Last 90 Days': return { from: ymd(new Date(now - 90 * 86400000)), to: ymd(d) };
    case 'This Year': return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'Last Year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default: return { from: null, to: null };
  }
}
