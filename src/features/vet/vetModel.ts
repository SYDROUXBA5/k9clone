// Vet visit + Vaccinations — form model, defaults, validation and the vaccination-status maths
// (bar §2.8, checklist PT-VET-01…09). Pure functions, no React.
//
// Two rules that matter downstream:
//   • Next Vaccination auto-fills at +3 years for a CORE vaccine and +1 year for a non-core one, is
//     editable, and must fall after the visit date (PT-VET-05).
//   • Weight is captured in pounds and STORED IN KILOGRAMS (§4 imperial display / metric storage).
import type { Dog, VetVisit, Vaccination } from '@/db/types';
import { deviceTimeZone, uuid } from '@/db/util';
import { CORE_INTERVAL_YEARS, NON_CORE_INTERVAL_YEARS, VACCINES_CORE, VACCINES_NON_CORE, VACCINE_REMINDER_DAYS } from '@/db/vocab';
import { monthLabel } from '@/features/records/format';

export const VET_NAME_MAX = 250;
export const VET_TEXT_MAX = 250;
export const DAY_MS = 86400000;

/** `Type` dropdown, grouped CORE / NON-CORE exactly as the reference groups it (PT-VET-04). */
export const VACCINE_OPTIONS = [
  ...VACCINES_CORE.map((v) => ({ value: v, label: v, group: 'CORE' })),
  ...VACCINES_NON_CORE.map((v) => ({ value: v, label: v, group: 'NON-CORE' })),
];
const CORE_SET = new Set<string>(VACCINES_CORE.map((v) => v.toLowerCase()));
/** A typed custom vaccine is non-core unless it is one of the five core names. */
export function isCoreVaccine(type: string): boolean {
  return CORE_SET.has((type || '').trim().toLowerCase());
}

/** Notes templates shipped with the app ([OURS] — the reference ships samples for deployments only). */
export const VET_NOTES_SAMPLES: { name: string; text: string }[] = [
  { name: 'ROUTINE CHECKUP.', text: 'Annual wellness exam for K9 [dog]. Weight [weight] lb. Heart, lungs, ears, eyes, teeth and coat examined — findings: [findings]. Vaccinations given: [vaccines]. Next wellness exam due [date].' },
  { name: 'INJURY / TREATMENT.', text: 'K9 [dog] presented with [complaint] first noticed on [date]. Examination found [findings]. Treatment: [treatment]. Medication: [medication, dose, duration]. Restrictions: [duty status] for [days] days. Recheck [date].' },
  { name: 'HEAT / WEIGHT CHECK.', text: 'Weight check for K9 [dog]: [weight] lb ([change] since [date]). Body condition score [score]/9. Feeding plan: [plan]. Work load: [load]. Next weigh-in [date].' },
];

// ---------- unit conversion (imperial display, metric storage) ----------
export const LB_PER_KG = 2.2046226218;
export const lbFromKg = (kg: number | null | undefined): number | null => (kg == null ? null : Math.round(kg * LB_PER_KG * 10) / 10);
export const kgFromLb = (lb: number | null | undefined): number | null => (lb == null ? null : Math.round((lb / LB_PER_KG) * 1000) / 1000);

// ---------- draft ----------
export interface VaccinationDraft {
  id: string;
  type: string;
  core: boolean;
  /** date-only instant of the shot (defaults to the visit date). */
  given_at: string | null;
  next_due_at: string | null;
  /** true once the handler edited Next Vaccination by hand — auto-fill stops overwriting it. */
  next_due_touched: boolean;
}
export interface VetDraft {
  name: string;
  /** true while the name is still the auto `Vet Visit - <Month YYYY>` value (help: it adjusts itself). */
  name_auto: boolean;
  dog_id: string;
  location: string;
  date: string | null;
  tz: string;
  care_types: string[];
  weight_lb: number | null;
  notes: string;
  cost: number | null;
  files: string[];
  vaccinations: VaccinationDraft[];
}

/** `Vet Visit - March 2025` — the auto name (PT-VET-02). */
export function autoVetName(date: string | null, tz: string): string {
  return `Vet Visit - ${date ? monthLabel(date, tz) : monthLabel(new Date().toISOString(), tz)}`;
}

export function emptyVetDraft(defaultDogId = ''): VetDraft {
  const tz = deviceTimeZone();
  const date = new Date().toISOString();
  return {
    name: autoVetName(date, tz), name_auto: true, dog_id: defaultDogId, location: '', date, tz,
    care_types: [], weight_lb: null, notes: '', cost: null, files: [], vaccinations: [],
  };
}

export function vetDraftFromRecord(v: VetVisit, vax: Vaccination[]): VetDraft {
  const tz = v.tz || deviceTimeZone();
  return {
    name: v.name || '', name_auto: !v.name || v.name === autoVetName(v.date, tz),
    dog_id: v.dog_id, location: v.location || '', date: v.date, tz,
    care_types: v.care_types || [], weight_lb: lbFromKg(v.weight_kg ?? null), notes: v.notes || '',
    cost: v.cost ?? null, files: v.files || [],
    vaccinations: vax.map((x) => ({ id: x.id, type: x.type, core: x.core, given_at: x.given_at, next_due_at: x.next_due_at, next_due_touched: true })),
  };
}

/** Fields carried over from the handler's previous vet visit for this dog (§8: previous values pre-fill). */
export function prefillVetFrom(prev: VetVisit, base: VetDraft): VetDraft {
  return { ...base, location: prev.location || '', dog_id: prev.dog_id || base.dog_id };
}

/** +3 years core / +1 year non-core from the shot date, keeping the wall-clock day. */
export function defaultNextDue(givenAt: string | null, core: boolean): string | null {
  if (!givenAt) return null;
  const d = new Date(givenAt);
  if (Number.isNaN(d.getTime())) return null;
  const out = new Date(d.getTime());
  out.setFullYear(out.getFullYear() + (core ? CORE_INTERVAL_YEARS : NON_CORE_INTERVAL_YEARS));
  return out.toISOString();
}

export function newVaccinationRow(visitDate: string | null): VaccinationDraft {
  return { id: uuid(), type: '', core: false, given_at: visitDate, next_due_at: null, next_due_touched: false };
}

/** Re-applies the auto next-due to every row the handler has not edited by hand. */
export function reflowVaccinations(rows: VaccinationDraft[]): VaccinationDraft[] {
  return rows.map((r) => (r.next_due_touched ? r : { ...r, next_due_at: defaultNextDue(r.given_at, r.core) }));
}

// ---------- validation ----------
export type VetErrors = Record<string, string>;

export function validateVetDraft(d: VetDraft): VetErrors {
  const e: VetErrors = {};
  if (!d.name.trim()) e.name = 'Please enter a name for this vet visit';
  else if (d.name.length > VET_NAME_MAX) e.name = `Vet Visit Name is limited to ${VET_NAME_MAX} characters`;
  if (!d.dog_id) e.dog_id = 'Please select an active dog';
  if (!d.date) e.date = 'Please enter the date and time of the visit';
  else {
    const t = new Date(d.date).getTime();
    if (t > Date.now() + 10 * 365 * DAY_MS) e.date = "The visit date can't be more than 10 years from now";
    if (t < Date.now() - 20 * 365 * DAY_MS) e.date = "The visit date can't be more than 20 years ago";
  }
  if (!d.care_types.length) e.care_types = 'Please select at least one care type';
  if (d.location.length > VET_TEXT_MAX) e.location = `Location Name is limited to ${VET_TEXT_MAX} characters`;
  if (d.weight_lb != null && (d.weight_lb <= 0 || d.weight_lb > 300)) e.weight_lb = 'Enter a weight between 1 and 300 lb';
  if (d.cost != null && d.cost < 0) e.cost = 'Cost cannot be negative';

  const seen = new Map<string, number>();
  d.vaccinations.forEach((v, i) => {
    const key = `vax.${v.id}`;
    if (!v.type.trim()) { e[`${key}.type`] = 'Please select the vaccination type'; return; }
    const norm = v.type.trim().toLowerCase();
    if (seen.has(norm)) e[`${key}.type`] = 'This vaccination was entered above';
    else seen.set(norm, i);
    if (!v.given_at) e[`${key}.given_at`] = 'Please enter the date this vaccination was given';
    if (!v.next_due_at) e[`${key}.next_due`] = 'Please indicate the date of the next vaccination';
    else if (v.given_at && new Date(v.next_due_at).getTime() <= new Date(v.given_at).getTime()) {
      e[`${key}.next_due`] = 'The next vaccination must be after the date it was given';
    } else if (d.date && new Date(v.next_due_at).getTime() <= new Date(d.date).getTime()) {
      e[`${key}.next_due`] = 'The next vaccination must be after the visit';
    }
  });
  return e;
}

const FIELD_NAMES: Record<string, string> = {
  name: 'Vet Visit Name', dog_id: 'Dog', date: 'Date & Time', care_types: 'Veterinary Care Types',
  location: 'Location Name', weight_lb: 'Weight', cost: 'Cost',
};
/** Human list for the "n fields need attention" banner — a blank field never crashes, it is named. */
export function describeVetErrors(e: VetErrors): string[] {
  return Object.entries(e).map(([k, msg]) => {
    if (FIELD_NAMES[k]) return `${FIELD_NAMES[k]}: ${msg}`;
    if (k.startsWith('vax.')) return `Vaccinations: ${msg}`;
    return msg;
  });
}

export function toVetVisit(d: VetDraft, base: { id: string; owner_user_id: string }): Partial<VetVisit> & { id: string } {
  return {
    id: base.id, owner_user_id: base.owner_user_id,
    name: d.name.trim() || autoVetName(d.date, d.tz),
    dog_id: d.dog_id, location: d.location.trim(), date: d.date!, tz: d.tz,
    care_types: d.care_types, notes: d.notes, cost: d.cost, files: d.files,
    weight_kg: kgFromLb(d.weight_lb),
  };
}

export function toVaccinationRow(v: VaccinationDraft, base: { visitId: string; dogId: string; owner_user_id: string; tz: string }): Partial<Vaccination> & { id: string } {
  return {
    id: v.id, owner_user_id: base.owner_user_id, dog_id: base.dogId, vet_visit_id: base.visitId,
    type: v.type.trim(), core: v.core, given_at: v.given_at!, next_due_at: v.next_due_at, tz: base.tz,
  };
}

// ---------- vaccination status ----------
export type VaccineState = 'up_to_date' | 'due' | 'overdue' | 'none';
export const VACCINE_STATE_LABEL: Record<VaccineState, string> = {
  up_to_date: 'Up to date', due: 'Due soon', overdue: 'Overdue', none: 'No recorded vaccinations',
};
/** `Vaccinations Due Within 30 Days` on the supervisor page; TO DO uses ≤14 days (VACCINE_REMINDER_DAYS). */
export const VACCINES_PAGE_WINDOW_DAYS = 30;

export interface VaccineStatus {
  vaccination: Vaccination;
  dog: Dog;
  state: Exclude<VaccineState, 'none'>;
  dueAt: string;
  daysLeft: number;
}

/** Latest shot per (dog, vaccine type) — an older booster never masks a newer one. */
export function latestPerType(vaccinations: Vaccination[]): Vaccination[] {
  const latest = new Map<string, Vaccination>();
  for (const v of vaccinations) {
    const k = `${v.dog_id}|${(v.type || '').toLowerCase()}`;
    const cur = latest.get(k);
    if (!cur || cur.given_at < v.given_at) latest.set(k, v);
  }
  return [...latest.values()];
}

export function stateOf(dueAt: string | null, now: number, windowDays = VACCINE_REMINDER_DAYS): Exclude<VaccineState, 'none'> | null {
  if (!dueAt) return null;
  const t = new Date(dueAt).getTime();
  if (!Number.isFinite(t)) return null;
  if (t < now) return 'overdue';
  if (t <= now + windowDays * DAY_MS) return 'due';
  return 'up_to_date';
}

/** Every managed dog's vaccination status, newest due first. `windowDays` decides due vs up-to-date. */
export function vaccineStatuses(vaccinations: Vaccination[], dogs: Dog[], now: number, windowDays = VACCINE_REMINDER_DAYS): VaccineStatus[] {
  const dogById = new Map(dogs.map((d) => [d.id, d]));
  const out: VaccineStatus[] = [];
  for (const v of latestPerType(vaccinations)) {
    const dog = dogById.get(v.dog_id);
    if (!dog || dog.status === 'retired') continue;
    const state = stateOf(v.next_due_at, now, windowDays);
    if (!state) continue;
    out.push({ vaccination: v, dog, state, dueAt: v.next_due_at!, daysLeft: Math.ceil((new Date(v.next_due_at!).getTime() - now) / DAY_MS) });
  }
  return out.sort((a, b) => (a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0));
}

/** Per-dog `Vaccination Summary` (PT-VET-08): core rows, other rows, worst state. */
export interface DogVaccineSummary {
  dog: Dog;
  core: VaccineStatus[];
  other: VaccineStatus[];
  state: VaccineState;
  nextDue: string | null;
  /** Core vaccines with no record at all — the `Incomplete Vaccination Records` list (PT-VET-09 row 3). */
  missingCore: string[];
}
export function dogVaccineSummary(dog: Dog, vaccinations: Vaccination[], now: number, windowDays = VACCINE_REMINDER_DAYS): DogVaccineSummary {
  const mine = vaccinations.filter((v) => v.dog_id === dog.id);
  const all = vaccineStatuses(mine, [dog], now, windowDays);
  const core = all.filter((s) => s.vaccination.core);
  const other = all.filter((s) => !s.vaccination.core);
  const given = new Set(mine.map((v) => (v.type || '').trim().toLowerCase()));
  const missingCore = VACCINES_CORE.filter((t) => !given.has(t.toLowerCase()));
  const state: VaccineState = all.length === 0
    ? 'none'
    : all.some((s) => s.state === 'overdue') ? 'overdue'
      : all.some((s) => s.state === 'due') ? 'due' : 'up_to_date';
  const nextDue = all.length ? all[0].dueAt : null;
  return { dog, core, other, state, nextDue, missingCore };
}

// ---------- TO DO + notifications ----------
export interface VaccineTodo {
  vaccination: Vaccination;
  dogId: string;
  dogName: string;
  dueAt: string;
  overdue: boolean;
}

/**
 * Vaccinations that need the handler's attention: overdue, or due within `windowDays` (14 by default,
 * the reference's "two weeks before the due date" reminder). `dogs` must already be scoped to the
 * user — the Records hub passes the dogs it can see. Feeds the TO DO card and /vaccines.
 */
export function getVaccineTodos(vaccinations: Vaccination[], dogs: Dog[], now = Date.now(), windowDays = VACCINE_REMINDER_DAYS): VaccineTodo[] {
  return vaccineStatuses(vaccinations, dogs, now, windowDays)
    .filter((s) => s.state !== 'up_to_date')
    .map((s) => ({ vaccination: s.vaccination, dogId: s.dog.id, dogName: s.dog.name, dueAt: s.dueAt, overdue: s.state === 'overdue' }));
}

export type VaccineMilestone = 'two_weeks' | 'due_date';
export interface VaccineNotificationPlan {
  /** Deterministic id — writing it twice updates the same row, so a milestone never doubles up. */
  id: string;
  user_id: string;
  milestone: VaccineMilestone;
  title: string;
  body: string;
  link: string;
}

/**
 * One notification per (vaccination, milestone): "two weeks before the due date" and "on the day it's
 * due" (bar §2.8 Reminders). The id encodes both, so re-running this is idempotent.
 */
export function planVaccineNotifications(vaccinations: Vaccination[], dogs: Dog[], now = Date.now()): VaccineNotificationPlan[] {
  const dogById = new Map(dogs.map((d) => [d.id, d]));
  const out: VaccineNotificationPlan[] = [];
  for (const v of latestPerType(vaccinations)) {
    const dog = dogById.get(v.dog_id);
    if (!dog || dog.status === 'retired' || !v.next_due_at) continue;
    const due = new Date(v.next_due_at).getTime();
    if (!Number.isFinite(due)) continue;
    const days = Math.ceil((due - now) / DAY_MS);
    const when = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(due));
    if (days <= VACCINE_REMINDER_DAYS && days > 0) {
      out.push({
        id: `vxn-${v.id}-two_weeks`, user_id: v.owner_user_id, milestone: 'two_weeks',
        title: 'Vaccination due soon',
        body: `${dog.name}: ${v.type} is due on ${when} (${days} day${days === 1 ? '' : 's'}).`,
        link: '/vaccines',
      });
    }
    if (days <= 0) {
      out.push({
        id: `vxn-${v.id}-due_date`, user_id: v.owner_user_id, milestone: 'due_date',
        title: days === 0 ? 'Vaccination due today' : 'Vaccination overdue',
        body: days === 0 ? `${dog.name}: ${v.type} is due today.` : `${dog.name}: ${v.type} was due on ${when} — ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue.`,
        link: '/vaccines',
      });
    }
  }
  return out;
}
