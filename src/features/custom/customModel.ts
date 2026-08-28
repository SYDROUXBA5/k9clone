// CUSTOM ENTRIES (bar §2.17 / PT-CUS-01…03) — the values handlers typed into a dropdown instead of
// picking one. The page needs three things the rows themselves don't carry: a friendly type label,
// the number of records that reference the value, and where "VIEW" should send you.
//
// Reference counting reads the records directly rather than trusting `use_count` (which only counts
// the times the dropdown remembered it), because delete is allowed ONLY when nothing references the
// value — a wrong count there would lose data.
import type {
  ClassRecord, Completion, CustomEntry, CustomEntryType, Deployment, Dog, Exercise, TrainingEvent, Vaccination, VetVisit,
} from '@/db/types';
import { CUSTOM_ENTRY_TYPE_LABEL } from '@/db/vocab';

export interface CustomEntryData {
  dogs: Dog[];
  events: TrainingEvent[];
  exercises: Exercise[];
  completions: Completion[];
  deployments: Deployment[];
  classes: ClassRecord[];
  vets: VetVisit[];
  vaccinations: Vaccination[];
}

export const TYPE_LABEL: Record<string, string> = {
  ...CUSTOM_ENTRY_TYPE_LABEL,
  dog_purpose: 'Type / Purpose',
  vaccine_type: 'Vaccine',
  class_location: 'Class Location',
  class_instructor: 'Instructor',
  requesting_unit: 'Requesting Unit',
  weather_condition: 'Weather',
  event_tag: 'Event Tags',
  deployment_tag: 'Deployment Tags',
};
export function typeLabel(type: string): string {
  return TYPE_LABEL[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

const eq = (a: unknown, b: string) => typeof a === 'string' && a.trim().toLowerCase() === b;
const inList = (a: unknown, b: string) => Array.isArray(a) && a.some((x) => eq(x, b));

/** Deep scan of a record's `sections` map for a value in any array or string field. */
function sectionsHave(sections: Record<string, Record<string, unknown>> | undefined, v: string): boolean {
  for (const sec of Object.values(sections || {})) {
    for (const val of Object.values(sec || {})) {
      if (eq(val, v) || inList(val, v)) return true;
    }
  }
  return false;
}

/**
 * How many saved records use this value. Unknown types fall back to a whole-record text scan so a
 * new custom type added by another unit still gets a truthful (never under-stated) count.
 */
export function countReferences(type: string, value: string, d: CustomEntryData): number {
  const v = value.trim().toLowerCase();
  if (!v) return 0;
  let n = 0;
  switch (type) {
    case 'breed': return d.dogs.filter((x) => eq(x.breed, v)).length;
    case 'dog_purpose': return d.dogs.filter((x) => eq(x.purpose, v)).length;
    case 'patrol_type':
      return d.dogs.filter((x) => inList(x.patrol_types, v)).length
        + d.exercises.filter((x) => inList(x.patrol_types, v)).length
        + d.deployments.filter((x) => inList(x.patrol_types, v)).length;
    case 'odor_category':
    case 'odor_type':
    case 'packaging':
    case 'environment_type':
      for (const ex of d.exercises) {
        for (const env of ex.environments || []) {
          if (type === 'environment_type' && eq(env.env_type, v)) { n++; continue; }
          for (const u of env.units || []) {
            for (const o of u.odors || []) {
              if ((type === 'odor_category' && eq(o.category, v))
                || (type === 'odor_type' && eq(o.type, v))
                || (type === 'packaging' && eq(o.packaging, v))) n++;
            }
          }
        }
      }
      return n;
    case 'event_tag': return d.events.filter((e) => inList(e.tags, v)).length;
    case 'deployment_tag': return d.deployments.filter((x) => inList(x.tags, v)).length;
    case 'requesting_unit': return d.deployments.filter((x) => eq(x.requesting_unit, v)).length;
    case 'weather_condition':
      return d.completions.filter((c) => eq(c.weather?.conditions, v)).length
        + d.deployments.filter((x) => eq(x.weather?.conditions, v)).length;
    case 'care_type': return d.vets.filter((x) => inList(x.care_types, v)).length;
    case 'vaccine_type': return d.vaccinations.filter((x) => eq(x.type, v)).length;
    case 'class_location': return d.classes.filter((x) => eq(x.location, v)).length;
    case 'class_instructor': return d.classes.filter((x) => eq(x.instructor, v)).length;
    case 'terrain_type':
    case 'contaminant_type':
    case 'search_area_type':
    case 'building_type':
    case 'equipment':
      return d.completions.filter((c) => sectionsHave(c.sections, v)).length
        + d.deployments.filter((x) => sectionsHave(x.sections, v)).length;
    default:
      // Unknown / future type: count anything whose serialised row mentions the value.
      for (const list of [d.exercises, d.completions, d.deployments, d.classes, d.vets] as { length: number }[]) {
        for (const row of list as unknown as Record<string, unknown>[]) {
          if (JSON.stringify(row).toLowerCase().includes(v)) n++;
        }
      }
      return n;
  }
}

export interface CustomEntryRow {
  entry: CustomEntry;
  type: string;
  typeLabel: string;
  value: string;
  ownerName: string;
  shared: boolean;
  references: number;
  /** Parity: delete is offered only when nothing references the value (PT-CUS-03). */
  canDelete: boolean;
  /** Records filter that VIEW applies, or null when the value is not one the hub searches on. */
  viewHref: string | null;
}

// ---------------------------------------------------------------------------------------------
// Where VIEW goes
// ---------------------------------------------------------------------------------------------
/**
 * The Records hub searches record NAMES, locations, tags, agencies, instructors, care types and
 * comments — not the deep section fields (a packaging, a terrain, a weather reading live several
 * levels inside an exercise). So VIEW only hands a value to `/records?q=…` when the hub can really
 * find it; every other value gets the list built here instead, which is the same list the reference
 * count is computed from. A VIEW that opened an empty Records page would be a lie either way.
 */
export const RECORDS_SEARCH_TYPE: Record<string, string> = {
  requesting_unit: 'Deployment',
  deployment_tag: 'Deployment',
  event_tag: 'Training',
  care_type: 'Vet Visit',
  class_location: 'Class',
  class_instructor: 'Class',
};

export interface UsageRow {
  id: string;
  /** Record kind, in the hub's own words. */
  kind: string;
  title: string;
  subtitle: string;
  at: string;
  href: string;
}

/** The records that actually carry this value — the rows behind the reference count. */
export function referencingRecords(type: string, value: string, d: CustomEntryData): UsageRow[] {
  const v = value.trim().toLowerCase();
  const out: UsageRow[] = [];
  if (!v) return out;
  const eventById = new Map(d.events.map((e) => [e.id, e]));
  const pushEvent = (eventId: string, why: string) => {
    const ev = eventById.get(eventId);
    if (!ev || out.some((r) => r.id === ev.id)) return;
    out.push({ id: ev.id, kind: 'Training', title: ev.name || 'Training', subtitle: why, at: ev.starts_at, href: `/records/training/${ev.id}` });
  };
  const pushDeployment = (x: Deployment, why: string) => {
    if (out.some((r) => r.id === x.id)) return;
    out.push({ id: x.id, kind: 'Deployment', title: x.case_number || 'Deployment', subtitle: why, at: x.occurred_at, href: `/records/deployment/${x.id}` });
  };

  switch (type) {
    case 'breed':
    case 'dog_purpose':
      for (const dog of d.dogs) {
        if (eq(type === 'breed' ? dog.breed : dog.purpose, v)) {
          out.push({ id: dog.id, kind: 'Dog', title: dog.name, subtitle: [dog.breed, dog.purpose].filter(Boolean).join(' · '), at: dog.created_at, href: `/dogs/${dog.id}` });
        }
      }
      break;
    case 'patrol_type':
      for (const dog of d.dogs) if (inList(dog.patrol_types, v)) out.push({ id: dog.id, kind: 'Dog', title: dog.name, subtitle: 'Trained patrol type', at: dog.created_at, href: `/dogs/${dog.id}` });
      for (const ex of d.exercises) if (inList(ex.patrol_types, v)) pushEvent(ex.event_id, `Exercise: ${ex.name}`);
      for (const x of d.deployments) if (inList(x.patrol_types, v)) pushDeployment(x, 'Patrol type');
      break;
    case 'odor_category':
    case 'odor_type':
    case 'packaging':
    case 'environment_type':
      for (const ex of d.exercises) {
        for (const env of ex.environments || []) {
          if (type === 'environment_type' && eq(env.env_type, v)) { pushEvent(ex.event_id, `Exercise: ${ex.name} — environment`); continue; }
          for (const u of env.units || []) {
            for (const o of u.odors || []) {
              if ((type === 'odor_category' && eq(o.category, v)) || (type === 'odor_type' && eq(o.type, v)) || (type === 'packaging' && eq(o.packaging, v))) {
                pushEvent(ex.event_id, `Exercise: ${ex.name} — ${u.name || env.env_type}`);
              }
            }
          }
        }
      }
      break;
    case 'event_tag':
      for (const e of d.events) if (inList(e.tags, v)) pushEvent(e.id, 'Tag on the training event');
      break;
    case 'deployment_tag':
      for (const x of d.deployments) if (inList(x.tags, v)) pushDeployment(x, 'Tag on the deployment');
      break;
    case 'requesting_unit':
      for (const x of d.deployments) if (eq(x.requesting_unit, v)) pushDeployment(x, 'Requesting agency');
      break;
    case 'weather_condition':
      for (const c of d.completions) if (eq(c.weather?.conditions, v)) pushEvent(c.event_id, 'Weather on a completed exercise');
      for (const x of d.deployments) if (eq(x.weather?.conditions, v)) pushDeployment(x, 'Weather on the deployment');
      break;
    case 'care_type':
      for (const x of d.vets) if (inList(x.care_types, v)) out.push({ id: x.id, kind: 'Vet Visit', title: x.name || 'Vet visit', subtitle: 'Veterinary care type', at: x.date, href: `/records/vet/${x.id}` });
      break;
    case 'vaccine_type':
      for (const x of d.vaccinations) {
        if (!eq(x.type, v)) continue;
        const visit = x.vet_visit_id ? d.vets.find((y) => y.id === x.vet_visit_id) : undefined;
        out.push({ id: x.id, kind: 'Vet Visit', title: visit?.name || 'Vet visit', subtitle: `${x.type} given`, at: x.given_at, href: visit ? `/records/vet/${visit.id}` : '/vaccines' });
      }
      break;
    case 'class_location':
    case 'class_instructor':
      for (const x of d.classes) {
        if (eq(type === 'class_location' ? x.location : x.instructor, v)) {
          out.push({ id: x.id, kind: 'Class', title: x.title || 'Class', subtitle: type === 'class_location' ? x.location : `Instructor: ${x.instructor}`, at: x.occurred_at, href: `/records/class/${x.id}` });
        }
      }
      break;
    default:
      for (const c of d.completions) if (sectionsHave(c.sections, v)) pushEvent(c.event_id, 'Recorded on a completed exercise');
      for (const x of d.deployments) if (sectionsHave(x.sections, v)) pushDeployment(x, 'Recorded on the deployment');
      break;
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export function buildRows(entries: CustomEntry[], data: CustomEntryData, nameOf: (id: string) => string): CustomEntryRow[] {
  return entries
    .map((e) => {
      const references = countReferences(e.type, e.value, data);
      return {
        entry: e,
        type: e.type,
        typeLabel: typeLabel(e.type),
        value: e.value,
        ownerName: nameOf(e.owner_user_id),
        shared: !!e.is_shared_standard,
        references,
        canDelete: references === 0,
        viewHref: references > 0 && RECORDS_SEARCH_TYPE[e.type]
          ? `/records?q=${encodeURIComponent(e.value)}&type=${encodeURIComponent(RECORDS_SEARCH_TYPE[e.type])}`
          : null,
      };
    })
    .sort((a, b) => a.typeLabel.localeCompare(b.typeLabel) || a.value.localeCompare(b.value));
}

export function groupByType(rows: CustomEntryRow[]): { type: string; label: string; rows: CustomEntryRow[] }[] {
  const map = new Map<string, CustomEntryRow[]>();
  for (const r of rows) {
    if (!map.has(r.type)) map.set(r.type, []);
    map.get(r.type)!.push(r);
  }
  return [...map.entries()]
    .map(([type, list]) => ({ type, label: typeLabel(type), rows: list }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Types a supervisor / trainer may push as a department standard. */
export const SHAREABLE_TYPES: (CustomEntryType | string)[] = [
  'requesting_unit', 'packaging', 'odor_type', 'event_tag', 'deployment_tag', 'weather_condition',
  'care_type', 'environment_type', 'patrol_type', 'equipment', 'other',
];

export type EditMode = 'rename' | 'merge';

/** Plain-English preview of what Save will do — the reference explains it before you commit. */
export function describeEdit(mode: EditMode, row: CustomEntryRow, target: string): string {
  if (mode === 'merge') {
    return row.references === 0
      ? `“${row.value}” is removed and “${target}” stays in the dropdown. No record changes because nothing uses “${row.value}”.`
      : `“${row.value}” is removed and its ${row.references} record${row.references === 1 ? '' : 's'} are re-pointed at “${target}”.`;
  }
  return row.references === 0
    ? `The dropdown will offer “${target}” instead of “${row.value}”. No records change.`
    : `“${row.value}” becomes “${target}” everywhere, including the ${row.references} record${row.references === 1 ? '' : 's'} that use it.`;
}
