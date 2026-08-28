// TO DO card — counts + links for Incomplete / Outdated / Rejected records and vaccinations due or
// overdue. Other units extend it with registerTodoSource() (e.g. U5 invitations, U8 tracks) without
// touching this file. Pure functions except the tiny registry.
import type { Dog, Role, Vaccination } from '@/db/types';
import { DAY_MS, TODO_WINDOW_DAYS, VACCINE_DUE_WINDOW_DAYS } from './constants';
import type { Criteria, HubRecord } from './model';

export interface TodoItem {
  key: string;
  label: string; // "Incomplete Records"
  count: number;
  /** Criteria patch applied to the hub filter when the row is tapped. */
  criteria?: Partial<Criteria>;
  /** Or a route to open instead. */
  href?: string;
  tone: 'muted' | 'warning' | 'danger' | 'info';
  testID: string;
}

export interface TodoContext {
  role: Role | null;
  userId: string | null;
  visibleIds: string[];
  records: HubRecord[]; // unfiltered hub records for the current role
  vaccinations: Vaccination[];
  dogs: Dog[];
  now: number;
  windowDays?: number;
}

export type TodoSource = (ctx: TodoContext) => TodoItem[];
const extraSources: TodoSource[] = [];
/** Other units add TO DO rows here (returns an unregister function). */
export function registerTodoSource(src: TodoSource): () => void {
  extraSources.push(src);
  return () => { const i = extraSources.indexOf(src); if (i >= 0) extraSources.splice(i, 1); };
}

export interface DueVaccination { vaccination: Vaccination; dogName: string; overdue: boolean; dueAt: string }

/** Latest vaccination per dog+type whose next due date is within the window (or already past). */
export function dueVaccinations(vaccinations: Vaccination[], dogs: Dog[], now: number, windowDays = VACCINE_DUE_WINDOW_DAYS): DueVaccination[] {
  const dogById = new Map(dogs.map((d) => [d.id, d]));
  const latest = new Map<string, Vaccination>();
  for (const v of vaccinations) {
    if (!dogById.has(v.dog_id)) continue;
    const k = `${v.dog_id}|${v.type.toLowerCase()}`;
    const cur = latest.get(k);
    if (!cur || cur.given_at < v.given_at) latest.set(k, v);
  }
  const limit = now + windowDays * DAY_MS;
  const out: DueVaccination[] = [];
  for (const v of latest.values()) {
    if (!v.next_due_at) continue;
    const t = new Date(v.next_due_at).getTime();
    if (!Number.isFinite(t) || t > limit) continue;
    const dog = dogById.get(v.dog_id)!;
    if (dog.status === 'retired') continue;
    out.push({ vaccination: v, dogName: dog.name, overdue: t < now, dueAt: v.next_due_at });
  }
  return out.sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1));
}

function withinWindow(r: HubRecord, now: number, windowDays: number): boolean {
  const t = new Date(r.at).getTime();
  return t >= now - windowDays * DAY_MS && t <= now;
}

export function getTodoItems(ctx: TodoContext): TodoItem[] {
  const windowDays = ctx.windowDays ?? TODO_WINDOW_DAYS;
  const visible = new Set(ctx.visibleIds);
  const recent = ctx.records.filter((r) => withinWindow(r, ctx.now, windowDays));
  const count = (pick: (r: HubRecord) => number) => recent.reduce((n, r) => n + pick(r), 0);
  const incomplete = count((r) => r.rows.filter((row) => row.isIncomplete).length);
  const outdated = count((r) => r.rows.filter((row) => row.isOutdated).length);
  const rejected = count((r) => r.rows.filter((row) => row.isRejected).length);
  const myDogs = ctx.dogs.filter((d) => visible.has(d.owner_user_id));
  const vaccines = dueVaccinations(ctx.vaccinations, myDogs, ctx.now);
  const overdue = vaccines.filter((v) => v.overdue).length;
  const items: TodoItem[] = [
    { key: 'incomplete', label: incomplete === 1 ? 'Incomplete Record' : 'Incomplete Records', count: incomplete, criteria: { todo: 'incomplete' }, tone: 'muted', testID: 'todo-incomplete' },
    { key: 'outdated', label: outdated === 1 ? 'Outdated Record' : 'Outdated Records', count: outdated, criteria: { todo: 'outdated' }, tone: 'warning', testID: 'todo-outdated' },
    { key: 'rejected', label: rejected === 1 ? 'Rejected Record' : 'Rejected Records', count: rejected, criteria: { todo: 'rejected' }, tone: 'danger', testID: 'todo-rejected' },
    {
      key: 'vaccinations',
      label: overdue > 0 ? `Vaccination${vaccines.length === 1 ? '' : 's'} Due (${overdue} overdue)` : `Vaccination${vaccines.length === 1 ? '' : 's'} Due`,
      count: vaccines.length,
      criteria: { todo: 'vaccinations', recordType: 'Vet Visit' },
      href: ctx.role === 'supervisor' ? '/vaccines' : undefined,
      tone: overdue > 0 ? 'danger' : 'info',
      testID: 'todo-vaccinations',
    },
  ];
  for (const src of extraSources) {
    try { items.push(...src(ctx)); } catch { /* a broken extension must never break the hub */ }
  }
  return items;
}

export function todoTotal(items: TodoItem[]): number {
  return items.reduce((n, i) => n + i.count, 0);
}
