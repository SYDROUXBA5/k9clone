// Data model — every entity from the build brief §6.
// Conventions: every row has id (uuid), owner_user_id, created_at, updated_at (ISO instants).
// Dated fields store the instant (ISO 8601 UTC) plus the IANA time zone in a sibling `tz` field.
// Units: imperial display, metric storage — temperatures in °C (temp_c), speeds in km/h, distances in metres.

export type ISODate = string; // ISO 8601 instant, e.g. 2026-08-18T14:03:00.000Z
export type IANAZone = string; // e.g. America/New_York
export type UUID = string;

export interface BaseRow {
  id: UUID;
  owner_user_id: UUID;
  created_at: ISODate;
  updated_at: ISODate;
  deleted_at?: ISODate | null; // soft delete
}

// ---------- Accounts, roles, billing ----------
export type AgencyKind = 'agency' | 'personal';
export interface Agency extends BaseRow {
  kind: AgencyKind;
  name: string;
}

export type Role = 'handler' | 'trainer' | 'supervisor' | 'billing_manager';
export const ROLE_LABEL: Record<Role, string> = {
  handler: 'Handler',
  trainer: 'Trainer',
  supervisor: 'Supervisor',
  billing_manager: 'Billing Manager',
};

export interface User extends BaseRow {
  email: string;
  first_name: string;
  last_name: string;
  name: string; // display name
  agency_id: UUID | null;
  department: string; // free text (not a tenant)
  roles: Role[];
  password?: string; // LOCAL MODE ONLY — demo password; the Supabase adapter never stores this
  photo_uri?: string | null;
  department_logo_uri?: string | null;
  notification_prefs?: Partial<Record<NotificationType, { in_app: boolean; email: boolean; mobile?: boolean }>>;
  demographics_in_reports?: boolean;
  dark_mode?: boolean;
  passcode?: string | null; // mobile quick-access passcode (4 digits)
  last_app_login_at?: ISODate | null;
  last_web_login_at?: ISODate | null;
  // --- U7 additions -------------------------------------------------------------------------
  phone?: string;
  /** Badge / shield number and duty assignment, printed under the masthead on reports (PT-PRO-05). */
  badge_number?: string;
  duty_assignment?: string;
  /** A requested new sign-in address, unconfirmed. Confirming it TRANSFERS the account (PT-PRO-02). */
  pending_email?: string | null;
  pending_email_sent_at?: ISODate | null;
  /** Federated identity shown read-only on Profile (PT-PRO-09). */
  microsoft_account?: string | null;
  microsoft_entra_oid?: string | null;
  /** Group-subscription billing profile, held by the billing manager who owns it (PT-BIL-04). */
  group_department_name?: string;
  group_billing_email?: string;
  group_payment_type?: PaymentType;
  /** Day of month (1–28) the group invoice is raised; blank = the anniversary of the start date. */
  group_billing_day?: number | null;
}

export interface RoleAssignment extends BaseRow {
  user_id: UUID;
  role: Role;
  granted_at: ISODate;
}

export type SeatPlan = 'trial' | 'monthly' | 'annual';
/** How the department settles the invoice (PT-BIL-03). */
export type PaymentType = 'automatic' | 'invoice' | 'invoice_remittance';
export interface Seat extends BaseRow {
  user_id: UUID; // the handler covered
  plan: SeatPlan;
  starts: ISODate;
  ends: ISODate;
  paid_by: UUID | null; // user id of payer (self or billing manager)
  group_subscription_id?: UUID | null;
  /** 'overdue' = cancelled for non-payment with money still owed (PT-BIL-06 "Canceled & Overdue"). */
  status: 'active' | 'expired' | 'cancelled' | 'overdue';
  payment_type?: PaymentType;
  /** Unpaid amount in USD; surfaced as "Balance Due:" while status is 'overdue'. */
  balance_due_usd?: number;
}

// ---------- Dogs & documents ----------
export type DogSex = 'male' | 'female' | 'unknown';
export type DogStatus = 'active' | 'retired';
export interface Dog extends BaseRow {
  name: string; // max 50
  breed: string; // max 50, free text (custom remembered)
  purpose?: string; // "Type / Purpose", max 50, e.g. "Dual Purpose (Narcotics/Patrol)"
  sex: DogSex | '';
  dob: ISODate | null; // date only, stored as ISO date (YYYY-MM-DD)
  date_started?: string | null; // Record Keeping Start Date (YYYY-MM-DD) — no records before it
  date_retired?: string | null; // Record Keeping End Date (YYYY-MM-DD); blank = active, set = retired
  patrol_types: string[]; // vocab.PATROL_TYPES values (custom allowed)
  odor_types: string[]; // vocab.ODOR_CATEGORIES values — the dog's target odors
  status: DogStatus;
  is_default?: boolean;
  photo_uri?: string | null;
  notes?: string;
}

export interface DogAssignment extends BaseRow {
  dog_id: UUID;
  handler_id: UUID;
  from: ISODate;
  to: ISODate | null;
}

export type DocumentKind = 'file' | 'photo' | 'video';
export interface Document extends BaseRow {
  owner_type: 'user' | 'dog' | 'completion' | 'deployment' | 'class' | 'vet_visit' | 'training_event' | 'exercise' | 'track_pin';
  owner_id: UUID;
  category: string;
  kind: DocumentKind;
  name: string;
  uri: string;
  mime?: string;
  size_bytes?: number;
}

// ---------- Groups, connections, shares ----------
export type ManagementGroupType = 'supervisor' | 'trainer';
export interface ManagementGroup extends BaseRow {
  type: ManagementGroupType;
  manager_id: UUID; // supervisor or trainer
  members: UUID[]; // managed handler (or supervisor) user ids
  pending: UUID[]; // invited but not accepted
  name?: string;
}

export interface TrainingGroup extends BaseRow {
  name: string;
  code: string; // 7 letters/numbers
  leader_id: UUID;
  leaders: UUID[];
  members: UUID[];
  pending: UUID[];
}

export interface Connection extends BaseRow {
  user_id: UUID;
  connected_user_id: UUID;
  via: 'supervisor' | 'trainer' | 'training_group' | 'manual';
}

export type ShareRecordType = 'completion' | 'deployment' | 'class' | 'vet_visit';
export interface Share extends BaseRow {
  record_type: ShareRecordType;
  record_id: UUID;
  from_supervisor: UUID;
  to_supervisor: UUID;
  note?: string;
}

// ---------- Locations ----------
export interface GeoLocation {
  name: string;
  /** Composed one-line address (line1, line2, city, region, postal, country) — kept for row titles / older rows. */
  address?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  region?: string; // state / province
  postal_code?: string;
  country?: string;
  lat: number | null;
  lng: number | null;
}
export interface Location extends BaseRow, GeoLocation {
  use_count: number;
  last_used_at: ISODate;
}

// ---------- Training ----------
export type InviteResponse = 'undecided' | 'attend' | 'decline';
export interface EventInvitee {
  user_id: UUID;
  is_leader: boolean;
  is_mandatory: boolean;
  response: InviteResponse;
  attended?: boolean;
}

export interface TrainingEvent extends BaseRow {
  name: string;
  starts_at: ISODate;
  tz: IANAZone;
  duration_min: number | null;
  location: GeoLocation;
  venue_contact?: string;
  group_id: UUID | null;
  optional_attendance: boolean;
  tags: string[];
  comments_to_group: string;
  files: UUID[]; // Document ids
  invitees: EventInvitee[];
  forecast?: Weather | null;
  /** Handlers who "deleted" this shared event from their own Records; the event stays for everyone else (U2, PT-REC-17). */
  removed_for?: UUID[];
}

export type ExerciseKind = 'detection' | 'patrol';
export interface OdorPlacement {
  id: UUID;
  category: string; // odor category (Drugs, Explosives …)
  type: string; // odor type (Cocaine …)
  amount: number | null;
  unit: string; // Grams | Items | USD
  packaging: string;
  concealed: string; // concealed location, free text
  height_ft?: number | null;
  depth_ft?: number | null;
}
export interface EnvironmentUnit {
  id: UUID;
  name: string; // e.g. "Ford Mustang", "Locker #23"
  odors: OdorPlacement[];
}
export interface ExerciseEnvironment {
  id: UUID;
  env_type: string; // Vehicle | Room | Locker | Open Area …
  count: number;
  description?: string;
  units: EnvironmentUnit[]; // items / vehicles / rooms that carry odor
}
/** The shared "Details" of an exercise — the part whose edit after completions bumps `version` and
 *  marks completions outdated. Snapshots of previous versions live on Exercise.versions[] (U5). */
export interface ExerciseDetails {
  name: string;
  kind: ExerciseKind;
  monitor: string;
  goal: string;
  patrol_types: string[];
  environments: ExerciseEnvironment[];
  blank_controlled_negative: boolean;
}
export interface ExerciseVersionSnapshot {
  version: number; // the version number these details had
  saved_at: ISODate;
  tz: IANAZone;
  saved_by: UUID;
  details: ExerciseDetails;
}
export interface Exercise extends BaseRow {
  event_id: UUID;
  name: string;
  kind: ExerciseKind;
  monitor: string;
  goal: string;
  patrol_types: string[]; // ≥2 → scenario
  environments: ExerciseEnvironment[]; // detection builder
  blank_controlled_negative: boolean;
  version: number;
  files: UUID[];
  created_by: UUID;
  /** Handlers who "deleted" this shared exercise from their own Records; other handlers' completions are never touched (PT-REC-17). */
  removed_for?: UUID[];
  /** Previous Details snapshots, oldest first (U5 outdated diff). Absent on exercises never re-edited. */
  versions?: ExerciseVersionSnapshot[];
}

export type PerformedState = 'performed' | 'excused' | 'unable';
export type ReviewState = 'not_reviewed' | 'reviewed' | 'rejected';
export interface Weather {
  temp_c: number | null; // stored metric; displayed °F
  humidity: number | null;
  wind_kph: number | null; // displayed mph
  wind_dir: string | null; // compass, e.g. "E"
  conditions: string | null; // General Conditions
  source: 'open-meteo' | 'manual' | 'seed' | null;
  fetched_at?: ISODate | null;
}
export interface ReviewFields {
  review: ReviewState;
  reviewed_by: UUID | null;
  reviewed_at: ISODate | null;
  reviewed_tz?: IANAZone | null; // zone of the reviewing device (instant + IANA zone rule)
  rejection_reason: string | null;
}
export interface Completion extends BaseRow, ReviewFields {
  exercise_id: UUID;
  event_id: UUID;
  dog_id: UUID;
  handler_id: UUID;
  performed: PerformedState;
  is_blind: boolean | null; // tri-state: null = never answered
  monitor: string;
  odor_set_at: ISODate | null;
  start_at: ISODate | null;
  end_at: ISODate | null;
  tz: IANAZone;
  weather: Weather | null;
  comments: string; // ≤ 32000 chars
  summary: string; // "Exercise Summary (for review only)"
  sections: Record<string, Record<string, unknown>>; // keyed by patrol type
  files: UUID[];
  is_complete: boolean;
  is_outdated: boolean;
  exercise_version_seen: number;
  saved_at: ISODate | null;
  track_id?: UUID | null;
}

// ---------- Deployments ----------
export type RequestFulfillment = 'deployed' | 'not_deployed' | 'cancelled_enroute';
export interface ArrestDemographics {
  age: number | null;
  sex: string; // Sex At Birth
  race: string; // Race/Ethnicity
}
export interface Arrest {
  id: UUID;
  n: number;
  charges: string;
  demographics: ArrestDemographics;
  subject_bitten: boolean | null; // tri-state: null = never answered (never print an unset as "No")
}
export interface Deployment extends BaseRow, ReviewFields {
  occurred_at: ISODate;
  tz: IANAZone;
  location: GeoLocation;
  case_number: string;
  tags: string[];
  requesting_unit: string;
  reason: string;
  dog_id: UUID;
  handler_id: UUID;
  request_fulfillment: RequestFulfillment;
  kind: ExerciseKind; // patrol | detection
  patrol_types: string[];
  sections: Record<string, Record<string, unknown>>; // keyed by patrol type
  people_found: number | null;
  people_unintentionally_bitten: number | null;
  arrests: Arrest[];
  detection: Record<string, unknown> | null; // environments searched, alerts, seizures … (form [INF])
  summary: string;
  weather: Weather | null;
  files: UUID[];
  submitted_at: ISODate | null;
  is_complete: boolean;
  track_id?: UUID | null;
}

// ---------- Classes, vet ----------
export interface ClassRecord extends BaseRow, ReviewFields {
  title: string;
  instructor: string;
  location: string;
  occurred_at: ISODate;
  tz: IANAZone;
  duration_min: number | null;
  notes: string;
  files: UUID[];
  is_complete: boolean;
  submitted_at?: ISODate | null; // set by the class editor's Submit (U4)
}

export interface VetVisit extends BaseRow {
  name: string;
  dog_id: UUID;
  location: string;
  date: ISODate;
  tz: IANAZone;
  care_types: string[];
  notes: string;
  cost: number | null;
  files: UUID[];
  /** Weight captured in lb, stored metric (U7 — imperial display, metric storage). */
  weight_kg?: number | null;
}

export interface Vaccination extends BaseRow {
  dog_id: UUID;
  vet_visit_id: UUID | null;
  type: string;
  core: boolean;
  given_at: ISODate;
  next_due_at: ISODate | null;
  tz: IANAZone;
}

// ---------- Tracking ----------
export type TrackMode = 'deployment' | 'training_lay' | 'training_follow';
export type TrackVisibility = 'hidden' | 'start_only' | 'visible';
export type TrackStatus = 'not_started' | 'active' | 'stopped' | 'completed' | 'discarded';
export interface TrackPoint {
  lat: number;
  lng: number;
  at: ISODate;
  accuracy_m?: number | null;
  alt_m?: number | null;
}
export interface TrackPin {
  id: UUID;
  lat: number;
  lng: number;
  at: ISODate;
  label: string;
  photo_id?: UUID | null;
}
export interface TrackStats {
  distance_m: number;
  duration_s: number;
  turns: number;
  points_uploaded: number;
  points_total: number;
}
export interface Track extends BaseRow {
  mode: TrackMode;
  name: string;
  dog_id: UUID | null;
  laid_track_id: UUID | null;
  visibility: TrackVisibility;
  points: TrackPoint[];
  pins: TrackPin[];
  stats: TrackStats;
  status: TrackStatus;
  started_at: ISODate | null;
  stopped_at: ISODate | null;
  tz: IANAZone;
  expires_at: ISODate | null;
  owner_kind: 'user' | 'layer'; // layer = no-account track layer
  exercise_id?: UUID | null;
  deployment_id?: UUID | null;
  /** 6-character pickup code printed for a track laid without an account (U8). */
  code?: string | null;
  /** Weather sampled at the first fix — copied onto the record the track is attached to (U8). */
  weather?: Weather | null;
  /** Stopped deliberately with "Save For Later" — distinct from merely stopped (U8). */
  saved_for_later?: boolean | null;
  /** Last time the row's points were written, so a re-opened track can show its real save state (U8). */
  saved_at?: ISODate | null;
}

// ---------- Trainer comments, reports, misc ----------
export interface TrainerComment extends BaseRow {
  record_type: 'completion' | 'deployment' | 'class';
  record_id: UUID;
  trainer_id: UUID;
  text: string;
  tz?: IANAZone; // zone the comment was written in (created_at is the instant)
}

export interface Report extends BaseRow {
  name: string;
  type: string; // vocab.REPORT_TYPES
  params: Record<string, unknown>;
  format: string;
  generated_at: ISODate | null;
  uri?: string | null;
}

export type CustomEntryType =
  | 'breed'
  | 'dog_purpose'
  | 'odor_type'
  | 'odor_category'
  | 'packaging'
  | 'event_tag'
  | 'deployment_tag'
  | 'requesting_unit'
  | 'weather_condition'
  | 'environment_type'
  | 'patrol_type'
  | 'care_type'
  | 'equipment'
  | 'terrain_type'
  | 'contaminant_type'
  | 'search_area_type'
  | 'building_type'
  | 'other';
export interface CustomEntry extends BaseRow {
  type: CustomEntryType | string;
  value: string;
  is_shared_standard: boolean; // pushed by supervisor/trainer as department standard
  use_count: number;
}

export interface SavedSearch extends BaseRow {
  name: string;
  criteria: Record<string, unknown>;
}

export interface NarrativeTemplate extends BaseRow {
  name: string;
  text: string;
  scope: 'comments' | 'goal' | 'comments_to_group' | 'class_notes' | 'any';
}

export type NotificationType =
  | 'upcoming_event'
  | 'exercise_ready_to_complete'
  | 'exercise_completion_past_due'
  | 'exercise_ready_for_comments'
  | 'exercise_ready_for_supervisor_review'
  | 'deployment_ready_for_supervisor_review'
  | 'manager_feedback'
  | 'record_update'
  | 'invitation'
  | 'vaccination_due'
  | 'general_update'
  | 'billing'
  // U5 additions
  | 'record_rejected' // supervisor rejected a record (Manager Feedback group)
  | 'trainer_comment' // a trainer commented on a record (Manager Feedback group)
  | 'record_shared' // a supervisor shared a record with another supervisor
  | 'group_request'; // training-group join request / accepted (Invitations group)
export interface Notification extends BaseRow {
  user_id: UUID;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  link: string | null; // in-app route
  tz?: IANAZone; // zone the notification was raised in (created_at is the instant)
  email_sent?: boolean; // local mode: an "EMAIL →" line was logged for this notification
  email_to?: string | null;
}

export type HistoryAction = 'add' | 'modify' | 'delete';
export type FieldDiff = Record<string, { from: unknown; to: unknown }>;
export interface HistoryEvent extends BaseRow {
  actor_id: UUID;
  action: HistoryAction;
  entity: EntityName;
  entity_id: UUID;
  label: string; // human label of the record at the time
  diff: FieldDiff;
  at: ISODate;
  tz: IANAZone;
}

// ---------- Entity registry ----------
export interface EntityMap {
  agency: Agency;
  user: User;
  role_assignment: RoleAssignment;
  seat: Seat;
  dog: Dog;
  dog_assignment: DogAssignment;
  document: Document;
  management_group: ManagementGroup;
  training_group: TrainingGroup;
  connection: Connection;
  share: Share;
  location: Location;
  training_event: TrainingEvent;
  exercise: Exercise;
  completion: Completion;
  deployment: Deployment;
  class_record: ClassRecord;
  vet_visit: VetVisit;
  vaccination: Vaccination;
  track: Track;
  trainer_comment: TrainerComment;
  report: Report;
  custom_entry: CustomEntry;
  saved_search: SavedSearch;
  narrative_template: NarrativeTemplate;
  notification: Notification;
  history_event: HistoryEvent;
}
export type EntityName = keyof EntityMap;
export const ENTITY_NAMES: EntityName[] = [
  'agency', 'user', 'role_assignment', 'seat', 'dog', 'dog_assignment', 'document',
  'management_group', 'training_group', 'connection', 'share', 'location',
  'training_event', 'exercise', 'completion', 'deployment', 'class_record',
  'vet_visit', 'vaccination', 'track', 'trainer_comment', 'report', 'custom_entry',
  'saved_search', 'narrative_template', 'notification', 'history_event',
];
export const ENTITY_LABEL: Record<EntityName, string> = {
  agency: 'Agency', user: 'User', role_assignment: 'Role', seat: 'Seat', dog: 'Dog',
  dog_assignment: 'Dog assignment', document: 'Document', management_group: 'Management group',
  training_group: 'Training group', connection: 'Connection', share: 'Share', location: 'Location',
  training_event: 'Training event', exercise: 'Exercise', completion: 'Completion',
  deployment: 'Deployment', class_record: 'Class record', vet_visit: 'Vet visit',
  vaccination: 'Vaccination', track: 'Track', trainer_comment: 'Trainer comment', report: 'Report',
  custom_entry: 'Custom entry', saved_search: 'Saved search', narrative_template: 'Narrative template',
  notification: 'Notification', history_event: 'History event',
};
