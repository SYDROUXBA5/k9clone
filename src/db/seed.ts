// Demo seed — the Ashcombe PD department from docs/DEMO-LOGINS.md plus ~40 realistic records over
// the last 90 days. Deterministic (seeded RNG, fixed ids) so screenshots are stable.
// seedDemo(repo, count) — count = number of records (default 40); 1000 exercises the report test.
import { DEMO_PASSWORD } from '@/config';
import type { Repository, WriteOptions } from './repository';
import type {
  Arrest, ClassRecord, Completion, CustomEntry, Deployment, Document, Dog, Exercise, ExerciseDetails, ExerciseEnvironment,
  ManagementGroup, NarrativeTemplate, Notification, ReviewState, Seat, TrainingEvent, TrainingGroup,
  User, VetVisit, Vaccination, Weather, Role, RoleAssignment, Agency, Location,
} from './types';
import type { EntityName } from './types';
import { seededRandom } from './util';

export const DEMO_TZ = 'America/New_York';
const DAY = 86400000;

// Fixed ids keep links stable across reseeds.
export const IDS = {
  agencyAshcombe: 'ag-ashcombe',
  agencyWells: 'ag-wells',
  mia: 'u-mia',
  theo: 'u-theo',
  priya: 'u-priya',
  cole: 'u-sgt-cole',
  marsh: 'u-lt-marsh',
  hale: 'u-sgt-hale', // supervisor MANAGED BY cole → the Manage "Managed Supervisors" table has a row

  rook: 'd-rook',
  juno: 'd-juno',
  bear: 'd-bear',
  vex: 'd-vex',
  ace: 'd-ace',
  trainingGroup: 'tg-ashcombe-k9',
  mgmtGroup: 'mg-cole',
  haleGroup: 'mg-hale',
  trainerGroup: 'mg-priya-trainer',
};

interface Ctx { repo: Repository; rnd: () => number; now: Date; }
/** What seedTraining / seedDeployments hand back so tracks and trainer comments can attach to REAL
 *  records — a track or a comment nobody's record points at is dead data no report could ever show. */
interface SeededCompletion { id: string; ownerId: string; dogId: string; startsAt: Date; isTracking: boolean }
interface SeededDeployment { id: string; ownerId: string; dogId: string; occurredAt: Date; kind: 'detection' | 'patrol' }

function pick<T>(rnd: () => number, arr: readonly T[]): T { return arr[Math.floor(rnd() * arr.length)]; }
function chance(rnd: () => number, p: number) { return rnd() < p; }
function daysAgo(now: Date, d: number, hour = 9, minute = 0): Date {
  const t = new Date(now.getTime() - d * DAY);
  t.setHours(hour, minute, 0, 0);
  return t;
}
const iso = (d: Date) => d.toISOString();
/** Seeded "saved / reviewed" instants must never sit in the future (History is reverse-chron from the real now;
 *  ctx.now is anchored to noon today only so day offsets stay deterministic). */
const notFuture = (d: Date) => (d.getTime() >= Date.now() ? new Date(Date.now() - 60000) : d);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

const LOCATIONS = [
  { name: 'Ashcombe PD Training Yard', address: '1200 Foundry Rd, Ashcombe, OH 43000', lat: 40.0812, lng: -82.9013 },
  { name: 'Miller Field Warehouse', address: '4410 Grange Ave, Ashcombe, OH 43000', lat: 40.0774, lng: -82.9182 },
  { name: 'Ridge Park', address: '88 Ridge Park Dr, Ashcombe, OH 43000', lat: 40.0951, lng: -82.8877 },
  { name: 'Ashcombe High School', address: '600 Prospect St, Ashcombe, OH 43000', lat: 40.0888, lng: -82.9105 },
  { name: 'County Fairgrounds', address: '2 Fair Ln, Ashcombe, OH 43000', lat: 40.1023, lng: -82.9301 },
  { name: 'Northgate Mall Lot', address: '900 Northgate Blvd, Ashcombe, OH 43000', lat: 40.1101, lng: -82.9020 },
];

const WEATHER_SAMPLES: Weather[] = [
  { temp_c: 22, humidity: 55, wind_kph: 10, wind_dir: 'E', conditions: 'Partly Cloudy', source: 'seed' },
  { temp_c: 27, humidity: 62, wind_kph: 6, wind_dir: 'SW', conditions: 'Sunny', source: 'seed' },
  { temp_c: 18, humidity: 80, wind_kph: 20, wind_dir: 'NW', conditions: 'Overcast', source: 'seed' },
  { temp_c: 15, humidity: 90, wind_kph: 14, wind_dir: 'N', conditions: 'Rain', source: 'seed' },
  { temp_c: 30, humidity: 48, wind_kph: 3, wind_dir: 'S', conditions: 'Clear', source: 'seed' },
  { temp_c: 24, humidity: 70, wind_kph: 26, wind_dir: 'W', conditions: 'Windy', source: 'seed' },
];

const NARRATIVES = [
  'K9 was deployed on lead. Handler gave the search command and worked the area in a systematic grid pattern from downwind. K9 showed a change of behavior at the second vehicle, bracketed the rear passenger door and gave a trained final response (sit). Reward delivered at source.',
  'Started the exercise with a short obedience warm-up. K9 responded to all commands on the first cue with good focus. Down-stay held for two minutes with the handler out of sight.',
  'Track was laid 45 minutes prior across mixed terrain. K9 picked up the track at the start flag, negotiated three turns and one hard-surface crossing and located the decoy at the end of the track. Handler observed head-up behavior at the parking-lot crossing but K9 self-corrected.',
  'Building search conducted with the K9 off lead. K9 cleared four rooms and indicated on the closet in the third room where the decoy was concealed. Recall was clean. No unintended contact.',
  'Controlled negative sniff — no odor placed. K9 worked all six lockers with no change of behavior and no indication. Reward given for a clean sniff.',
];

const CLASSES = [
  { title: 'Tracking training best practices', instructor: 'R. Alvarez', location: 'County Sheriff Training Room 2', notes: 'Half-day class on aged tracks, wind and terrain. Reviewed article searches after the track.' },
  { title: 'Courtroom testimony for K9 handlers', instructor: 'Assistant DA K. Osei', location: 'County Courthouse Annex', notes: 'How to explain training records and reliability on the stand.' },
  { title: 'Canine first aid refresher', instructor: 'Dr. L. Petrov DVM', location: 'Sandy Creek Veterinary Clinic', notes: 'Heat injury, GDV recognition, field trauma kit.' },
];

export async function seedDemo(repo: Repository, count = 40): Promise<{ records: number }> {
  const rnd = seededRandom(20260818 + count);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const ctx: Ctx = { repo, rnd, now };
  await repo.clear();

  await seedAccounts(ctx);
  await seedDogs(ctx);
  await seedGroups(ctx);
  await seedCustomEntries(ctx);
  await seedTemplates(ctx);
  const trainingCount = Math.max(5, count - 17);
  const trained = await seedTraining(ctx, trainingCount);
  await seedTrackingExercise(ctx);
  const deployments = count >= 40 ? 10 : Math.max(2, Math.round(count * 0.25));
  const deployed = await seedDeployments(ctx, deployments);
  await seedClasses(ctx);
  await seedVet(ctx);
  await seedTracksAndComments(ctx, trained, deployed);
  await seedNotifications(ctx);
  await seedHighHours(ctx); // U5: Mia is the ≥16 h "green bar" handler this month (Manage)
  await repo.flush();
  // +1 for the open Tracking exercise seeded above.
  return { records: trainingCount + 1 + deployments + 3 + 4 };
}

// ---------- accounts ----------
async function seedAccounts({ repo, now }: Ctx) {
  const at = iso(daysAgo(now, 120));
  const agencies: Agency[] = [
    { id: IDS.agencyAshcombe, owner_user_id: 'system', created_at: at, updated_at: at, kind: 'agency', name: 'Ashcombe PD' },
    { id: IDS.agencyWells, owner_user_id: 'system', created_at: at, updated_at: at, kind: 'agency', name: 'Wells County SO' },
  ];
  for (const a of agencies) await repo.upsert('agency', a, { silent: true, at, actor_id: 'system' });

  const users: Array<Omit<User, 'created_at' | 'updated_at' | 'owner_user_id'>> = [
    { id: IDS.mia, email: 'mia@demo.k9', first_name: 'Mia', last_name: 'Torres', name: 'Mia Torres', agency_id: IDS.agencyAshcombe, department: 'Ashcombe PD', roles: ['handler'], password: DEMO_PASSWORD },
    { id: IDS.theo, email: 'theo@demo.k9', first_name: 'Theo', last_name: 'Brandt', name: 'Theo Brandt', agency_id: IDS.agencyAshcombe, department: 'Ashcombe PD', roles: ['handler'], password: DEMO_PASSWORD },
    { id: IDS.priya, email: 'priya@demo.k9', first_name: 'Priya', last_name: 'Nair', name: 'Priya Nair', agency_id: IDS.agencyAshcombe, department: 'Ashcombe PD', roles: ['handler', 'trainer'], password: DEMO_PASSWORD },
    // SUP-07: Cole receives the seeded "Records ready for review" alert, so that opt-in type is ticked
    // for him — the Notifications preference table and the notification list must agree on screen.
    { id: IDS.cole, email: 'sgt.cole@demo.k9', first_name: 'Daniel', last_name: 'Cole', name: 'Sgt. Daniel Cole', agency_id: IDS.agencyAshcombe, department: 'Ashcombe PD', roles: ['supervisor', 'billing_manager'], password: DEMO_PASSWORD, notification_prefs: { exercise_ready_for_supervisor_review: { in_app: true, email: true, mobile: true } } },
    { id: IDS.marsh, email: 'lt.marsh@demo.k9', first_name: 'Renee', last_name: 'Marsh', name: 'Lt. Renee Marsh', agency_id: IDS.agencyWells, department: 'Wells County SO', roles: ['supervisor'], password: DEMO_PASSWORD },
    // Cole manages Hale, Hale supervises Theo → a real two-level hierarchy behind Manage → Managed Supervisors.
    { id: IDS.hale, email: 'sgt.hale@demo.k9', first_name: 'Owen', last_name: 'Hale', name: 'Sgt. Owen Hale', agency_id: IDS.agencyAshcombe, department: 'Ashcombe PD — K9 Squad B', roles: ['supervisor'], password: DEMO_PASSWORD },
  ];
  for (const u of users) {
    await repo.upsert('user', { ...u, owner_user_id: u.id, demographics_in_reports: true, dark_mode: false }, { silent: true, at, actor_id: 'system' });
    for (const role of u.roles as Role[]) {
      const ra: Partial<RoleAssignment> = { id: `ra-${u.id}-${role}`, owner_user_id: u.id, user_id: u.id, role, granted_at: at };
      await repo.upsert('role_assignment', ra, { silent: true, at, actor_id: 'system' });
    }
  }
  // Seats: mia annual (active), theo trial expired 5 days ago (billing banner), priya monthly (active).
  const seats: Partial<Seat>[] = [
    { id: 'seat-mia', owner_user_id: IDS.mia, user_id: IDS.mia, plan: 'annual', starts: iso(daysAgo(now, 100)), ends: iso(daysAgo(now, -265)), paid_by: IDS.cole, status: 'active' },
    { id: 'seat-theo', owner_user_id: IDS.theo, user_id: IDS.theo, plan: 'trial', starts: iso(daysAgo(now, 35)), ends: iso(daysAgo(now, 5)), paid_by: null, status: 'expired' },
    { id: 'seat-priya', owner_user_id: IDS.priya, user_id: IDS.priya, plan: 'monthly', starts: iso(daysAgo(now, 20)), ends: iso(daysAgo(now, -10)), paid_by: IDS.priya, status: 'active' },
  ];
  for (const s of seats) await repo.upsert('seat', s, { silent: true, at, actor_id: 'system' });
}

// ---------- dogs ----------
async function seedDogs({ repo, now }: Ctx) {
  const at = iso(daysAgo(now, 110, 8));
  const dogs: Array<Partial<Dog> & { id: string; owner_user_id: string }> = [
    { id: IDS.rook, owner_user_id: IDS.mia, name: 'Rook', breed: 'German Shepherd', purpose: 'Dual Purpose (Narcotics/Patrol)', sex: 'male', dob: '2021-03-14', date_started: '2022-09-01', patrol_types: ['Obedience', 'Tracking', 'Building Search', 'Area Search for Humans', 'Criminal Apprehension / Aggression Control'], odor_types: ['Drugs'], status: 'active', is_default: true },
    { id: IDS.juno, owner_user_id: IDS.mia, name: 'Juno', breed: 'Belgian Malinois', purpose: 'Explosive Detection', sex: 'female', dob: '2022-06-02', date_started: '2023-11-15', patrol_types: [], odor_types: ['Explosives', 'Firearms'], status: 'active' },
    { id: IDS.bear, owner_user_id: IDS.theo, name: 'Bear', breed: 'Dutch Shepherd', purpose: 'Dual Purpose (Narcotics/Patrol)', sex: 'male', dob: '2020-10-21', date_started: '2022-02-01', patrol_types: ['Obedience', 'Tracking', 'Building Search', 'Area Search for Evidence', 'Criminal Apprehension / Aggression Control'], odor_types: ['Drugs'], status: 'active', is_default: true },
    { id: IDS.ace, owner_user_id: IDS.theo, name: 'Ace', breed: 'Labrador Retriever', purpose: 'Narcotics Detection', sex: 'male', dob: '2015-01-09', date_started: '2016-06-01', date_retired: '2024-12-31', patrol_types: [], odor_types: ['Drugs', 'Currency'], status: 'retired' },
    { id: IDS.vex, owner_user_id: IDS.priya, name: 'Vex', breed: 'Belgian Malinois', purpose: 'Patrol Apprehension & Tracking', sex: 'female', dob: '2021-11-30', date_started: '2023-04-01', patrol_types: ['Obedience', 'Agility / Obstacle Course', 'Tracking', 'Building Search', 'Criminal Apprehension / Aggression Control'], odor_types: [], status: 'active', is_default: true },
  ];
  for (const d of dogs) {
    await repo.upsert('dog', d, { at, actor_id: d.owner_user_id });
    await repo.upsert('dog_assignment', { id: `da-${d.id}`, owner_user_id: d.owner_user_id, dog_id: d.id, handler_id: d.owner_user_id, from: at, to: d.date_retired ? d.date_retired + 'T00:00:00.000Z' : null }, { silent: true, at, actor_id: d.owner_user_id });
  }
  // A couple of dog-owned documents. Without these the dog Documents panel only ever renders its
  // empty state, so the read-only table a supervisor sees on another handler's dog has no rows to
  // show. owner_user_id stays the handler: the file hangs off the dog, but it is the handler's.
  const dogDocs: Array<Partial<Document> & { id: string }> = [
    { id: 'doc-rook-cert', owner_type: 'dog', owner_id: IDS.rook, owner_user_id: IDS.mia, category: 'Certifications', kind: 'file', name: 'Rook — Patrol certification 2026.pdf', uri: 'demo://documents/rook-patrol-cert-2026.pdf', mime: 'application/pdf', size_bytes: 184320 },
    { id: 'doc-rook-photo', owner_type: 'dog', owner_id: IDS.rook, owner_user_id: IDS.mia, category: 'Photos', kind: 'photo', name: 'Rook — profile photo.jpg', uri: 'demo://documents/rook-profile.jpg', mime: 'image/jpeg', size_bytes: 512000 },
  ];
  for (const d of dogDocs) await repo.upsert('document', d, { silent: true, at, actor_id: IDS.mia });

  // Saved locations
  for (const [i, l] of LOCATIONS.entries()) {
    const loc: Partial<Location> = { id: `loc-${i}`, owner_user_id: IDS.mia, ...l, use_count: 3, last_used_at: at };
    await repo.upsert('location', loc, { silent: true, at, actor_id: IDS.mia });
  }
}

// ---------- groups ----------
async function seedGroups({ repo, now }: Ctx) {
  const at = iso(daysAgo(now, 105, 10));
  const tg: Partial<TrainingGroup> = {
    id: IDS.trainingGroup, owner_user_id: IDS.priya, name: 'ASHCOMBE-K9', code: 'ASH7K9Q',
    leader_id: IDS.priya, leaders: [IDS.priya], members: [IDS.priya, IDS.mia, IDS.theo], pending: [],
  };
  await repo.upsert('training_group', tg, { at, actor_id: IDS.priya });
  const mg: Partial<ManagementGroup> = {
    id: IDS.mgmtGroup, owner_user_id: IDS.cole, type: 'supervisor', manager_id: IDS.cole,
    members: [IDS.mia, IDS.theo, IDS.priya, IDS.hale], pending: [], name: 'Ashcombe K9 Unit',
  };
  await repo.upsert('management_group', mg, { at, actor_id: IDS.cole });
  // Sgt. Hale is a supervisor inside Cole's group and supervises Theo himself: Manage → Managed Supervisors
  // shows Name (+ agency) · Handlers · Supervisors · ⋯, and Cole reaches Theo through two levels.
  const hg: Partial<ManagementGroup> = {
    id: IDS.haleGroup, owner_user_id: IDS.hale, type: 'supervisor', manager_id: IDS.hale,
    members: [IDS.theo], pending: [], name: 'Ashcombe K9 Squad B',
  };
  await repo.upsert('management_group', hg, { at, actor_id: IDS.hale });
  // Priya also trains Mia and Theo → her Trainer role has handlers to manage.
  const tmg: Partial<ManagementGroup> = {
    id: IDS.trainerGroup, owner_user_id: IDS.priya, type: 'trainer', manager_id: IDS.priya,
    members: [IDS.mia, IDS.theo], pending: [], name: 'Ashcombe K9 Trainer Group',
  };
  await repo.upsert('management_group', tmg, { at, actor_id: IDS.priya });
  const pairs: [string, string, 'supervisor' | 'training_group'][] = [
    [IDS.mia, IDS.theo, 'training_group'], [IDS.mia, IDS.priya, 'training_group'], [IDS.theo, IDS.priya, 'training_group'],
  ];
  for (const [a, b, via] of pairs) {
    await repo.upsert('connection', { id: `cx-${a}-${b}`, owner_user_id: a, user_id: a, connected_user_id: b, via }, { silent: true, at, actor_id: 'system' });
    await repo.upsert('connection', { id: `cx-${b}-${a}`, owner_user_id: b, user_id: b, connected_user_id: a, via }, { silent: true, at, actor_id: 'system' });
  }
}

// ---------- custom entries + templates ----------
async function seedCustomEntries({ repo, now }: Ctx) {
  const at = iso(daysAgo(now, 60, 14));
  const entries: Array<Partial<CustomEntry> & { owner_user_id: string }> = [
    { id: 'ce-1', owner_user_id: IDS.cole, type: 'requesting_unit', value: 'Ashcombe Patrol Division', is_shared_standard: true, use_count: 6 },
    { id: 'ce-2', owner_user_id: IDS.cole, type: 'requesting_unit', value: 'School District #42', is_shared_standard: true, use_count: 2 },
    { id: 'ce-3', owner_user_id: IDS.mia, type: 'requesting_unit', value: 'Wells County SO', is_shared_standard: false, use_count: 1 },
    { id: 'ce-4', owner_user_id: IDS.mia, type: 'packaging', value: 'Vacuum-sealed bag', is_shared_standard: false, use_count: 3 },
    { id: 'ce-5', owner_user_id: IDS.priya, type: 'event_tag', value: 'Night Training', is_shared_standard: false, use_count: 2 },
    { id: 'ce-6', owner_user_id: IDS.mia, type: 'deployment_tag', value: 'School Sweep', is_shared_standard: false, use_count: 2 },
    { id: 'ce-7', owner_user_id: IDS.mia, type: 'weather_condition', value: 'Humid', is_shared_standard: false, use_count: 1 },
  ];
  for (const e of entries) await repo.upsert('custom_entry', e, { at, actor_id: e.owner_user_id });
}
async function seedTemplates({ repo, now }: Ctx) {
  const at = iso(daysAgo(now, 58, 15));
  const templates: Array<Partial<NarrativeTemplate>> = [
    { id: 'nt-1', owner_user_id: IDS.mia, name: 'Vehicle sniff — standard', scope: 'comments', text: 'K9 [dog] was deployed on lead to conduct an exterior sniff of [n] vehicles. Handler began downwind and worked each vehicle clockwise. [Result].' },
    { id: 'nt-2', owner_user_id: IDS.mia, name: 'Building search — standard', scope: 'comments', text: 'K9 [dog] was deployed off lead after two announcements with no response. K9 searched [n] rooms in a systematic pattern. [Result].' },
    { id: 'nt-3', owner_user_id: IDS.mia, name: 'Track — standard', scope: 'comments', text: 'Track laid at [time], aged [age] minutes over [terrain]. K9 [dog] committed to the track at the start point and followed [n] turns to the decoy.' },
    { id: 'nt-4', owner_user_id: IDS.priya, name: 'Group exercise goal', scope: 'goal', text: 'Handlers will read change of behavior and reward at source. Focus on leash handling and search pattern.' },
  ];
  for (const t of templates) await repo.upsert('narrative_template', t, { at, actor_id: t.owner_user_id });
}

// ---------- training ----------
type Handler = { id: string; dogs: string[] };
const HANDLERS: Handler[] = [
  { id: IDS.mia, dogs: [IDS.rook, IDS.juno] },
  { id: IDS.theo, dogs: [IDS.bear] },
  { id: IDS.priya, dogs: [IDS.vex] },
];
const DOG_INFO: Record<string, { patrol: string[]; odors: string[]; handler: string }> = {
  [IDS.rook]: { patrol: ['Obedience', 'Tracking', 'Building Search', 'Area Search for Humans', 'Criminal Apprehension / Aggression Control'], odors: ['Drugs'], handler: IDS.mia },
  [IDS.juno]: { patrol: [], odors: ['Explosives', 'Firearms'], handler: IDS.mia },
  [IDS.bear]: { patrol: ['Obedience', 'Tracking', 'Building Search', 'Area Search for Evidence', 'Criminal Apprehension / Aggression Control'], odors: ['Drugs'], handler: IDS.theo },
  [IDS.vex]: { patrol: ['Obedience', 'Agility / Obstacle Course', 'Tracking', 'Building Search', 'Criminal Apprehension / Aggression Control'], odors: [], handler: IDS.priya },
};

function detectionEnvironments(rnd: () => number, i: number): ExerciseEnvironment[] {
  const envType = pick(rnd, ['Vehicle', 'Room', 'Locker', 'Open Area', 'Luggage'] as const);
  const count = 2 + Math.floor(rnd() * 5);
  const drug = pick(rnd, ['Cocaine', 'Methamphetamine', 'Heroin', 'Marijuana', 'Fentanyl'] as const);
  const explosive = chance(rnd, 0.35);
  // A real description: the Odor List report has a Description column and the Training Report an
  // odor Description field, and an environment that never carries one leaves both printing an em dash.
  const description = `${count} ${envType.toLowerCase()}s laid out in a line-up; hides aged ${15 + Math.floor(rnd() * 45)} minutes, `
    + `${pick(rnd, ['light crosswind from the west', 'still air indoors', 'warm surfaces after midday sun', 'wet ground after overnight rain'])}.`;
  return [{
    id: `env-${i}-1`,
    env_type: envType,
    count,
    description,
    units: [{
      id: `unit-${i}-1`,
      name: envType === 'Vehicle' ? pick(rnd, ['Ford Explorer', 'Toyota Camry', 'Chevrolet Tahoe', 'Honda Civic']) : `${envType} #${1 + Math.floor(rnd() * count)}`,
      odors: [{
        id: `odor-${i}-1`,
        category: explosive ? 'Explosives' : 'Drugs',
        type: explosive ? pick(rnd, ['Smokeless Powder', 'TNT', 'PETN']) : drug,
        amount: explosive ? 50 : pick(rnd, [0.5, 1, 5, 10, 28]),
        unit: 'Grams',
        packaging: pick(rnd, ['Plastic Bag', 'Scent Tape', 'Vacuum-sealed bag', 'Cardboard']),
        concealed: pick(rnd, ['Under rear seat', 'Wheel well, driver side', 'Top shelf', 'Behind vent cover', 'Inside spare tire']),
      }],
    }],
  }];
}

async function seedTraining(ctx: Ctx, n: number): Promise<SeededCompletion[]> {
  const { repo, rnd, now } = ctx;
  let outdatedLeft = 2;
  const made: SeededCompletion[] = [];
  for (let i = 0; i < n; i++) {
    // Spread over the last 90 days (plus one upcoming event); big counts wrap densely.
    const dayOffset = i === 0 ? -3 : Math.floor(rnd() * 90);
    const starts = daysAgo(now, dayOffset, 8 + Math.floor(rnd() * 9), pick(rnd, [0, 30]));
    const isGroup = chance(rnd, 0.6);
    const isDetection = chance(rnd, 0.5);
    const creator = isGroup ? IDS.priya : pick(rnd, HANDLERS).id;
    const loc = pick(rnd, LOCATIONS);
    const invitees = isGroup ? HANDLERS.map((h) => h.id) : [creator];
    const evId = `ev-${i}`;
    const createdAt = iso(new Date(starts.getTime() - 2 * DAY));
    const event: Partial<TrainingEvent> = {
      id: evId, owner_user_id: creator,
      name: isGroup ? pick(rnd, ['Friday Morning Training', 'Unit Detection Day', 'Night Ops Training', 'Scenario Wednesday', 'Vehicle Sniff Block']) : `${isDetection ? 'Detection' : 'Patrol'} maintenance`,
      starts_at: iso(starts), tz: DEMO_TZ, duration_min: pick(rnd, [60, 90, 120, 180, 240]),
      location: { ...loc, postal_code: '43000' },
      group_id: isGroup ? IDS.trainingGroup : null,
      optional_attendance: isGroup && chance(rnd, 0.3),
      tags: chance(rnd, 0.25) ? [pick(rnd, ['Demonstration', 'Scent Wall', 'Certification', 'Night Training'])] : [],
      comments_to_group: isGroup ? 'Bring hides, long lines and water. Meet at the yard gate.' : '',
      files: [],
      invitees: invitees.map((u) => ({ user_id: u, is_leader: u === creator, is_mandatory: true, response: dayOffset < 0 ? pick(rnd, ['undecided', 'attend', 'decline'] as const) : 'attend', attended: dayOffset >= 0 })),
      forecast: pick(rnd, WEATHER_SAMPLES),
    };
    await repo.upsert('training_event', event, { at: createdAt, actor_id: creator });

    const exCount = isGroup && chance(rnd, 0.35) ? 2 : 1;
    for (let x = 0; x < exCount; x++) {
      const exId = `ex-${i}-${x}`;
      const kind = x === 0 ? (isDetection ? 'detection' : 'patrol') : (isDetection ? 'patrol' : 'detection');
      const patrol = kind === 'patrol'
        ? (chance(rnd, 0.3) ? [pick(rnd, ['Tracking', 'Building Search']), 'Criminal Apprehension / Aggression Control'] : [pick(rnd, ['Obedience', 'Tracking', 'Building Search', 'Area Search for Humans', 'Criminal Apprehension / Aggression Control', 'Area Search for Evidence'])])
        : [];
      const controlledNeg = kind === 'detection' && chance(rnd, 0.15);
      const version = outdatedLeft > 0 && isGroup && dayOffset > 5 && chance(rnd, 0.5) ? 2 : 1;
      const exercise: Partial<Exercise> = {
        id: exId, owner_user_id: creator, event_id: evId,
        name: kind === 'detection' ? `Detection Exercise #${x + 1}` : (patrol.length > 1 ? 'Patrol Scenario Exercise' : `${patrol[0]} Exercise`),
        kind, monitor: pick(rnd, ['Priya Nair', 'Sgt. Cole', 'M. Okun', '']),
        goal: kind === 'detection' ? 'Systematic search pattern, read change of behavior, reward at source.' : 'Clean first-command response; handler works the dog with minimal leash pressure.',
        patrol_types: patrol,
        environments: kind === 'detection' && !controlledNeg ? detectionEnvironments(rnd, i * 10 + x) : [],
        blank_controlled_negative: controlledNeg,
        version, files: [], created_by: creator,
      };
      await repo.upsert('exercise', exercise, { at: createdAt, actor_id: creator });
      if (version === 2) {
        // simulate a leader edit after completions existed — keep the v1 Details snapshot so the outdated diff (U5) has a "previous"
        const v1: ExerciseDetails = { name: exercise.name!, kind, monitor: exercise.monitor!, goal: exercise.goal!, patrol_types: patrol, environments: exercise.environments!, blank_controlled_negative: controlledNeg };
        await repo.upsert('exercise', { id: exId, goal: exercise.goal!.replace(/\.$/, '') + ' — amended: hides aged 30 minutes before the search.', versions: [{ version: 1, saved_at: createdAt, tz: DEMO_TZ, saved_by: creator, details: v1 }] }, { at: iso(notFuture(new Date(starts.getTime() + 3 * DAY))), actor_id: IDS.priya });
      }

      // completions — one per applicable dog of each invited handler
      for (const uid of invitees) {
        const h = HANDLERS.find((hh) => hh.id === uid)!;
        for (const dogId of h.dogs) {
          const info = DOG_INFO[dogId];
          const applies = kind === 'detection' ? true : patrol.every((p) => info.patrol.includes(p)) && info.patrol.length > 0;
          if (!applies) continue;
          if (kind === 'detection' && info.odors.length === 0 && chance(rnd, 0.6)) continue; // proofing-only dogs skip most
          if (dayOffset < 0 || starts.getTime() > Date.now()) continue; // upcoming: no completion yet
          const incomplete = chance(rnd, 0.15);
          const review: ReviewState = incomplete ? 'not_reviewed' : pick(rnd, ['reviewed', 'reviewed', 'reviewed', 'not_reviewed', 'not_reviewed', 'rejected'] as const);
          const performed = chance(rnd, 0.9) ? 'performed' : pick(rnd, ['excused', 'unable'] as const);
          const savedAt = notFuture(new Date(starts.getTime() + (1 + Math.floor(rnd() * 3)) * 3600000));
          const outdated = version === 2 && outdatedLeft > 0 && uid !== IDS.priya;
          if (outdated) outdatedLeft--;
          const c: Partial<Completion> = {
            id: `cp-${i}-${x}-${dogId}`, owner_user_id: uid, exercise_id: exId, event_id: evId, dog_id: dogId, handler_id: uid,
            // A draft the handler never finished leaves the blind question unanswered (tri-state, DECISIONS E14).
            performed, is_blind: kind === 'detection' ? (incomplete ? null : chance(rnd, 0.35)) : null,
            monitor: exercise.monitor || '',
            odor_set_at: kind === 'detection' ? iso(new Date(starts.getTime() - 40 * 60000)) : null,
            start_at: iso(starts), end_at: iso(new Date(starts.getTime() + 25 * 60000)), tz: DEMO_TZ,
            weather: pick(rnd, WEATHER_SAMPLES),
            comments: incomplete ? '' : pick(rnd, NARRATIVES),
            summary: '',
            sections: kind === 'patrol' ? Object.fromEntries(patrol.map((p) => [p, sectionFor(rnd, p)])) : {},
            files: [], is_complete: !incomplete,
            is_outdated: outdated, exercise_version_seen: outdated ? 1 : version,
            saved_at: incomplete ? null : iso(savedAt),
            review: incomplete ? 'not_reviewed' : review,
            reviewed_by: review === 'not_reviewed' || incomplete ? null : IDS.cole,
            reviewed_at: review === 'not_reviewed' || incomplete ? null : iso(notFuture(new Date(savedAt.getTime() + DAY))),
            rejection_reason: review === 'rejected' ? pick(rnd, ['Narrative does not state where the odor was concealed.', 'Weather block is empty — reload weather and re-save.', 'Please add the decoy name to the apprehension section.']) : null,
          };
          // Save first as not_reviewed (the handler's write), then the supervisor's review is its own History row with a real diff.
          await repo.upsert('completion', { ...c, review: 'not_reviewed', reviewed_by: null, reviewed_at: null, rejection_reason: null }, { at: iso(savedAt), actor_id: uid });
          if (c.review && c.review !== 'not_reviewed') {
            await repo.upsert('completion', { id: c.id, review: c.review, reviewed_by: IDS.cole, reviewed_at: c.reviewed_at, rejection_reason: c.rejection_reason }, { at: c.reviewed_at!, actor_id: IDS.cole, label: `Review: ${c.review}` });
          }
          if (!incomplete) made.push({ id: c.id!, ownerId: uid, dogId, startsAt: starts, isTracking: patrol.includes('Tracking') });
        }
      }
    }
  }
  return made;
}

/**
 * One OPEN Tracking exercise waiting for a GPS track (U8).
 *
 * The whole point of tracking is that walking a track fills the record's TRACKING fields instead of
 * the handler typing them. Nothing demonstrated that on a training record: every seeded Tracking
 * completion is already complete, so "Complete Exercise" only ever offered exercises with no TRACKING
 * section to fill. This leaves Mia one unfinished Tracking exercise with its section empty, so
 * attaching a track visibly writes the distance, duration, turns and time into it.
 *
 * Fixed ids outside the `ev-<i>` / `cp-<i>-<x>-<dog>` series and no use of `rnd`, so every other
 * seeded id, value and count is untouched.
 */
async function seedTrackingExercise({ repo, now }: Ctx) {
  const starts = daysAgo(now, 1, 9, 0);
  const createdAt = iso(new Date(starts.getTime() - DAY));
  const evId = 'ev-track-open';
  const exId = 'ex-track-open-0';
  const yard = LOCATIONS[0]; // the yard the Simulate walk origin sits on, so a laid track is in range

  const event: Partial<TrainingEvent> = {
    id: evId, owner_user_id: IDS.mia,
    name: 'Tracking maintenance',
    starts_at: iso(starts), tz: DEMO_TZ, duration_min: 90,
    location: { ...yard, postal_code: '43000' },
    group_id: null,
    optional_attendance: false,
    tags: [],
    comments_to_group: '',
    files: [],
    invitees: [{ user_id: IDS.mia, is_leader: true, is_mandatory: true, response: 'attend', attended: true }],
    forecast: WEATHER_SAMPLES[0],
  };
  await repo.upsert('training_event', event, { at: createdAt, actor_id: IDS.mia });

  const exercise: Partial<Exercise> = {
    id: exId, owner_user_id: IDS.mia, event_id: evId,
    name: 'Tracking Exercise',
    kind: 'patrol',
    monitor: 'Priya Nair',
    goal: 'Aged track across mixed terrain — walk it with the GPS running and let the track fill the record.',
    patrol_types: ['Tracking'],
    environments: [],
    blank_controlled_negative: false,
    version: 1, files: [], created_by: IDS.mia,
  };
  await repo.upsert('exercise', exercise, { at: createdAt, actor_id: IDS.mia });

  const completion: Partial<Completion> = {
    id: 'cp-track-open-rook', owner_user_id: IDS.mia, exercise_id: exId, event_id: evId,
    dog_id: IDS.rook, handler_id: IDS.mia,
    performed: 'performed', is_blind: null,
    monitor: 'Priya Nair',
    odor_set_at: null,
    start_at: iso(starts), end_at: null, tz: DEMO_TZ,
    weather: null,
    comments: '', summary: '',
    // Deliberately empty: these are the fields a walked track is supposed to fill in.
    sections: { Tracking: {} },
    files: [], is_complete: false,
    is_outdated: false, exercise_version_seen: 1,
    saved_at: null,
    review: 'not_reviewed', reviewed_by: null, reviewed_at: null, rejection_reason: null,
  };
  await repo.upsert('completion', completion, { at: iso(starts), actor_id: IDS.mia });
}

function sectionFor(rnd: () => number, p: string): Record<string, unknown> {
  switch (p) {
    case 'Obedience':
      return { obedience_types: ['Sit: On leash', 'Down: On leash', 'Heel: On leash', 'Stay: Off leash'] };
    case 'Tracking':
      return { track_location_known: 'No', controlled_negative: 'No', track_name: 'Follow decoy', track_distance_m: 300 + Math.floor(rnd() * 900), track_turns: 2 + Math.floor(rnd() * 4), track_duration_min: 8 + Math.floor(rnd() * 15), human_crossings: Math.floor(rnd() * 3), terrain_types: ['Grass/vegetation', 'Asphalt'], contaminant_types: chance(rnd, 0.4) ? ['Trash/waste'] : [] };
    case 'Criminal Apprehension / Aggression Control':
      return { recall: 'Yes', dog_in_guard_position: 'Yes', decoy_name: pick(rnd, ['R. McLaughlin', 'J. Ortiz']), equipment_used: ['Bite Suit'], bite_release: 'verbal' };
    case 'Area Search for Evidence':
      return { monitor: 'Priya Nair', controlled_negative: 'No', items: ['Pistol', 'Wallet'], terrain_types: ['Grass/vegetation'], area_size_sq_yd: 200 };
    case 'Building Search':
      return { building_types: ['Warehouse'], rooms_searched: 4 + Math.floor(rnd() * 6), decoy_found: 'Yes' };
    default:
      return {};
  }
}

// ---------- deployments ----------
async function seedDeployments(ctx: Ctx, n: number): Promise<SeededDeployment[]> {
  const { repo, rnd, now } = ctx;
  const made: SeededDeployment[] = [];
  for (let i = 0; i < n; i++) {
    const dayOffset = 1 + Math.floor(rnd() * 88);
    const occurred = daysAgo(now, dayOffset, Math.floor(rnd() * 24), pick(rnd, [5, 12, 37, 42, 58]));
    const handler = i % 3 === 2 ? IDS.theo : IDS.mia;
    const dogId = handler === IDS.theo ? IDS.bear : (chance(rnd, 0.3) ? IDS.juno : IDS.rook);
    const info = DOG_INFO[dogId];
    const fulfillment = i === 3 ? 'not_deployed' : i === 7 ? 'cancelled_enroute' : 'deployed';
    const kind = dogId === IDS.juno || chance(rnd, 0.4) ? 'detection' : 'patrol';
    const patrol = kind === 'patrol' ? [pick(rnd, ['Tracking', 'Building Search', 'Area Search for Humans', 'Non-Search'])] : [];
    const withArrests = (i === 1 || i === 4) && fulfillment === 'deployed';
    const arrests: Arrest[] = withArrests
      ? [
        // `charges` stays empty: DECISIONS E21 keeps the field on the type for future use but the
        // arrest group never captures it, so seeded demo data must not pretend otherwise.
        { id: `ar-${i}-1`, n: 1, charges: '', demographics: { age: 27, sex: 'Male', race: 'White' }, subject_bitten: false },
        ...(i === 4 ? [{ id: `ar-${i}-2`, n: 2, charges: '', demographics: { age: 34, sex: 'Female', race: 'Hispanic or Latino' }, subject_bitten: null }] : []),
      ]
      : [];
    const review: ReviewState = pick(rnd, ['reviewed', 'reviewed', 'not_reviewed', 'not_reviewed', 'rejected'] as const);
    const savedAt = notFuture(new Date(occurred.getTime() + 2 * 3600000));
    const d: Partial<Deployment> = {
      id: `dp-${i}`, owner_user_id: handler, handler_id: handler, dog_id: dogId,
      occurred_at: iso(occurred), tz: DEMO_TZ,
      location: { ...pick(rnd, LOCATIONS), postal_code: '43000' },
      case_number: chance(rnd, 0.8) ? `26-${String(1400 + i * 37).padStart(4, '0')}` : '',
      tags: chance(rnd, 0.5) ? [pick(rnd, ['Overtime', 'Call Out', 'Burglary', 'Felony', 'Nighttime', 'School Sweep'])] : [],
      requesting_unit: pick(rnd, ['Ashcombe Patrol Division', 'School District #42', 'Wells County SO']),
      reason: pick(rnd, ['Vehicle stop — driver refused consent; K9 sniff requested.', 'Burglary in progress; suspect fled on foot into wooded area.', 'Bomb threat at high school; sweep of lockers and gym.', 'Search warrant service — narcotics.', 'Locate missing juvenile last seen near the park.']),
      request_fulfillment: fulfillment, kind, patrol_types: patrol,
      sections: kind === 'patrol' && fulfillment === 'deployed' ? Object.fromEntries(patrol.map((p) => [p, deploymentSection(rnd, p)])) : {},
      people_found: withArrests ? arrests.length : (kind === 'patrol' && fulfillment === 'deployed' ? Math.floor(rnd() * 2) : null),
      people_unintentionally_bitten: 0,
      arrests,
      detection: kind === 'detection' && fulfillment === 'deployed' ? detectionFor(rnd, i, info.odors[0] || 'Drugs') : null,
      summary: fulfillment === 'deployed' ? pick(rnd, NARRATIVES) : 'Request cancelled before arrival; no deployment.',
      weather: pick(rnd, WEATHER_SAMPLES),
      files: [],
      submitted_at: iso(savedAt), is_complete: true,
      review, reviewed_by: review === 'not_reviewed' ? null : IDS.cole,
      reviewed_at: review === 'not_reviewed' ? null : iso(notFuture(new Date(savedAt.getTime() + DAY))),
      rejection_reason: review === 'rejected' ? 'Case number is missing — add it and re-submit.' : null,
    };
    await repo.upsert('deployment', { ...d, review: 'not_reviewed', reviewed_by: null, reviewed_at: null, rejection_reason: null }, { at: iso(savedAt), actor_id: handler });
    if (review !== 'not_reviewed') {
      await repo.upsert('deployment', { id: d.id, review, reviewed_by: IDS.cole, reviewed_at: d.reviewed_at, rejection_reason: d.rejection_reason }, { at: d.reviewed_at!, actor_id: IDS.cole, label: `Review: ${review}` });
    }
    made.push({ id: d.id!, ownerId: handler, dogId, occurredAt: occurred, kind });
  }
  return made;
}
// A detection deployment's search work. Real seizure detail (category, type, weight/count, packaging)
// is what the Deployment Summary's drug / paraphernalia indication charts and its "Packaging Around …"
// lists are computed from, so the seed has to carry it rather than a single anonymous item.
const DRUG_SEIZURES: Array<{ type: string; amount: number; unit: string; packaging: string; where: string }> = [
  { type: 'Methamphetamine', amount: 12, unit: 'Grams', packaging: 'Plastic Bag', where: 'Under the driver seat' },
  { type: 'Cocaine', amount: 28.4, unit: 'Grams', packaging: 'Vacuum-sealed bag', where: 'Spare-wheel well' },
  { type: 'Marijuana', amount: 112, unit: 'Grams', packaging: 'Scent Tape', where: 'Centre console' },
  { type: 'Fentanyl', amount: 3.2, unit: 'Grams', packaging: 'Plastic Bag', where: 'Glove box' },
  { type: 'Heroin', amount: 7.5, unit: 'Grams', packaging: 'Cardboard', where: 'Door card cavity' },
];
const PARAPHERNALIA_SEIZURES: Array<{ type: string; amount: number; unit: string; packaging: string; where: string }> = [
  { type: 'Scale', amount: 1, unit: 'Items', packaging: 'Plastic', where: 'Rear footwell' },
  { type: 'Baggies', amount: 40, unit: 'Items', packaging: 'Cardboard', where: 'Centre console' },
  { type: 'Pipe', amount: 2, unit: 'Items', packaging: 'Plastic Bag', where: 'Driver door pocket' },
];

function detectionFor(rnd: () => number, i: number, odorCategory: string): Record<string, unknown> {
  const explosives = odorCategory === 'Explosives';
  const envs = [
    { id: `de-${i}-1`, env_type: 'Vehicle', count: 1 },
    ...(chance(rnd, 0.45) ? [{ id: `de-${i}-2`, env_type: explosives ? 'Locker' : 'Luggage', count: 2 + Math.floor(rnd() * 4) }] : []),
  ];
  // Deterministic rather than random: the summary's indication / seizure / currency charts need a
  // predictable spread of real data across the demo set, not a coin toss that can leave them empty.
  const indicated = i % 5 !== 4;
  // Make and model travel together — picking them from two independent lists produced a
  // "Honda Camry" on a court-facing exhibit.
  const [vMake, vModel] = pick(rnd, [['Toyota', 'Camry'], ['Honda', 'Civic'], ['Ford', 'F-150']]);
  const vehicle = { type: 'Passenger car', color: pick(rnd, ['Silver', 'Black', 'Blue']), make: vMake, model: vModel, plate: `AB${1000 + i}` };
  const indications = indicated
    ? [{
      id: `di-${i}-1`, name: [vehicle.color, vehicle.make, vehicle.model].join(' '), environment_id: envs[0].id,
      is_vehicle: true, vehicle,
      description: 'K9 bracketed the rear passenger door seam and gave a trained final response (sit) at the door handle.',
    }]
    : [];

  const seizures: Record<string, unknown>[] = [];
  // An indication with nothing seized is a real outcome (it sets `independent_information`), but it
  // must stay the minority or the summary's seizure charts have no data to draw.
  if (indicated && i % 4 !== 3) {
    if (explosives) {
      seizures.push({ id: `sz-${i}-1`, indication_id: indications[0].id, odor_category: 'Explosives', odor_type: pick(rnd, ['Smokeless Powder', 'Black Powder']), amount: 200 + Math.floor(rnd() * 300), unit: 'Grams', packaging: 'Cardboard', concealed_location: 'Range bag in the boot' });
    } else {
      const drug = DRUG_SEIZURES[i % DRUG_SEIZURES.length];
      seizures.push({ id: `sz-${i}-1`, indication_id: indications[0].id, odor_category: 'Drugs', odor_type: drug.type, amount: drug.amount, unit: drug.unit, packaging: drug.packaging, concealed_location: drug.where });
      if (i % 3 !== 2) {
        const par = PARAPHERNALIA_SEIZURES[i % PARAPHERNALIA_SEIZURES.length];
        seizures.push({ id: `sz-${i}-2`, indication_id: indications[0].id, odor_category: 'Drug Paraphernalia', odor_type: par.type, amount: par.amount, unit: par.unit, packaging: par.packaging, concealed_location: par.where });
      }
    }
  }
  const currency = !explosives && indicated && i % 3 === 0 ? 500 + Math.floor(rnd() * 9000) : 0;
  return {
    environments: envs,
    indications,
    seizures,
    currency_not_indicated: currency > 0,
    currency_amount: currency > 0 ? currency : null,
    currency_type: 'USD',
    independent_information: indicated && seizures.length === 0,
    dog_assisted_arrests: null,
  };
}

function deploymentSection(rnd: () => number, p: string): Record<string, unknown> {
  switch (p) {
    case 'Tracking': return { terrain_types: ['Grass/vegetation', 'Concrete'], track_distance_m: 400 + Math.floor(rnd() * 800), track_turns: 3, tracking_duration_min: 14, human_crossings: 1, animals_on_track: 0 };
    case 'Building Search': return { building_types: ['Commercial'], time_delay_min: 12 };
    case 'Area Search for Humans': return { search_area_types: ['Residential', 'Open field'], search_duration_min: 25 };
    default: return {};
  }
}

// ---------- classes / vet ----------
async function seedClasses({ repo, rnd, now }: Ctx) {
  const owners = [IDS.mia, IDS.theo, IDS.priya];
  for (const [i, c] of CLASSES.entries()) {
    const occurred = daysAgo(now, 12 + i * 23, 9);
    const at = iso(notFuture(new Date(occurred.getTime() + 5 * 3600000)));
    const review: ReviewState = i === 0 ? 'reviewed' : 'not_reviewed';
    const row: Partial<ClassRecord> = {
      id: `cl-${i}`, owner_user_id: owners[i], title: c.title, instructor: c.instructor, location: c.location,
      occurred_at: iso(occurred), tz: DEMO_TZ, duration_min: pick(rnd, [120, 240, 480]), notes: c.notes, files: [], is_complete: true,
      review, reviewed_by: review === 'reviewed' ? IDS.cole : null, reviewed_at: review === 'reviewed' ? iso(notFuture(new Date(occurred.getTime() + DAY))) : null, rejection_reason: null,
    };
    await repo.upsert('class_record', row, { at, actor_id: owners[i] });
  }
}
async function seedVet({ repo, now }: Ctx) {
  const visits: Array<{ id: string; owner: string; dog: string; daysAgo: number; name: string; care: string[]; vax: Array<{ type: string; core: boolean; dueInDays: number }>; cost: number }> = [
    { id: 'vv-1', owner: IDS.mia, dog: IDS.rook, daysAgo: 70, name: 'Vet Visit - Annual', care: ['General Checkup', 'Vaccinations'], vax: [{ type: 'Rabies', core: true, dueInDays: 1095 - 70 }, { type: 'Bordetella', core: false, dueInDays: 365 - 70 }], cost: 210 },
    { id: 'vv-2', owner: IDS.mia, dog: IDS.juno, daysAgo: 355, name: 'Vet Visit - Boosters', care: ['Vaccinations'], vax: [{ type: 'Leptospira', core: false, dueInDays: 10 }, { type: 'Lyme Disease', core: false, dueInDays: 10 }], cost: 95 },
    { id: 'vv-3', owner: IDS.theo, dog: IDS.bear, daysAgo: 30, name: 'Vet Visit - Paw injury', care: ['Treatment', 'Imaging (X-ray, CT, MRI, etc.)'], vax: [], cost: 340 },
    { id: 'vv-4', owner: IDS.priya, dog: IDS.vex, daysAgo: 45, name: 'Vet Visit - Annual', care: ['General Checkup', 'Vaccinations'], vax: [{ type: 'Distemper', core: true, dueInDays: 1095 - 45 }, { type: 'Parvovirus', core: true, dueInDays: 1095 - 45 }], cost: 180 },
    // U7: one OVERDUE booster so the red state, the supervisor `Overdue Vaccinations` table and the
    // handler's `n overdue` TO DO line all have real data behind them.
    { id: 'vv-5', owner: IDS.theo, dog: IDS.bear, daysAgo: 390, name: 'Vet Visit - Boosters', care: ['Vaccinations'], vax: [{ type: 'Bordetella', core: false, dueInDays: -25 }], cost: 85 },
  ];
  for (const v of visits) {
    const date = daysAgo(now, v.daysAgo, 12);
    const at = iso(new Date(date.getTime() + 3 * 3600000));
    const row: Partial<VetVisit> = { id: v.id, owner_user_id: v.owner, name: v.name, dog_id: v.dog, location: 'Sandy Creek Veterinary Clinic', date: iso(date), tz: DEMO_TZ, care_types: v.care, notes: v.care.includes('Treatment') ? 'Laceration to right front pad, cleaned and glued. Rest 7 days.' : 'Routine.', cost: v.cost, files: [] };
    await repo.upsert('vet_visit', row, { at, actor_id: v.owner });
    for (const [j, x] of v.vax.entries()) {
      const vx: Partial<Vaccination> = { id: `${v.id}-vx-${j}`, owner_user_id: v.owner, dog_id: v.dog, vet_visit_id: v.id, type: x.type, core: x.core, given_at: iso(date), next_due_at: iso(new Date(now.getTime() + x.dueInDays * DAY)), tz: DEMO_TZ };
      await repo.upsert('vaccination', vx, { at, actor_id: v.owner });
    }
  }
}

// ---------- tracks + trainer comments ----------
// Without these two the report layer has whole blocks (the track plot with its pinned photos, the
// "Trainer <name> provided the following comments" paragraph) that no record in the demo can reach.
async function seedTracksAndComments({ repo, now }: Ctx, completions: SeededCompletion[], deployments: SeededDeployment[]) {
  // Pick a tracking exercise if the run produced one, else the most recent completion.
  // Prefer Mia's records: she is the default demo login, so the track and the trainer comment have to
  // be reachable from the account a reviewer signs in as.
  const target = completions.find((c) => c.isTracking && c.ownerId === IDS.mia) || completions.find((c) => c.isTracking) || completions[0];
  const patrolDeployment = deployments.find((d) => d.kind === 'patrol' && d.ownerId === IDS.mia)
    || deployments.find((d) => d.kind === 'patrol') || deployments[0];

  // A plausible short track across the training yard: a start leg, two turns, a find.
  const legs: [number, number][] = [
    [40.0812, -82.9013], [40.0814, -82.9010], [40.0817, -82.9007], [40.0820, -82.9006],
    [40.0823, -82.9008], [40.0825, -82.9012], [40.0826, -82.9017], [40.0824, -82.9021],
    [40.0821, -82.9023], [40.0818, -82.9022], [40.0816, -82.9019], [40.0815, -82.9015],
  ];

  if (target) {
    const start = target.startsAt;
    const points = legs.map(([lat, lng], i) => ({ lat, lng, at: iso(new Date(start.getTime() + i * 45000)), accuracy_m: 5 }));
    await repo.upsert('track', {
      id: 'trk-training-1', owner_user_id: target.ownerId, mode: 'training_follow', name: 'Yard track — aged 45 min',
      dog_id: target.dogId, laid_track_id: null, visibility: 'visible', points,
      pins: [
        { id: 'pin-1', lat: 40.0820, lng: -82.9006, at: iso(new Date(start.getTime() + 3 * 45000)), label: 'Turn 1 — hard surface crossing', photo_id: 'ph-track-1' },
        { id: 'pin-2', lat: 40.0817, lng: -82.9020, at: iso(new Date(start.getTime() + 10 * 45000)), label: 'Decoy located', photo_id: 'ph-track-2' },
      ],
      stats: { distance_m: 742, duration_s: 11 * 45, turns: 3, points_uploaded: points.length, points_total: points.length },
      status: 'completed', started_at: iso(start), stopped_at: iso(new Date(start.getTime() + 11 * 45000)), tz: DEMO_TZ,
      expires_at: null, owner_kind: 'user',
    }, { at: iso(notFuture(new Date(start.getTime() + 3600000))), actor_id: target.ownerId });
    await repo.upsert('completion', { id: target.id, track_id: 'trk-training-1' }, { silent: true, at: iso(notFuture(new Date(start.getTime() + 3600000))), actor_id: target.ownerId });

    await repo.upsert('trainer_comment', {
      id: 'tc-1', owner_user_id: IDS.priya, record_type: 'completion', record_id: target.id, trainer_id: IDS.priya,
      text: 'Good commitment at the start flag. The head-up at the parking-lot crossing is a scent-pool problem, not a motivation one — '
        + 'lay the next two tracks with a shorter hard-surface leg and reward at the far kerb so the dog learns to drive through it.',
    }, { at: iso(notFuture(new Date(start.getTime() + 2 * 3600000))), actor_id: IDS.priya });
  }

  if (patrolDeployment) {
    const start = patrolDeployment.occurredAt;
    const points = legs.map(([lat, lng], i) => ({ lat: lat + 0.004, lng: lng - 0.006, at: iso(new Date(start.getTime() + i * 60000)), accuracy_m: 8 }));
    await repo.upsert('track', {
      id: 'trk-deployment-1', owner_user_id: patrolDeployment.ownerId, mode: 'deployment', name: 'Suspect track — Grange Ave',
      dog_id: patrolDeployment.dogId, laid_track_id: null, visibility: 'visible', points,
      pins: [{ id: 'pin-3', lat: 40.0856 + 0.0, lng: -82.9081, at: iso(new Date(start.getTime() + 6 * 60000)), label: 'Discarded jacket', photo_id: 'ph-track-3' }],
      stats: { distance_m: 1180, duration_s: 11 * 60, turns: 4, points_uploaded: points.length, points_total: points.length },
      status: 'completed', started_at: iso(start), stopped_at: iso(new Date(start.getTime() + 11 * 60000)), tz: DEMO_TZ,
      expires_at: null, owner_kind: 'user',
    }, { at: iso(notFuture(new Date(start.getTime() + 3600000))), actor_id: patrolDeployment.ownerId });
    await repo.upsert('deployment', { id: patrolDeployment.id, track_id: 'trk-deployment-1' }, { silent: true, at: iso(notFuture(new Date(start.getTime() + 3600000))), actor_id: patrolDeployment.ownerId });

    await repo.upsert('trainer_comment', {
      id: 'tc-2', owner_user_id: IDS.priya, record_type: 'deployment', record_id: patrolDeployment.id, trainer_id: IDS.priya,
      text: 'Narrative covers the announcements and the release well. Add the time delay between the last announcement and the deployment — '
        + 'that is the number that gets asked in court.',
    }, { at: iso(notFuture(new Date(start.getTime() + 4 * 3600000))), actor_id: IDS.priya });
  }

  const classComment = 'Good notes. Attach the handout so the rest of the unit can read it before the next block.';
  await repo.upsert('trainer_comment', {
    id: 'tc-3', owner_user_id: IDS.priya, record_type: 'class', record_id: 'cl-0', trainer_id: IDS.priya, text: classComment,
  }, { at: iso(daysAgo(now, 11, 9)), actor_id: IDS.priya });
}

// ---------- notifications ----------
async function seedNotifications({ repo, now }: Ctx) {
  const list: Array<Partial<Notification>> = [
    { id: 'nt-mia-1', owner_user_id: IDS.mia, user_id: IDS.mia, type: 'manager_feedback', title: 'Record rejected', body: 'Sgt. Daniel Cole rejected a training record with comments.', read: false, link: '/records', created_at: iso(daysAgo(now, 2, 16)) },
    { id: 'nt-mia-2', owner_user_id: IDS.mia, user_id: IDS.mia, type: 'vaccination_due', title: 'Vaccination due soon', body: 'Juno: Leptospira and Lyme Disease boosters are due in 10 days.', read: false, link: '/dogs', created_at: iso(daysAgo(now, 4, 9)) },
    { id: 'nt-mia-3', owner_user_id: IDS.mia, user_id: IDS.mia, type: 'upcoming_event', title: 'Upcoming event', body: 'Friday Morning Training in 3 days at Ashcombe PD Training Yard.', read: true, link: '/records', created_at: iso(daysAgo(now, 1, 8)) },
    { id: 'nt-mia-4', owner_user_id: IDS.mia, user_id: IDS.mia, type: 'record_update', title: 'Exercise details changed', body: 'Priya Nair edited a shared exercise you completed. Review and re-save.', read: false, link: '/records', created_at: iso(daysAgo(now, 6, 11)) },
    { id: 'nt-theo-1', owner_user_id: IDS.theo, user_id: IDS.theo, type: 'billing', title: 'Trial ended', body: 'Your 30-day trial ended. Records are read-only until a subscription is active.', read: false, link: '/billing', created_at: iso(daysAgo(now, 5, 9)) },
    // Cole opted in to this type (see seedUsers) — email_sent matches the ticked Email box.
    { id: 'nt-cole-1', owner_user_id: IDS.cole, user_id: IDS.cole, type: 'exercise_ready_for_supervisor_review', title: 'Records ready for review', body: 'You have training records from the last 3 months that are not reviewed.', read: false, link: '/review', email_sent: true, email_to: 'sgt.cole@demo.k9', created_at: iso(daysAgo(now, 1, 7)) },
    { id: 'nt-priya-1', owner_user_id: IDS.priya, user_id: IDS.priya, type: 'exercise_ready_for_comments', title: 'Exercise ready for comments', body: 'Mia Torres completed Detection Exercise #1.', read: false, link: '/records', created_at: iso(daysAgo(now, 3, 15)) },
  ];
  for (const n of list) await repo.upsert('notification', n, { at: n.created_at, actor_id: 'system' });
}

// ---------- U5: guaranteed ≥ 16 training hours this month for Mia (Manage green bar) ----------
async function seedHighHours({ repo, now }: Ctx) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 7, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    let starts = new Date(monthStart.getTime() + i * DAY + i * 3600000);
    if (starts.getTime() > Date.now()) starts = new Date(Date.now() - (i + 1) * 3 * 3600000);
    const evId = `ev-hh-${i}`;
    const exId = `ex-hh-${i}`;
    const at = iso(new Date(starts.getTime() - DAY));
    await repo.upsert('training_event', {
      id: evId, owner_user_id: IDS.mia, name: 'Patrol maintenance — extended block', starts_at: iso(starts), tz: DEMO_TZ, duration_min: 240,
      location: { ...LOCATIONS[0], postal_code: '43000' }, group_id: null, optional_attendance: false, tags: [], comments_to_group: '', files: [],
      invitees: [{ user_id: IDS.mia, is_leader: true, is_mandatory: true, response: 'attend', attended: true }], forecast: WEATHER_SAMPLES[0],
    }, { at, actor_id: IDS.mia });
    await repo.upsert('exercise', {
      id: exId, owner_user_id: IDS.mia, event_id: evId, name: 'Obedience Exercise', kind: 'patrol', monitor: '', goal: 'Extended obedience block: heel, recall, down-stay under distraction.',
      patrol_types: ['Obedience'], environments: [], blank_controlled_negative: false, version: 1, files: [], created_by: IDS.mia,
    }, { at, actor_id: IDS.mia });
    const savedAt = notFuture(new Date(starts.getTime() + 4 * 3600000));
    await repo.upsert('completion', {
      id: `cp-hh-${i}`, owner_user_id: IDS.mia, exercise_id: exId, event_id: evId, dog_id: IDS.rook, handler_id: IDS.mia,
      performed: 'performed', is_blind: null, monitor: '', odor_set_at: null, start_at: iso(starts), end_at: iso(new Date(starts.getTime() + 4 * 3600000)), tz: DEMO_TZ,
      weather: WEATHER_SAMPLES[1], comments: NARRATIVES[1], summary: '', sections: { Obedience: { obedience_types: ['Heel: On leash', 'Recall: Off leash', 'Down: Off leash'] } },
      files: [], is_complete: true, is_outdated: false, exercise_version_seen: 1, saved_at: iso(savedAt),
      review: 'not_reviewed', reviewed_by: null, reviewed_at: null, rejection_reason: null,
    }, { at: iso(savedAt), actor_id: IDS.mia });
  }
}

/**
 * Top-up re-seed for RELOAD DATA (U9).
 *
 * `seedDemo` starts with `repo.clear()`, so it can only ever run on a fresh store — which is why a
 * browser profile seeded before a seed change (tracks and trainer comments, say) kept showing the old
 * data forever while RELOAD DATA claimed otherwise. This runs the same seed against a proxy that
 * **only creates rows that are absent**: every demo id is fixed, so a row that already exists is left
 * exactly as the user left it, and anything the user created themselves is untouched.
 *
 * Returns how many rows it had to create, so the caller can say what actually happened.
 */
export async function topUpDemo(repo: Repository): Promise<{ created: number }> {
  let created = 0;
  const proxy = new Proxy(repo, {
    get(target, prop, receiver) {
      if (prop === 'clear') return async () => {};
      if (prop === 'upsert') {
        return async (entity: EntityName, row: { id?: string }, opts?: WriteOptions) => {
          if (row.id && target.getSync(entity, row.id)) return target.getSync(entity, row.id);
          created += 1;
          return target.upsert(entity, row as never, opts);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Repository;
  await seedDemo(proxy, 40);
  await repo.flush();
  return { created };
}
