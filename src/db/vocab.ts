// Dropdown vocabularies. Source: bar/parts/03-vocab-roles-loop-reports.md (§3) and the screen tables.
// Every list is evidenced from public vendor material unless a comment says [OURS] — where the
// research is silent we use a sensible minimal list and say so. Every dropdown also accepts a typed
// custom value (Select + CustomEntry), so these are defaults, not limits.

// §3.1 Patrol Types — dog attribute list is the master vocabulary.
export const PATROL_TYPES = [
  'Obedience',
  'Agility / Obstacle Course',
  'Criminal Apprehension / Aggression Control',
  'Area Search for Humans',
  'Area Search for Evidence',
  'Building Search',
  'Tracking',
  'Other',
] as const;

// Deployment patrol activity set (deployment section headers / report categories).
export const DEPLOYMENT_PATROL_TYPES = [
  'Non-Search',
  'Tracking',
  'Building Search',
  'Area Search for Humans',
  'Evidence Search',
] as const;

// Search-panel spelling of patrol types (2021 filter dropdown).
export const PATROL_TYPE_FILTER = [
  'Scenario (multiple)',
  'Obedience',
  'Agility',
  'Apprehension',
  'Area Search For Humans',
  'Evidence Search',
  'Building Search',
  'Tracking',
  'Other Training',
  'Non-Search',
] as const;

export const WORK_MODES = ['Detect & Patrol', 'Detection', 'Patrol'] as const;

// §3.2 Detection odor categories (dog attribute "Detection Odor Types"); first ten evidenced,
// 'Wildlife' closes the list per the Dogs screen table.
export const ODOR_CATEGORIES = [
  'Alcohol',
  'Arson',
  'Cadaver',
  'Concealed Humans',
  'Currency',
  'Drugs',
  'Drug Paraphernalia',
  'Electronics',
  'Explosives',
  'Firearms',
  'Wildlife',
] as const;

// Known odor Type values per category. Firearms list evidenced (2018 UI); Drugs: only 'Cocaine' is
// evidenced — the rest of the Drugs list, Explosives, Arson beyond 'acetone' etc. are [OURS] minimal
// defaults (common US police-K9 target odors); users extend them inline.
export const ODOR_TYPES: Record<string, string[]> = {
  Firearms: [
    'Empty Magazine', 'Ammunition', 'Hand Gun', 'Machine Gun', 'Rifle', 'Semiautomatic',
    'Shell Casing', 'Shotgun', 'Spent Shell Casing',
  ],
  Drugs: ['Cocaine', 'Marijuana', 'Heroin', 'Methamphetamine', 'Fentanyl', 'MDMA'], // Cocaine evidenced; others [OURS]
  Explosives: ['TNT', 'RDX', 'PETN', 'Smokeless Powder', 'Black Powder', 'Ammonium Nitrate', 'C-4'], // [OURS]
  Arson: ['Acetone', 'Gasoline', 'Diesel', 'Kerosene', 'Lighter Fluid'], // 'acetone' evidenced; others [OURS]
  Currency: ['US Currency'], // [OURS]
  Cadaver: ['Human Remains'], // [OURS]
  'Concealed Humans': ['Human Scent'], // [OURS]
  Electronics: ['Storage Media', 'Phone', 'SIM Card'], // [OURS]
  Alcohol: ['Ethanol'], // [OURS]
  'Drug Paraphernalia': ['Pipe', 'Scale', 'Baggies'], // [OURS]
  Wildlife: ['Ivory', 'Shark Fin'], // [OURS]
};

export const AMOUNT_UNITS = ['Grams', 'Items', 'USD'] as const;

// Environment types (help centre + bundle strings).
export const ENVIRONMENT_TYPES = [
  'Vehicle', 'Room', 'Locker', 'Open Area', 'Luggage', 'Parcel/Item', 'Person', 'Boat', 'Bus',
] as const;

// Packaging — custom-entry type; two values evidenced.
export const PACKAGING_DEFAULTS = ['Plastic Bag', 'Scent Tape', 'Cardboard', 'Plastic'] as const;

// §3.4 Tag defaults
export const EVENT_TAGS = ['Demonstration', 'Scent Wall', 'Certification'] as const;
export const DEPLOYMENT_TAGS = [
  'Overtime', 'Off Duty', 'Call Out', 'Burglary', 'Armed Robbery', 'Felony', 'Nighttime', 'Shots Fired',
] as const;

// §3.5 Request Fulfillment
export const REQUEST_FULFILLMENT = [
  { value: 'deployed', label: 'Dog Deployed At Scene' },
  { value: 'not_deployed', label: 'Dog Not Deployed At Scene' },
  { value: 'cancelled_enroute', label: 'Request Cancelled Enroute' },
] as const;

// §3.6 Review / performed / completion states
export const REVIEW_STATES = [
  { value: 'not_reviewed', label: 'Not Reviewed' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'rejected', label: 'Rejected' },
] as const;
export const PERFORMED_STATES = [
  { value: 'performed', label: 'Performed' },
  { value: 'excused', label: 'Excused From Performing' },
  { value: 'unable', label: 'Unable to Perform' },
] as const;
export const COMPLETION_PILLS = ['Incomplete', 'Complete', '1/2 Complete', 'Attended'] as const;
export const ATTENDANCE_ANSWERS = [
  { value: 'undecided', label: 'Undecided' },
  { value: 'attend', label: 'Attend' },
  { value: 'decline', label: 'Decline' },
] as const;

// §3.7 Weather — General Conditions list is a custom-entry type; values below are seen examples + [OURS].
export const WEATHER_CONDITIONS = [
  'Sunny', 'Clear', 'Partly Cloudy', 'Partially cloudy', 'Overcast', 'Rain', 'Drizzle', 'Thunderstorm',
  'Snow', 'Fog', 'Windy',
] as const;
export const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export const WEATHER_FIELDS = ['General Conditions', 'Temperature', 'Wind Speed', 'Wind Direction'] as const;

// §3.8 Care types — blog list + values rendered on the vet visit view.
export const CARE_TYPES = [
  'General Checkup', 'Vaccinations', 'Imaging (X-ray, CT, MRI, etc.)', 'Treatment', 'Surgery',
  'Dental', // [OURS]
  'Emergency', // [OURS]
] as const;
export const VACCINES_CORE = ['Distemper', 'Adenovirus', 'Parvovirus', 'Parainfluenza', 'Rabies'] as const;
export const VACCINES_NON_CORE = ['Leptospira', 'Lyme Disease', 'Bordetella', 'Canine Influenza', 'Rattlesnake'] as const;
export const CORE_INTERVAL_YEARS = 3;
export const NON_CORE_INTERVAL_YEARS = 1;

// §3.9 Document categories — user-defined in the original; [OURS] starter set.
export const DOCUMENT_CATEGORIES = ['Certifications', 'Training Records', 'Medical', 'Photos', 'Other'] as const;

// §3.10 Report types
export const REPORT_TYPES = [
  { group: 'Full Record', value: 'full_exercise', label: 'Exercise' },
  { group: 'Full Record', value: 'full_deployment', label: 'Deployment' },
  { group: 'Full Record', value: 'full_class', label: 'Class' },
  { group: 'Summary', value: 'training_summary', label: 'Training Summary' },
  { group: 'Summary', value: 'deployment_summary', label: 'Deployment Summary' },
  { group: 'Summary', value: 'exercise_log', label: 'Exercise Log' },
  { group: 'Summary', value: 'deployment_log', label: 'Deployment Log' },
  { group: 'Summary', value: 'exercise_odor_list', label: 'Exercise Odor List' },
  { group: 'Veterinary', value: 'vet_visit', label: 'Vet Visit' },
  { group: 'Veterinary', value: 'vaccination_summary', label: 'Vaccination Summary' },
] as const;

// §3.11 Export formats — v1 ships PDF + CSV; the rest are open parity items.
export const EXPORT_FORMATS = [
  { value: 'pdf', label: 'PDF', available: true },
  { value: 'csv', label: 'CSV', available: true },
  { value: 'docx', label: 'Word document', available: false },
  { value: 'xlsx', label: 'Excel spreadsheet', available: false },
  { value: 'png', label: 'Image', available: false },
  { value: 'html', label: 'Web page', available: false },
  { value: 'txt', label: 'Text document', available: false },
] as const;

// §3.12 Tracking
export const TRACK_MODES = [
  { value: 'deployment', label: 'DEPLOYMENT Track' },
  { value: 'training_lay', label: 'TRAINING Lay Track' },
  { value: 'training_follow', label: 'TRAINING Follow' },
] as const;
export const TRACK_VISIBILITY = [
  { value: 'hidden', label: 'Hidden' },
  { value: 'start_only', label: 'Start Location' },
  { value: 'visible', label: 'Visible' },
] as const;
export const TRACK_STOP_OPTIONS = ['COMPLETE EXERCISE', 'SAVE FOR LATER', 'DISCARD TRACK', 'RESUME'] as const;
export const MAP_LAYERS = ['Satellite', 'Road', 'Terrain'] as const;
export const TERRAIN_TYPES = ['Asphalt', 'Concrete', 'Grass/vegetation', 'Gravel', 'Dirt', 'Sand', 'Wooded'] as const; // first three evidenced
export const CONTAMINANT_TYPES = ['Trash/waste', 'Animals', 'Vehicles', 'People', 'Food'] as const; // first two evidenced
export const LAID_TRACK_EXPIRY_DAYS = 3;
export const FOLLOW_RADIUS_YARDS = 500;

// §3.13 Notification types
export const NOTIFICATION_TYPES = [
  { value: 'upcoming_event', label: 'Upcoming event' },
  { value: 'exercise_ready_to_complete', label: 'Exercise ready to complete' },
  { value: 'exercise_completion_past_due', label: 'Exercise completion past due' },
  { value: 'exercise_ready_for_comments', label: 'Exercise ready for comments' },
  { value: 'exercise_ready_for_supervisor_review', label: 'Exercise ready for supervisor review' },
  { value: 'deployment_ready_for_supervisor_review', label: 'Deployment ready for supervisor review' },
  { value: 'manager_feedback', label: 'Manager feedback (trainer comments / rejections)' },
  { value: 'record_update', label: 'Record update (outdated)' },
  { value: 'invitation', label: 'Invitation' },
  { value: 'vaccination_due', label: 'Vaccination due' },
  { value: 'general_update', label: 'General update' },
  { value: 'billing', label: 'Billing' },
  { value: 'record_rejected', label: 'Record rejected' },
  { value: 'trainer_comment', label: 'Trainer comment' },
  { value: 'record_shared', label: 'Record shared with you' },
  { value: 'group_request', label: 'Training group request' },
] as const;

/** Profile → Notifications table rows (bar §2.19 row 4): label · help · which NotificationTypes it governs · default email on. */
export const NOTIFICATION_PREF_GROUPS = [
  { key: 'invitation', label: 'Invitations', help: 'Invites from trainers, supervisors, and new training groups', types: ['invitation', 'group_request'], roles: ['handler', 'trainer', 'supervisor'], optIn: false },
  { key: 'upcoming_event', label: 'Upcoming Training', help: 'Future training events, both optional and mandatory', types: ['upcoming_event', 'exercise_ready_to_complete'], roles: ['handler'], optIn: false },
  { key: 'exercise_completion_past_due', label: 'Exercise Completions', help: 'Exercise completions that are 7 days past due', types: ['exercise_completion_past_due'], roles: ['handler'], optIn: false },
  { key: 'manager_feedback', label: 'Manager Feedback', help: 'Records rejected by your supervisor or training record comments from trainers', types: ['manager_feedback', 'record_rejected', 'trainer_comment'], roles: ['handler'], optIn: false },
  { key: 'record_update', label: 'Record Updates', help: 'Exercises modified after you completed them', types: ['record_update'], roles: ['handler'], optIn: false },
  { key: 'exercise_ready_for_comments', label: 'Exercise Ready For Comments', help: 'A handler you train completed an exercise that is ready for your comments (opt-in)', types: ['exercise_ready_for_comments'], roles: ['trainer'], optIn: true },
  { key: 'general_update', label: 'General Updates', help: 'General messages related to your account (billing, subscriptions, reports, etc.)', types: ['general_update', 'billing', 'record_shared'], roles: ['handler', 'trainer', 'supervisor', 'billing_manager'], optIn: false },
  { key: 'vaccination_due', label: 'Vaccinations Due', help: 'Vaccinations due within 14 days or overdue', types: ['vaccination_due'], roles: ['handler', 'supervisor'], optIn: false },
  { key: 'exercise_ready_for_supervisor_review', label: 'Exercise Ready For Review', help: 'A handler you supervise saved a training record that is ready for review (opt-in, off by default)', types: ['exercise_ready_for_supervisor_review'], roles: ['supervisor'], optIn: true },
  { key: 'deployment_ready_for_supervisor_review', label: 'Deployment Ready For Review', help: 'A handler you supervise saved a deployment record that is ready for review (opt-in, off by default)', types: ['deployment_ready_for_supervisor_review'], roles: ['supervisor'], optIn: true },
] as const;
export const TRAINING_HOURS_GREEN = 16; // Manage: month bar turns green at ≥ 16 training hours
export const INACTIVE_TRAINING_DAYS = 30; // Manage: "Late" flag when a handler has no training in 30 days
export const GROUP_CODE_LENGTH = 7; // training-group join code: 7 letters/numbers

// §3.14 Filters
export const RECORD_TYPE_FILTER = ['All', 'Training', 'Deployment', 'Class', 'Vet Visit'] as const;
export const DATE_RANGES = [
  'All Time', 'This Month', 'Last Month', 'Last 30 Days', 'Last 90 Days', 'This Year', 'Last Year', 'Custom...',
] as const;

// §3.15 Sub-vocabularies
export const OBEDIENCE_TYPES = ['Sit', 'Stay', 'Down', 'Heel', 'Long stay', 'Stand'] as const;
export const LEASH_STATES = ['On leash', 'Off leash'] as const;
export const EQUIPMENT_USED = ['Bite Suit', 'Sleeve', 'Hidden Sleeve', 'Muzzle'] as const; // first two evidenced
export const BITE_RELEASE = [
  { value: 'verbal', label: 'Verbal Only', description: 'Dog was released using verbal commands' },
  { value: 'verbal_physical', label: 'Verbal & Physical', description: 'Dog was released using a combination of verbal commands and physical removal' },
] as const;
export const SEARCH_AREA_TYPES = ['Residential', 'Open field', 'Commercial', 'Wooded', 'Industrial', 'School'] as const; // first two evidenced
export const BUILDING_TYPES = ['Residential', 'Commercial', 'Warehouse', 'School', 'Vehicle Bay', 'Other'] as const; // [OURS]
export const RACE_ETHNICITY = ['White', 'Black or African American', 'Hispanic or Latino', 'Asian', 'American Indian or Alaska Native', 'Native Hawaiian or Pacific Islander', 'Other', 'Unknown'] as const; // 'White' evidenced; rest [OURS] US census categories
export const SEX_AT_BIRTH = ['Male', 'Female', 'Unknown'] as const; // 'Male' evidenced

// §3.16 Custom entry types (page vocabulary)
export const CUSTOM_ENTRY_TYPE_LABEL: Record<string, string> = {
  odor_type: 'Odor',
  odor_category: 'Odor Category',
  packaging: 'Packaging',
  event_tag: 'Event Tags',
  deployment_tag: 'Deployment Tags',
  requesting_unit: 'Requesting Unit',
  weather_condition: 'Weather',
  breed: 'Breed',
  environment_type: 'Environment',
  patrol_type: 'Patrol Type',
  care_type: 'Care Type',
  equipment: 'Equipment',
  terrain_type: 'Terrain',
  contaminant_type: 'Contaminant',
  search_area_type: 'Search Area Type',
  building_type: 'Building Type',
  other: 'Other',
};

// §3.17 Roles / manager types
export const MANAGER_TYPES = ['Trainer', 'Supervisor'] as const;
export const SIGNUP_ROLES = ['Handler', 'Supervisor', 'Trainer', 'Billing Manager'] as const;

// Dogs — breeds are free text in the original; [OURS] starter list of common police-K9 breeds.
export const DOG_BREEDS = [
  'German Shepherd', 'Belgian Malinois', 'Dutch Shepherd', 'Labrador Retriever', 'Bloodhound',
  'German Shorthaired Pointer', 'English Springer Spaniel', 'Golden Retriever', 'Rottweiler', 'Doberman Pinscher',
  'Giant Schnauzer', 'Mixed',
] as const;
// "Type / Purpose" is free text in the original (examples given in its help); [OURS] starter list.
export const DOG_PURPOSES = [
  'Dual Purpose (Narcotics/Patrol)', 'Dual Purpose (Explosives/Patrol)', 'Narcotics Detection', 'Explosive Detection',
  'Patrol Apprehension & Tracking', 'Tracking / Trailing', 'Search & Rescue', 'Cadaver Detection', 'Electronics Detection',
  'Firearms Detection', 'Community Relations',
] as const;
export const DOG_MAX_TEXT = 50;
export const DOG_SEXES = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'unknown', label: 'Unknown' },
] as const;
export const DOG_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'retired', label: 'Retired' },
] as const;

// Billing
export const PRICE_MONTHLY_USD = 14;
export const PRICE_ANNUAL_USD = 140;
export const TRIAL_DAYS = 30;
export const COMMENTS_MAX = 32000;
export const LATE_RECORD_DAYS = 7;
export const VACCINE_REMINDER_DAYS = 14;
