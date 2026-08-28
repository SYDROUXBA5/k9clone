// Rename / merge a custom value across saved records.
// Returns the writes to make rather than making them, so the dialog can say exactly how many records
// will change before anything is touched (PT-CUS-03: "the dialog will explain exactly what happens").
import type { EntityName } from '@/db/types';
import type { CustomEntryData } from './customModel';

export interface ValueWrite { entity: EntityName; id: string; patch: Record<string, unknown>; label: string }

const same = (a: unknown, v: string) => typeof a === 'string' && a.trim().toLowerCase() === v;
const swapScalar = (a: unknown, v: string, to: string) => (same(a, v) ? to : a);
function swapList(a: unknown, v: string, to: string): string[] | null {
  if (!Array.isArray(a) || !a.some((x) => same(x, v))) return null;
  const out: string[] = [];
  for (const x of a as string[]) {
    const next = same(x, v) ? to : x;
    if (!out.some((y) => y.toLowerCase() === next.toLowerCase())) out.push(next); // merging may collide
  }
  return out;
}
/** Deep copy of a sections map with every exact string match swapped. */
function swapSections(sections: Record<string, Record<string, unknown>> | undefined, v: string, to: string): Record<string, Record<string, unknown>> | null {
  if (!sections) return null;
  let touched = false;
  const out: Record<string, Record<string, unknown>> = {};
  for (const [k, sec] of Object.entries(sections)) {
    const next: Record<string, unknown> = {};
    for (const [f, val] of Object.entries(sec || {})) {
      if (same(val, v)) { next[f] = to; touched = true; }
      else {
        const list = swapList(val, v, to);
        if (list) { next[f] = list; touched = true; } else next[f] = val;
      }
    }
    out[k] = next;
  }
  return touched ? out : null;
}

export function planValueRewrite(type: string, from: string, to: string, d: CustomEntryData): ValueWrite[] {
  const v = from.trim().toLowerCase();
  const w: ValueWrite[] = [];
  if (!v || !to.trim()) return w;

  for (const dog of d.dogs) {
    const patch: Record<string, unknown> = {};
    if (type === 'breed' && same(dog.breed, v)) patch.breed = to;
    if (type === 'dog_purpose' && same(dog.purpose, v)) patch.purpose = to;
    if (type === 'patrol_type') { const l = swapList(dog.patrol_types, v, to); if (l) patch.patrol_types = l; }
    if (type === 'odor_category') { const l = swapList(dog.odor_types, v, to); if (l) patch.odor_types = l; }
    if (Object.keys(patch).length) w.push({ entity: 'dog', id: dog.id, patch, label: dog.name });
  }
  for (const ev of d.events) {
    if (type !== 'event_tag') break;
    const l = swapList(ev.tags, v, to);
    if (l) w.push({ entity: 'training_event', id: ev.id, patch: { tags: l }, label: ev.name });
  }
  for (const ex of d.exercises) {
    const patch: Record<string, unknown> = {};
    if (type === 'patrol_type') { const l = swapList(ex.patrol_types, v, to); if (l) patch.patrol_types = l; }
    if (type === 'odor_category' || type === 'odor_type' || type === 'packaging' || type === 'environment_type') {
      let touched = false;
      const envs = (ex.environments || []).map((env) => ({
        ...env,
        env_type: type === 'environment_type' && same(env.env_type, v) ? ((touched = true), to) : env.env_type,
        units: (env.units || []).map((u) => ({
          ...u,
          odors: (u.odors || []).map((o) => {
            const next = { ...o };
            if (type === 'odor_category' && same(o.category, v)) { next.category = to; touched = true; }
            if (type === 'odor_type' && same(o.type, v)) { next.type = to; touched = true; }
            if (type === 'packaging' && same(o.packaging, v)) { next.packaging = to; touched = true; }
            return next;
          }),
        })),
      }));
      if (touched) patch.environments = envs;
    }
    if (Object.keys(patch).length) w.push({ entity: 'exercise', id: ex.id, patch, label: ex.name });
  }
  for (const c of d.completions) {
    const patch: Record<string, unknown> = {};
    if (type === 'weather_condition' && same(c.weather?.conditions, v)) patch.weather = { ...c.weather, conditions: to };
    const s = swapSections(c.sections, v, to);
    if (s) patch.sections = s;
    if (Object.keys(patch).length) w.push({ entity: 'completion', id: c.id, patch, label: 'Completion' });
  }
  for (const dep of d.deployments) {
    const patch: Record<string, unknown> = {};
    if (type === 'deployment_tag') { const l = swapList(dep.tags, v, to); if (l) patch.tags = l; }
    if (type === 'requesting_unit' && same(dep.requesting_unit, v)) patch.requesting_unit = to;
    if (type === 'patrol_type') { const l = swapList(dep.patrol_types, v, to); if (l) patch.patrol_types = l; }
    if (type === 'weather_condition' && same(dep.weather?.conditions, v)) patch.weather = { ...dep.weather, conditions: to };
    const s = swapSections(dep.sections, v, to);
    if (s) patch.sections = s;
    if (Object.keys(patch).length) w.push({ entity: 'deployment', id: dep.id, patch, label: dep.case_number || 'Deployment' });
  }
  for (const cl of d.classes) {
    const patch: Record<string, unknown> = {};
    if (type === 'class_location' && same(cl.location, v)) patch.location = to;
    if (type === 'class_instructor' && same(cl.instructor, v)) patch.instructor = to;
    if (Object.keys(patch).length) w.push({ entity: 'class_record', id: cl.id, patch, label: cl.title });
  }
  for (const vv of d.vets) {
    if (type !== 'care_type') break;
    const l = swapList(vv.care_types, v, to);
    if (l) w.push({ entity: 'vet_visit', id: vv.id, patch: { care_types: l }, label: vv.name });
  }
  for (const vx of d.vaccinations) {
    if (type !== 'vaccine_type') break;
    if (same(vx.type, v)) w.push({ entity: 'vaccination', id: vx.id, patch: { type: to }, label: `Vaccination: ${vx.type}` });
  }
  void swapScalar;
  return w;
}
