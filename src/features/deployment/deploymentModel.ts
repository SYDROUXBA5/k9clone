// Deployment record — form model, vocabularies, defaults, normalisers and validation.
// The persisted shape is db/types.ts `Deployment`; the JSON blobs (`sections`, `detection`) are typed here.
// Units: imperial display, metric storage (track distance and area size are stored in metres / m²
// alongside the unit the handler typed so the form re-displays exactly what was entered).
import type { Arrest, Deployment, Dog, ExerciseKind, GeoLocation, RequestFulfillment, User, Weather } from '@/db/types';
import { DEPLOYMENT_PATROL_TYPES, REQUEST_FULFILLMENT } from '@/db/vocab';
import { deviceTimeZone, uuid } from '@/db/util';

// ---------- vocabularies (deployment-only; every dropdown also takes a typed custom value) ----------
export const DEPLOYMENT_SECTION_TYPES = DEPLOYMENT_PATROL_TYPES; // Non-Search · Tracking · Building Search · Area Search for Humans · Evidence Search
export const REASONS_FOR_DEPLOYMENT = [
  'Track', 'Area search', 'Building search', 'Article search', 'Narcotics sniff', 'Explosives sweep',
  'Apprehension', 'Demonstration', 'Handler protection', 'Warrant service', 'Traffic stop', 'Missing person', 'Alarm call',
] as const;
export const WARRANT_TYPES = ['Arrest warrant', 'Search warrant', 'Bench warrant', 'Probation / parole search', 'No warrant'] as const; // [OURS] list is API-served in the reference
export const OBSTRUCTION_TYPES = ['Fence', 'Water', 'Road crossing', 'Building', 'Vehicle', 'Dense brush', 'Steep terrain'] as const; // [OURS]
export const DISTANCE_UNITS = ['Yards', 'Feet', 'Miles', 'Meters', 'Kilometers'] as const;
export const AREA_UNITS = ['Square yards', 'Square feet', 'Acres', 'Square meters'] as const;
export const VEHICLE_TYPES = ['Passenger car', 'SUV', 'Pickup truck', 'Van', 'Motorcycle', 'Semi / tractor-trailer', 'Bus', 'Boat', 'RV'] as const;
export const CURRENCY_TYPES = ['USD', 'CAD', 'MXN', 'EUR', 'Other'] as const;
export const DEPLOYMENT_KINDS: readonly { value: ExerciseKind; label: string }[] = [
  { value: 'detection', label: 'Detection' },
  { value: 'patrol', label: 'Patrol' },
];
export const REQUEST_FULFILLMENT_LABEL: Record<RequestFulfillment, string> = Object.fromEntries(REQUEST_FULFILLMENT.map((r) => [r.value, r.label])) as Record<RequestFulfillment, string>;
export const DEMOGRAPHICS_CUTOVER = '2024-03-18'; // arrests before this date show a not-supported note instead of demographic fields
export const MAX_ARRESTS = 50;
export const CASE_NUMBER_MAX = 150;
export const NOTES_MAX = 32000;

/** Sample narrative templates that ship with the app (bar §2.6.5 row 2 — titles evidenced, text [OURS]). */
export const DEPLOYMENT_NARRATIVE_SAMPLES: { name: string; text: string }[] = [
  {
    name: 'DETECTION VEHICLE SEARCH.',
    text: 'On [date] at approximately [time], I was requested by [requesting unit] to conduct an exterior sniff of a [vehicle] stopped at [location]. K9 [dog] was deployed on lead and began a systematic search of the exterior of the vehicle starting at the front passenger side, working counter-clockwise. K9 [dog] showed a change of behaviour at the [location on vehicle] and gave a final trained response by [sitting/staring]. A search of the vehicle located [items] concealed [where]. [Outcome / arrests].',
  },
  {
    name: 'DETECTION PARCEL SEARCH.',
    text: 'On [date] at approximately [time], K9 [dog] and I responded to [location] at the request of [requesting unit] to conduct a sniff of [n] parcels. The parcels were placed in a line-up with [n] blank parcels. K9 [dog] was deployed on lead and worked the line-up. K9 [dog] gave a final trained response on parcel [n]. [Outcome].',
  },
  {
    name: 'PATROL BUILDING SEARCH.',
    text: 'On [date] at approximately [time], K9 [dog] and I responded to [location] for [reason]. Prior to deployment I gave [n] loud K9 announcements from [where] warning any occupants that a police dog would be released and that they may be bitten. No response was received. K9 [dog] was deployed [on/off] lead and searched [n] rooms in a systematic pattern. [Outcome: person located / not located, apprehension details, bite, medical].',
  },
];

// ---------- section shapes ----------
export interface NonSearchSection { warrant_types: string[] }
export interface BuildingSearchSection { building_types: string[]; other_building_type: string; search_duration_min: number | null; time_delay_min: number | null; area_size: number | null; area_unit: string; area_size_m2: number | null }
export interface HumanSearchSection { search_area_types: string[]; search_duration_min: number | null; area_size: number | null; area_unit: string; area_size_m2: number | null }
export interface EvidenceSearchSection { terrain_types: string[]; search_duration_min: number | null; article_description: string; area_size: number | null; area_unit: string; area_size_m2: number | null }
export interface TrackingSection {
  gps_found: boolean;
  track_distance: number | null; track_distance_unit: string; track_distance_m: number | null;
  tracking_duration_min: number | null;
  track_laid_time: string; track_followed_time: string; // HH:MM wall-clock in the record's zone
  track_turns: number | null; human_crossings: number | null; animals_on_track: number | null;
  terrain_types: string[]; obstruction_types: string[];
}
export type SectionData = NonSearchSection | BuildingSearchSection | HumanSearchSection | EvidenceSearchSection | TrackingSection;

export function emptySection(type: string): Record<string, unknown> {
  switch (type) {
    case 'Non-Search': return { warrant_types: [] } satisfies NonSearchSection;
    case 'Building Search': return { building_types: [], other_building_type: '', search_duration_min: null, time_delay_min: null, area_size: null, area_unit: 'Square yards', area_size_m2: null } satisfies BuildingSearchSection;
    case 'Area Search for Humans': return { search_area_types: [], search_duration_min: null, area_size: null, area_unit: 'Square yards', area_size_m2: null } satisfies HumanSearchSection;
    case 'Evidence Search': return { terrain_types: [], search_duration_min: null, article_description: '', area_size: null, area_unit: 'Square yards', area_size_m2: null } satisfies EvidenceSearchSection;
    case 'Tracking': return { gps_found: false, track_distance: null, track_distance_unit: 'Yards', track_distance_m: null, tracking_duration_min: null, track_laid_time: '', track_followed_time: '', track_turns: null, human_crossings: null, animals_on_track: null, terrain_types: [], obstruction_types: [] } satisfies TrackingSection;
    default: return {};
  }
}
/** Merge a stored section (possibly written by the seed with a different key set) over the empty shape. */
export function normalizeSection(type: string, raw: Record<string, unknown> | undefined): Record<string, unknown> {
  const base = emptySection(type);
  if (!raw) return base;
  const out: Record<string, unknown> = { ...base, ...raw };
  if (type === 'Tracking') {
    // seed stores metres only → re-derive the display value in yards
    if (out.track_distance == null && typeof raw.track_distance_m === 'number') { out.track_distance = Math.round(raw.track_distance_m * 1.09361); out.track_distance_unit = 'Yards'; }
    if (out.tracking_duration_min == null && typeof raw.track_duration_min === 'number') out.tracking_duration_min = raw.track_duration_min;
  }
  return out;
}

// ---------- detection ----------
export interface DetectionEnvironment { id: string; env_type: string; count: number | null }
export interface VehicleDetails { type: string; color: string; make: string; model: string; plate: string }
export interface DetectionIndication { id: string; name: string; description: string; environment_id: string; is_vehicle: boolean; vehicle: VehicleDetails }
export interface SeizureIncident { id: string; indication_id: string; odor_category: string; odor_type: string; amount: number | null; unit: string; packaging: string; concealed_location: string; description: string; photo_id: string | null }
export interface DetectionData {
  environments: DetectionEnvironment[];
  indications: DetectionIndication[];
  seizures: SeizureIncident[];
  currency_not_indicated: boolean | null; // drug detection dogs only
  currency_amount: number | null;
  currency_type: string;
  independent_information: boolean | null; // alerts without items seized → independent info that a target odor is present
  dog_assisted_arrests: number | null;
}
export const emptyVehicle = (): VehicleDetails => ({ type: '', color: '', make: '', model: '', plate: '' });
export function emptyDetection(): DetectionData {
  return { environments: [], indications: [], seizures: [], currency_not_indicated: null, currency_amount: null, currency_type: 'USD', independent_information: null, dog_assisted_arrests: null };
}
export const newEnvironment = (): DetectionEnvironment => ({ id: uuid(), env_type: '', count: 1 });
export const newIndication = (): DetectionIndication => ({ id: uuid(), name: '', description: '', environment_id: '', is_vehicle: false, vehicle: emptyVehicle() });
export const newSeizure = (): SeizureIncident => ({ id: uuid(), indication_id: '', odor_category: '', odor_type: '', amount: null, unit: 'Grams', packaging: '', concealed_location: '', description: '', photo_id: null });

/** Accepts the seed's looser shape ({environments:[{env_type,count,indication,vehicle}], items_seized:[…], currency_usd, justification}). */
export function normalizeDetection(raw: Record<string, unknown> | null | undefined): DetectionData {
  const d = emptyDetection();
  if (!raw) return d;
  const r = raw as Partial<DetectionData> & { items_seized?: Array<Record<string, unknown>>; currency_usd?: number; justification?: string; environments?: Array<Record<string, unknown>> };
  const envs = Array.isArray(r.environments) ? r.environments : [];
  for (const e of envs) {
    const env: DetectionEnvironment = { id: typeof e.id === 'string' ? e.id : uuid(), env_type: String(e.env_type || ''), count: typeof e.count === 'number' ? e.count : 1 };
    d.environments.push(env);
    if (e.indication === true) {
      const v = (e.vehicle || {}) as Partial<VehicleDetails>;
      d.indications.push({ id: uuid(), name: env.env_type === 'Vehicle' ? [v.color, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle' : env.env_type || 'Indication', description: '', environment_id: env.id, is_vehicle: env.env_type === 'Vehicle', vehicle: { ...emptyVehicle(), ...v } });
    }
  }
  if (Array.isArray(r.indications)) d.indications = r.indications.map((i) => ({ ...newIndication(), ...i, vehicle: { ...emptyVehicle(), ...(i.vehicle || {}) } }));
  if (Array.isArray(r.seizures)) d.seizures = r.seizures.map((s) => ({ ...newSeizure(), ...s }));
  else if (Array.isArray(r.items_seized)) {
    d.seizures = r.items_seized.map((s) => ({ ...newSeizure(), indication_id: d.indications[0]?.id || '', odor_category: String(s.odor_category || 'Drugs'), odor_type: String(s.odor_type || ''), amount: typeof s.grams === 'number' ? s.grams : (typeof s.amount === 'number' ? s.amount : null), unit: String(s.unit || 'Grams'), packaging: String(s.packaging || '') }));
  }
  if (typeof r.currency_not_indicated === 'boolean') d.currency_not_indicated = r.currency_not_indicated;
  if (typeof r.currency_amount === 'number') d.currency_amount = r.currency_amount;
  else if (typeof r.currency_usd === 'number' && r.currency_usd > 0) { d.currency_not_indicated = true; d.currency_amount = r.currency_usd; }
  if (typeof r.currency_type === 'string') d.currency_type = r.currency_type;
  if (typeof r.independent_information === 'boolean') d.independent_information = r.independent_information;
  else if (typeof r.justification === 'string' && r.justification) d.independent_information = true;
  if (typeof r.dog_assisted_arrests === 'number') d.dog_assisted_arrests = r.dog_assisted_arrests;
  return d;
}

// ---------- draft ----------
export interface DeploymentDraft {
  occurred_at: string | null;
  tz: string;
  location: GeoLocation;
  case_number: string;
  tags: string[];
  requesting_unit: string;
  reason: string;
  dog_id: string;
  request_fulfillment: RequestFulfillment;
  kind: ExerciseKind;
  patrol_types: string[];
  sections: Record<string, Record<string, unknown>>;
  people_found: number | null;
  people_unintentionally_bitten: number | null;
  arrests: Arrest[];
  detection: DetectionData;
  summary: string;
  weather: Weather | null;
  files: string[];
}

export const emptyLocation = (): GeoLocation => ({ name: '', address: '', address_line1: '', address_line2: '', city: '', region: '', postal_code: '', country: '', lat: null, lng: null });
export const newArrest = (n: number): Arrest => ({ id: uuid(), n, charges: '', demographics: { age: null, sex: '', race: '' }, subject_bitten: null });

export function emptyDraft(defaultDogId = ''): DeploymentDraft {
  return {
    occurred_at: new Date().toISOString(), tz: deviceTimeZone(), location: emptyLocation(), case_number: '', tags: [], requesting_unit: '', reason: '',
    dog_id: defaultDogId, request_fulfillment: 'deployed', kind: 'patrol', patrol_types: [], sections: {}, people_found: null, people_unintentionally_bitten: 0,
    arrests: [], detection: emptyDetection(), summary: '', weather: null, files: [],
  };
}
export function draftFromRecord(d: Deployment): DeploymentDraft {
  const sections: Record<string, Record<string, unknown>> = {};
  for (const p of d.patrol_types || []) sections[p] = normalizeSection(p, d.sections?.[p]);
  return {
    occurred_at: d.occurred_at, tz: d.tz || deviceTimeZone(), location: { ...emptyLocation(), ...(d.location || {}) }, case_number: d.case_number || '', tags: d.tags || [],
    requesting_unit: d.requesting_unit || '', reason: d.reason || '', dog_id: d.dog_id, request_fulfillment: d.request_fulfillment || 'deployed', kind: d.kind || 'patrol',
    patrol_types: d.patrol_types || [], sections, people_found: d.people_found ?? null, people_unintentionally_bitten: d.people_unintentionally_bitten ?? 0,
    arrests: (d.arrests || []).map((a, i) => ({ ...newArrest(i + 1), ...a, demographics: { ...{ age: null, sex: '', race: '' }, ...(a.demographics || {}) } })),
    detection: normalizeDetection(d.detection), summary: d.summary || '', weather: d.weather || null, files: d.files || [],
  };
}
/** The handler's most recent deployment that actually carries a Requesting Unit — a record saved with the
 *  field left blank must not erase what the dropdown remembers (field UX law: dropdowns remember values). */
export function lastWithRequestingUnit(recent: Deployment[]): Deployment | null {
  return recent.find((d) => (d.requesting_unit || '').trim()) || null;
}
/** Remembered dropdown values carried over from the handler's previous deployment (Requesting Unit only —
 *  no record-level clone of location / pin / dog / type exists in the reference; DECISIONS E10). */
export function prefillFrom(prev: Deployment, base: DeploymentDraft): DeploymentDraft {
  return { ...base, requesting_unit: prev.requesting_unit || '' };
}

export const isDeployed = (f: RequestFulfillment) => f === 'deployed';

// ---------- validation ----------
export type DraftErrors = Record<string, string>;
const isBlank = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** Save-draft rules: only the true minimum. */
export function validateDraft(d: DeploymentDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.occurred_at) e.occurred_at = 'Please enter the deployment date and time';
  else {
    const t = new Date(d.occurred_at).getTime();
    if (t > Date.now() + 365 * 86400000) e.occurred_at = "The deployment date can't be more than 1 year from now";
    if (t < Date.now() - 20 * 365 * 86400000) e.occurred_at = "The deployment date can't be less than 20 years ago";
  }
  if (!d.dog_id) e.dog_id = 'Please select a dog';
  if (!d.request_fulfillment) e.request_fulfillment = 'Please select a request fulfillment status';
  if (d.case_number.length > CASE_NUMBER_MAX) e.case_number = `Case Number is limited to ${CASE_NUMBER_MAX} characters`;
  if (d.people_found != null && d.arrests.length > d.people_found) e.people_found = `The number of people found must be greater or equal to the number of arrests (${d.arrests.length}).`;
  if (d.arrests.length > MAX_ARRESTS) e.arrests = `The number of arrests cannot be greater than ${MAX_ARRESTS}.`;
  d.arrests.forEach((a) => {
    if (a.demographics.age != null && (a.demographics.age < 1 || a.demographics.age > 254)) e[`arrest-${a.id}-age`] = a.demographics.age < 1 ? 'Age cannot be less than 1' : 'Age cannot be greater than 254';
  });
  return e;
}

/** Submit rules: everything the reference requires to complete the record. Returns human-named gaps. */
export function validateSubmit(d: DeploymentDraft): DraftErrors {
  const e = validateDraft(d);
  // Summary survives every fulfillment state — check it before the not-deployed short-circuit (critic PT-DEP-24)
  if (!d.summary.trim()) e.summary = 'Please enter your notes';
  if (!isDeployed(d.request_fulfillment)) return e; // not deployed / cancelled: General + Summary only
  if (d.kind === 'patrol' && !d.reason.trim()) e.reason = 'Please enter a deployment reason';
  if (d.kind === 'patrol' && d.patrol_types.length === 0) e.patrol_types = 'Please select a patrol type';
  for (const p of d.patrol_types) {
    const s = d.sections[p] || {};
    const key = (k: string) => `section-${p}-${k}`;
    if (p === 'Building Search') {
      if (isBlank(s.building_types)) e[key('building_types')] = 'You must choose at least one type';
      if (isBlank(s.search_duration_min)) e[key('search_duration_min')] = 'Please enter a search duration';
    }
    if (p === 'Area Search for Humans') {
      if (isBlank(s.search_area_types)) e[key('search_area_types')] = 'You must choose at least one type';
      if (isBlank(s.search_duration_min)) e[key('search_duration_min')] = 'Please enter a search duration';
    }
    if (p === 'Evidence Search') {
      if (isBlank(s.terrain_types)) e[key('terrain_types')] = 'You must choose at least one type';
      if (isBlank(s.search_duration_min)) e[key('search_duration_min')] = 'Please enter a search duration';
    }
    if (p === 'Tracking') {
      if (isBlank(s.track_distance)) e[key('track_distance')] = 'Please enter the track distance';
      if (isBlank(s.track_distance_unit)) e[key('track_distance_unit')] = 'Please select a distance unit';
      if (isBlank(s.tracking_duration_min)) e[key('tracking_duration_min')] = 'Please enter the tracking duration';
      if (isBlank(s.terrain_types)) e[key('terrain_types')] = 'You must choose at least one type';
    }
  }
  if (d.kind === 'patrol' && d.people_found == null) e.people_found = 'Please enter a number';
  d.arrests.forEach((a) => {
    if (a.demographics.age == null) e[`arrest-${a.id}-age`] = e[`arrest-${a.id}-age`] || 'Age is required';
    if (!a.demographics.sex) e[`arrest-${a.id}-sex`] = 'Sex At Birth is required';
    if (!a.demographics.race) e[`arrest-${a.id}-race`] = 'Race/Ethnicity is required';
  });
  if (d.kind === 'detection') {
    d.detection.environments.forEach((env) => {
      if (!env.env_type) e[`env-${env.id}-type`] = 'Please select an environment type';
      if (env.count == null || env.count < 1) e[`env-${env.id}-count`] = 'Please enter the total number of this type';
    });
    d.detection.indications.forEach((ind) => {
      if (!ind.name.trim()) e[`ind-${ind.id}-name`] = 'Please enter an environment name';
      if (ind.is_vehicle && (!ind.vehicle.make.trim() || !ind.vehicle.model.trim())) e[`ind-${ind.id}-vehicle`] = 'Please enter the vehicle make/model';
    });
    d.detection.seizures.forEach((s) => {
      if (!s.odor_type.trim()) e[`sz-${s.id}-type`] = 'Please specify an odor type';
      if (s.amount == null) e[`sz-${s.id}-amount`] = 'Please enter an amount';
      if (!s.unit) e[`sz-${s.id}-unit`] = 'Please choose an amount unit';
      if (!s.packaging.trim()) e[`sz-${s.id}-packaging`] = 'Please specify the odor packaging';
      if (!s.concealed_location.trim()) e[`sz-${s.id}-concealed`] = 'Please enter the concealed location';
    });
  }
  return e;
}

/** Human names for error keys, so the "what is missing" banner reads like a checklist. */
export function describeErrors(e: DraftErrors): string[] {
  const names: Record<string, string> = {
    occurred_at: 'Date & Time', dog_id: 'Dog', request_fulfillment: 'Request Fulfillment', reason: 'Reason For Deployment', patrol_types: 'Patrol Type',
    people_found: 'People Found (incl arrests)', arrests: 'Arrests', summary: 'Summary notes', case_number: 'Case Number',
  };
  const out: string[] = [];
  for (const [k, msg] of Object.entries(e)) {
    if (names[k]) out.push(`${names[k]}: ${msg}`);
    else if (k.startsWith('section-')) { const [, type, field] = k.split('-', 3); out.push(`${type} · ${fieldLabel(field)}: ${msg}`); }
    else if (k.startsWith('arrest-')) out.push(`Arrest: ${msg}`);
    else if (k.startsWith('env-')) out.push(`Environment: ${msg}`);
    else if (k.startsWith('ind-')) out.push(`Indication: ${msg}`);
    else if (k.startsWith('sz-')) out.push(`Seizure incident: ${msg}`);
    else out.push(msg);
  }
  return out;
}
function fieldLabel(k: string): string {
  const map: Record<string, string> = { building_types: 'Building Search Types', search_duration_min: 'Search Duration', search_area_types: 'Search Area Types', terrain_types: 'Terrain Types', track_distance: 'Track Distance', track_distance_unit: 'Distance unit', tracking_duration_min: 'Tracking Duration' };
  return map[k] || k;
}

// ---------- unit helpers ----------
export function distanceToMetres(v: number | null, unit: string): number | null {
  if (v == null || isNaN(v)) return null;
  const f: Record<string, number> = { Yards: 0.9144, Feet: 0.3048, Miles: 1609.344, Meters: 1, Kilometers: 1000 };
  return Math.round(v * (f[unit] ?? 0.9144) * 100) / 100;
}
export function areaToSquareMetres(v: number | null, unit: string): number | null {
  if (v == null || isNaN(v)) return null;
  const f: Record<string, number> = { 'Square yards': 0.836127, 'Square feet': 0.092903, Acres: 4046.86, 'Square meters': 1 };
  return Math.round(v * (f[unit] ?? 0.836127) * 100) / 100;
}
export function parseNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return isNaN(n) ? null : n;
}
export function parseInt0(s: string): number | null {
  const n = parseNum(s);
  return n == null ? null : Math.trunc(n);
}

// ---------- row/list helpers (also for U2's Records list and U6 reports) ----------
export function deploymentTitle(d: Pick<Deployment, 'case_number' | 'tags' | 'request_fulfillment' | 'kind' | 'patrol_types'>): string {
  const parts = [`Case: ${d.case_number?.trim() || 'N/A'}`];
  if (d.tags?.length) parts.push(d.tags.join(', '));
  if (d.request_fulfillment && d.request_fulfillment !== 'deployed') parts.push(REQUEST_FULFILLMENT_LABEL[d.request_fulfillment]);
  return parts.join(' · ');
}
export function deploymentTypeLabel(d: Pick<Deployment, 'request_fulfillment' | 'kind' | 'patrol_types'>): string {
  if (d.request_fulfillment === 'not_deployed') return 'Dog Not Deployed';
  if (d.request_fulfillment === 'cancelled_enroute') return 'Cancelled Enroute';
  if (d.kind === 'detection') return 'Detection';
  const p = d.patrol_types || [];
  return p.length > 1 ? 'Patrol: Scenario (multiple)' : p.length === 1 ? `Patrol: ${p[0]}` : 'Patrol';
}
/** Deployments that count but are excluded from statistics. */
export const excludedFromStats = (d: Pick<Deployment, 'request_fulfillment'>) => d.request_fulfillment !== 'deployed';

export function toRecord(draft: DeploymentDraft, base: { id: string; owner_user_id: string; handler_id: string }, mode: 'draft' | 'submit', existing?: Deployment | null): Partial<Deployment> & { id: string } {
  const now = new Date().toISOString();
  const deployed = isDeployed(draft.request_fulfillment);
  const sections: Record<string, Record<string, unknown>> = {};
  for (const p of draft.patrol_types) sections[p] = { ...(draft.sections[p] || emptySection(p)) };
  const submitted = mode === 'submit';
  const wasReviewed = existing && existing.review !== 'not_reviewed';
  return {
    id: base.id, owner_user_id: base.owner_user_id, handler_id: base.handler_id,
    occurred_at: draft.occurred_at!, tz: draft.tz, location: draft.location, case_number: draft.case_number.trim(), tags: draft.tags,
    requesting_unit: draft.requesting_unit, reason: draft.reason, dog_id: draft.dog_id, request_fulfillment: draft.request_fulfillment,
    kind: draft.kind, patrol_types: deployed && draft.kind === 'patrol' ? draft.patrol_types : [], sections: deployed && draft.kind === 'patrol' ? sections : {},
    people_found: deployed ? draft.people_found : null, people_unintentionally_bitten: deployed ? draft.people_unintentionally_bitten : null,
    arrests: deployed ? draft.arrests.map((a, i) => ({ ...a, n: i + 1 })) : [],
    detection: deployed && draft.kind === 'detection' ? (draft.detection as unknown as Record<string, unknown>) : null,
    summary: draft.summary, weather: draft.weather, files: draft.files,
    submitted_at: submitted ? now : existing?.submitted_at ?? null,
    // Save draft never un-completes a submitted record while notes remain (same rule as class records)
    is_complete: submitted || (!!existing?.is_complete && !!draft.summary.trim()),
    // a re-save after review/rejection goes back to Not Reviewed for re-review
    review: submitted || wasReviewed ? 'not_reviewed' : existing?.review ?? 'not_reviewed',
    reviewed_by: submitted || wasReviewed ? null : existing?.reviewed_by ?? null,
    reviewed_at: submitted || wasReviewed ? null : existing?.reviewed_at ?? null,
    rejection_reason: submitted || wasReviewed ? null : existing?.rejection_reason ?? null,
  };
}

/** Dogs a handler may pick for a deployment date (record-keeping window). */
export function dogsActiveOn(dogs: Dog[], iso: string | null): Dog[] {
  if (!iso) return dogs;
  const day = iso.slice(0, 10);
  return dogs.filter((d) => (!d.date_started || d.date_started <= day) && (!d.date_retired || d.date_retired >= day));
}
export function demographicsInReports(u: User | null | undefined): boolean {
  return u?.demographics_in_reports !== false;
}
