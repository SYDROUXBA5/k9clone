// Report aggregates — every number a summary report prints, computed from the selected row set.
// Pure and O(n): the 1,000-record Training Summary is a handful of passes over arrays.
import type { ClassRecord, Completion, Deployment, Dog, Exercise, TrainingEvent, User, Vaccination, VetVisit } from '@/db/types';
import { normalizeDetection } from '@/features/deployment/deploymentModel';
import { DOW_LABEL, DOW_ORDER, dowHour, indexById, minutesBetween, odorsOf, tally, type ReportSet, type ReportSource } from './select';

const DETECTION_LABEL = 'Detection';
const EM_DASH = '—';

/** ISO-8601 week key ("2026-W07") for a calendar date already read in the record's own zone. */
export function isoWeekKey(y: number, m: number, d: number): string {
  const t = new Date(Date.UTC(y, m - 1, d));
  // Thursday of the same ISO week decides the year and the week number.
  const day = (t.getUTCDay() + 6) % 7; // Mon=0
  t.setUTCDate(t.getUTCDate() - day + 3);
  const isoYear = t.getUTCFullYear();
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

const round = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Map of bucket -> minutes|count, ordered by key, as the chart rows want it. */
function ordered(map: Map<string, number>): { key: string; value: number }[] {
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => ({ key, value }));
}

// ---------------------------------------------------------------------------------------------
// Training Summary
// ---------------------------------------------------------------------------------------------
export interface TrainingSummary {
  totalTrainingMin: number;
  eventsAttended: number;
  eventsWithTraining: number;
  performedDetection: number;
  performedPatrol: number;
  classesAttended: number;
  totalEventMin: number;
  avgEventMin: number | null;
  totalClassMin: number;
  /** hours per patrol type (scenario time split evenly across its types) + a Detection bucket */
  hoursByType: { key: string; hours: number }[];
  detection: {
    exercises: number;
    hides: number;
    finds: number | null;
    blind: number;
    known: number;
    unanswered: number;
    controlledNegatives: number;
    falseAlerts: number | null;
  };
  performedCounts: { performed: number; excused: number; unable: number; incomplete: number };
  byDayOfWeek: { key: string; hours: number }[];
  byWeek: { key: string; hours: number }[];
  byMonth: { key: string; hours: number }[];
  tagCounts: { key: string; count: number }[];
  exercises: TrainingSummaryRow[];
}

export interface TrainingSummaryRow {
  id: string;
  at: string;
  tz: string;
  dogName: string;
  handlerName: string;
  eventName: string;
  location: string;
  exerciseName: string;
  type: string;
  performed: string;
  blind: string;
  minutes: number | null;
  review: string;
}

const PERFORMED_LABEL: Record<string, string> = { performed: 'Performed', excused: 'Excused From Performing', unable: 'Unable to Perform' };
const REVIEW_LABEL: Record<string, string> = { reviewed: 'Reviewed', not_reviewed: 'Not Reviewed', rejected: 'Rejected' };

export function trainingSummary(src: ReportSource, set: ReportSet): TrainingSummary {
  const exById = indexById(src.exercises);
  const evById = indexById(src.events);
  const dogById = indexById(src.dogs);
  const userById = indexById(src.users);

  let totalTrainingMin = 0;
  let performedDetection = 0;
  let performedPatrol = 0;
  const eventIds = new Set<string>();
  const eventsWithTraining = new Set<string>();
  const typeMinutes = new Map<string, number>();
  const dowMinutes = new Array(7).fill(0) as number[];
  const monthMinutes = new Map<string, number>();
  const weekMinutes = new Map<string, number>();
  const detection = { exercises: 0, hides: 0, finds: null as number | null, blind: 0, known: 0, unanswered: 0, controlledNegatives: 0, falseAlerts: null as number | null };
  const performedCounts = { performed: 0, excused: 0, unable: 0, incomplete: 0 };
  const rows: TrainingSummaryRow[] = [];

  for (const c of set.completions) {
    const ex = exById.get(c.exercise_id);
    const ev = evById.get(c.event_id);
    const at = c.start_at || c.saved_at || c.created_at;
    const min = minutesBetween(c.start_at, c.end_at) ?? 0;
    totalTrainingMin += min;
    eventIds.add(c.event_id);
    if (!c.is_complete) performedCounts.incomplete++;
    else performedCounts[c.performed] = (performedCounts[c.performed] || 0) + 1;
    if (c.is_complete && c.performed === 'performed') eventsWithTraining.add(c.event_id);

    const kind = ex?.kind || 'patrol';
    if (kind === 'detection') {
      if (c.is_complete && c.performed === 'performed') performedDetection++;
      detection.exercises++;
      detection.hides += odorsOf(ex).length;
      if (ex?.blank_controlled_negative) detection.controlledNegatives++;
      if (c.is_blind === true) detection.blind++;
      else if (c.is_blind === false) detection.known++;
      else detection.unanswered++;
      typeMinutes.set(DETECTION_LABEL, (typeMinutes.get(DETECTION_LABEL) || 0) + min);
    } else {
      if (c.is_complete && c.performed === 'performed') performedPatrol++;
      const types = ex?.patrol_types?.length ? ex.patrol_types : ['Other'];
      const share = min / types.length;
      for (const t of types) typeMinutes.set(t, (typeMinutes.get(t) || 0) + share);
    }

    if (at) {
      const { dow, y, m, d } = dowHour(at, c.tz);
      dowMinutes[dow] += min;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      monthMinutes.set(key, (monthMinutes.get(key) || 0) + min);
      const wk = isoWeekKey(y, m, d);
      weekMinutes.set(wk, (weekMinutes.get(wk) || 0) + min);
    }

    rows.push({
      id: c.id, at, tz: c.tz,
      dogName: dogById.get(c.dog_id)?.name || '—',
      handlerName: userById.get(c.handler_id)?.name || '—',
      eventName: ev?.name || '—',
      location: ev?.location?.name || ev?.location?.address || '—',
      exerciseName: ex?.name || '—',
      type: kind === 'detection' ? 'Detection Exercise' : `Patrol Exercise${ex?.patrol_types?.length ? ` — ${ex.patrol_types.join(', ')}` : ''}`,
      performed: c.is_complete ? (PERFORMED_LABEL[c.performed] || c.performed) : 'Incomplete',
      blind: kind === 'detection' ? (c.is_blind === true ? 'Yes' : c.is_blind === false ? 'No' : 'Not answered') : EM_DASH,
      minutes: minutesBetween(c.start_at, c.end_at),
      review: REVIEW_LABEL[c.review] || c.review,
    });
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));

  // Event durations for the events actually attended.
  let totalEventMin = 0;
  for (const id of eventIds) totalEventMin += evById.get(id)?.duration_min || 0;
  const totalClassMin = set.classes.reduce((s, c) => s + (c.duration_min || 0), 0);
  const eventTags = [...eventIds].flatMap((id) => evById.get(id)?.tags || []);

  return {
    totalTrainingMin,
    eventsAttended: eventIds.size,
    eventsWithTraining: eventsWithTraining.size,
    performedDetection,
    performedPatrol,
    classesAttended: set.classes.length,
    totalEventMin,
    avgEventMin: eventIds.size ? Math.round(totalEventMin / eventIds.size) : null,
    totalClassMin,
    hoursByType: [...typeMinutes.entries()].map(([key, m]) => ({ key, hours: m / 60 })).sort((a, b) => b.hours - a.hours),
    detection,
    performedCounts,
    byDayOfWeek: DOW_ORDER.map((i) => ({ key: DOW_LABEL[i], hours: dowMinutes[i] / 60 })),
    byWeek: ordered(weekMinutes).map((r) => ({ key: r.key, hours: r.value / 60 })),
    byMonth: ordered(monthMinutes).map((r) => ({ key: r.key, hours: r.value / 60 })),
    tagCounts: tally(eventTags.map((t) => ({ t })), (r) => r.t),
    exercises: rows,
  };
}

// ---------------------------------------------------------------------------------------------
// Deployment Summary
// ---------------------------------------------------------------------------------------------
export interface DeploymentSummary {
  total: number;
  detectionCount: number;
  patrolCount: number;
  notPerformed: number;
  byFulfillment: { key: string; count: number }[];
  byReason: { key: string; count: number }[];
  byRequestingUnit: { key: string; count: number }[];
  /** Detection vs Patrol — the record's category, NOT a patrol type. */
  byCategory: { key: string; count: number }[];
  /** Genuine patrol types, tallied from patrol deployments only. */
  byPatrolType: { key: string; count: number }[];
  byDayOfWeek: { key: string; count: number }[];
  byWeek: { key: string; count: number }[];
  byMonth: { key: string; count: number }[];
  /** Per environment type: how many were searched and how many produced an indication. */
  detectionEnvironments: { key: string; searched: number; indicated: number }[];
  /** Currency Indication Ratio — detection deployments that indicated on currency vs those that did not. */
  currency: { indicated: number; notIndicated: number; totalAmount: number; currencyType: string };
  /** Seizure roll-up per odor category ("Drugs", "Drug Paraphernalia", …).
   *  The bars COUNT SEIZURE INCIDENTS (`count`), because that is the only figure that adds up: an
   *  indication that produced two odor categories cannot be counted once and also appear under both.
   *  `indications` carries the distinct indications behind each row for the band's reconciling note,
   *  and every category's `total` sums to detectionStats.itemsSeized. */
  indicationsByCategory: {
    category: string;
    /** Seizure incidents in this category. */
    total: number;
    /** Distinct indications that produced this category. */
    indications: number;
    rows: { key: string; count: number; indications: number; pct: number; grams: number; items: number; note: string }[];
    packaging: { odorType: string; rows: { key: string; count: number }[] }[];
  }[];
  /** How many of `detectionStats.indications` produced at least one seizure incident. */
  indicationsWithSeizures: number;
  outcomes: { peopleFound: number; arrests: number; arrestsWithBites: number; arrestsWithoutBites: number; notBittenOrArrested: number; unintentionalBites: number };
  detectionStats: { deployments: number; environments: number; indications: number; itemsSeized: number; arrests: number };
  /** heat[dow][hour] — 7 rows × 24 columns */
  heat: number[][];
  heatMax: number;
  dayTotals: number[];
  hourTotals: number[];
  demographics: { ages: { key: string; count: number }[]; sexes: { key: string; count: number }[]; races: { key: string; count: number }[]; total: number };
  tagCounts: { key: string; count: number }[];
  rows: DeploymentRow[];
}

export interface DeploymentRow {
  id: string;
  at: string;
  tz: string;
  caseNumber: string;
  dogName: string;
  handlerName: string;
  kind: 'detection' | 'patrol';
  /** true only for request_fulfillment === 'deployed' — the dog actually worked. */
  deployed: boolean;
  fulfillment: string;
  requestingUnit: string;
  reason: string;
  location: string;
  environments: number;
  indications: number;
  itemsSeized: number;
  peopleFound: number | null;
  arrests: number;
  arrestsWithBites: number;
  review: string;
}

const FULFILLMENT_LABEL: Record<string, string> = {
  deployed: 'Dog Deployed At Scene',
  not_deployed: 'Dog Not Deployed At Scene',
  cancelled_enroute: 'Request Cancelled Enroute',
};

const AGE_BANDS: [string, number, number][] = [['Under 18', 0, 17], ['18–24', 18, 24], ['25–34', 25, 34], ['35–44', 35, 44], ['45–54', 45, 54], ['55+', 55, 200]];

export function deploymentSummary(src: ReportSource, set: ReportSet): DeploymentSummary {
  const dogById = indexById(src.dogs);
  const userById = indexById(src.users);
  const heat: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[]);
  const rows: DeploymentRow[] = [];
  let detectionCount = 0;
  let patrolCount = 0;
  let notPerformed = 0;
  const outcomes = { peopleFound: 0, arrests: 0, arrestsWithBites: 0, arrestsWithoutBites: 0, notBittenOrArrested: 0, unintentionalBites: 0 };
  const detectionStats = { deployments: 0, environments: 0, indications: 0, itemsSeized: 0, arrests: 0 };
  const ageCounts = new Map<string, number>();
  const sexCounts = new Map<string, number>();
  const raceCounts = new Map<string, number>();
  let demographicTotal = 0;
  const dowCounts = new Array(7).fill(0) as number[];
  const weekCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  const envSearched = new Map<string, number>();
  const envIndicated = new Map<string, number>();
  const patrolTypeRows: string[][] = [];
  const currency = { indicated: 0, notIndicated: 0, totalAmount: 0, currencyType: 'USD' };
  // category -> odor type -> { count, grams, items } and category -> odor type -> packaging tally.
  // `indications` is the set of DISTINCT indication ids that produced that odor type: the charts are
  // labelled "n indications", so they must count indications, not the seizure incidents beneath them.
  const seizureByCat = new Map<string, Map<string, { count: number; grams: number; items: number; indications: Set<string> }>>();
  const allIndicationsWithSeizures = new Set<string>();
  const packagingByCat = new Map<string, Map<string, Map<string, number>>>();

  for (const d of set.deployments) {
    const deployed = d.request_fulfillment === 'deployed';
    if (!deployed) notPerformed++;
    if (d.kind === 'detection') detectionCount++; else patrolCount++;
    const { dow, hour, y, m, d: dd } = dowHour(d.occurred_at, d.tz);
    heat[dow][hour]++;
    dowCounts[dow]++;
    weekCounts.set(isoWeekKey(y, m, dd), (weekCounts.get(isoWeekKey(y, m, dd)) || 0) + 1);
    const mk = `${y}-${String(m).padStart(2, '0')}`;
    monthCounts.set(mk, (monthCounts.get(mk) || 0) + 1);
    if (d.kind === 'patrol') patrolTypeRows.push(d.patrol_types.length ? d.patrol_types : ['Non-Search']);

    const det = d.kind === 'detection' ? normalizeDetection(d.detection) : null;
    const environments = det ? det.environments.reduce((s, e) => s + (e.count || 1), 0) : 0;
    const indications = det ? det.indications.length : 0;
    const itemsSeized = det ? det.seizures.length : 0;
    if (det && deployed) {
      detectionStats.deployments++;
      detectionStats.environments += environments;
      detectionStats.indications += indications;
      detectionStats.itemsSeized += itemsSeized;
      detectionStats.arrests += (d.arrests || []).length;

      for (const e of det.environments) {
        const key = e.env_type || 'Environment';
        envSearched.set(key, (envSearched.get(key) || 0) + (e.count || 1));
        const hits = det.indications.filter((i) => i.environment_id === e.id).length;
        if (hits) envIndicated.set(key, (envIndicated.get(key) || 0) + hits);
      }
      if (det.currency_amount != null && det.currency_amount > 0) {
        currency.indicated++;
        currency.totalAmount += det.currency_amount;
        currency.currencyType = det.currency_type || currency.currencyType;
      } else {
        currency.notIndicated++;
      }
      for (const sz of det.seizures) {
        const cat = sz.odor_category || 'Uncategorised';
        const type = sz.odor_type || 'Unspecified';
        // A seizure that was never linked to an indication stands for itself, so it is still counted
        // once rather than collapsing every unlinked seizure into a single phantom indication.
        const indId = sz.indication_id || `unlinked:${sz.id}`;
        allIndicationsWithSeizures.add(`${d.id}|${indId}`);
        const byType = seizureByCat.get(cat) || new Map<string, { count: number; grams: number; items: number; indications: Set<string> }>();
        const cur = byType.get(type) || { count: 0, grams: 0, items: 0, indications: new Set<string>() };
        cur.indications.add(`${d.id}|${indId}`);
        cur.count++;
        if (sz.amount != null) {
          if ((sz.unit || '').toLowerCase().startsWith('gram')) cur.grams += sz.amount;
          else cur.items += sz.amount;
        }
        byType.set(type, cur);
        seizureByCat.set(cat, byType);
        if (sz.packaging) {
          const byTypePack = packagingByCat.get(cat) || new Map<string, Map<string, number>>();
          const packs = byTypePack.get(type) || new Map<string, number>();
          packs.set(sz.packaging, (packs.get(sz.packaging) || 0) + 1);
          byTypePack.set(type, packs);
          packagingByCat.set(cat, byTypePack);
        }
      }
    }

    const arrests = d.arrests || [];
    const withBites = arrests.filter((a) => a.subject_bitten === true).length;
    outcomes.arrests += arrests.length;
    outcomes.arrestsWithBites += withBites;
    outcomes.arrestsWithoutBites += arrests.length - withBites;
    outcomes.peopleFound += d.people_found || 0;
    outcomes.unintentionalBites += d.people_unintentionally_bitten || 0;

    for (const a of arrests) {
      demographicTotal++;
      const age = a.demographics?.age;
      const band = typeof age === 'number' ? (AGE_BANDS.find(([, lo, hi]) => age >= lo && age <= hi)?.[0] || 'Unknown') : 'Unknown';
      ageCounts.set(band, (ageCounts.get(band) || 0) + 1);
      const sex = a.demographics?.sex || 'Unknown';
      sexCounts.set(sex, (sexCounts.get(sex) || 0) + 1);
      const race = a.demographics?.race || 'Unknown';
      raceCounts.set(race, (raceCounts.get(race) || 0) + 1);
    }

    rows.push({
      id: d.id, at: d.occurred_at, tz: d.tz,
      caseNumber: d.case_number || 'N/A',
      dogName: dogById.get(d.dog_id)?.name || '—',
      handlerName: userById.get(d.handler_id)?.name || '—',
      kind: d.kind,
      deployed,
      fulfillment: FULFILLMENT_LABEL[d.request_fulfillment] || d.request_fulfillment,
      requestingUnit: d.requesting_unit || '—',
      reason: d.reason || '—',
      location: d.location?.name || d.location?.address || '—',
      environments, indications, itemsSeized,
      peopleFound: d.people_found,
      arrests: arrests.length,
      arrestsWithBites: withBites,
      review: REVIEW_LABEL[d.review] || d.review,
    });
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  outcomes.notBittenOrArrested = Math.max(0, outcomes.peopleFound - outcomes.arrests);

  const dayTotals = heat.map((r) => r.reduce((s, n) => s + n, 0));
  const hourTotals = new Array(24).fill(0).map((_, h) => heat.reduce((s, r) => s + r[h], 0));
  const heatMax = Math.max(1, ...heat.flat());

  const order = (m: Map<string, number>) => [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  const detectionEnvironments = [...envSearched.entries()]
    .map(([key, searched]) => ({ key, searched, indicated: envIndicated.get(key) || 0 }))
    .sort((a, b) => b.searched - a.searched || a.key.localeCompare(b.key));

  const indicationsByCategory = [...seizureByCat.entries()]
    .map(([category, byType]) => {
      // Bars count seizure incidents. Counting indications here cannot work: one indication that
      // produced meth AND a scale belongs under both categories, so indication rows would add to
      // more than the Detection Statistics indication figure and the sheet would contradict itself.
      const catIndications = new Set<string>();
      for (const v of byType.values()) for (const id of v.indications) catIndications.add(id);
      const total = [...byType.values()].reduce((n, v) => n + v.count, 0);
      const rows = [...byType.entries()]
        .map(([key, v]) => {
          const pct = total ? Math.round((v.count / total) * 100) : 0;
          const amount = [
            v.grams ? `${round(v.grams)} gram${v.grams === 1 ? '' : 's'}` : '',
            v.items ? `${round(v.items)} item${v.items === 1 ? '' : 's'}` : '',
          ].filter(Boolean).join(' · ');
          return {
            key, count: v.count, indications: v.indications.size, pct, grams: v.grams, items: v.items,
            note: `${v.count} seizure${v.count === 1 ? '' : 's'} (${pct}%)${amount ? `: ${amount}` : ''}`,
          };
        })
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
      const packMap = packagingByCat.get(category);
      const packaging = packMap
        ? [...packMap.entries()].map(([odorType, packs]) => ({ odorType, rows: order(packs) })).sort((a, b) => a.odorType.localeCompare(b.odorType))
        : [];
      return { category, total, indications: catIndications.size, rows, packaging };
    })
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));

  return {
    total: set.deployments.length,
    detectionCount, patrolCount, notPerformed,
    byFulfillment: tally(set.deployments, (d) => FULFILLMENT_LABEL[d.request_fulfillment] || d.request_fulfillment),
    byReason: tally(set.deployments, (d) => (d.reason || '').slice(0, 60) || '—'),
    byRequestingUnit: tally(set.deployments, (d) => d.requesting_unit || '—').slice(0, 25),
    byCategory: tally(set.deployments, (d) => (d.kind === 'detection' ? 'Detection' : 'Patrol')),
    byPatrolType: tally(patrolTypeRows, (r) => r),
    byDayOfWeek: DOW_ORDER.map((i) => ({ key: DOW_LABEL[i], count: dowCounts[i] })),
    byWeek: ordered(weekCounts).map((r) => ({ key: r.key, count: r.value })),
    byMonth: ordered(monthCounts).map((r) => ({ key: r.key, count: r.value })),
    detectionEnvironments, currency, indicationsByCategory,
    indicationsWithSeizures: allIndicationsWithSeizures.size,
    outcomes, detectionStats,
    heat, heatMax, dayTotals, hourTotals,
    demographics: { ages: order(ageCounts), sexes: order(sexCounts), races: order(raceCounts), total: demographicTotal },
    tagCounts: tally(set.deployments, (d) => d.tags || []),
    rows,
  };
}

// ---------------------------------------------------------------------------------------------
// Exercise Log
// ---------------------------------------------------------------------------------------------
export interface ExerciseLogRow {
  id: string; at: string; tz: string; location: string; exerciseName: string; type: string; description: string;
  status: string; dogName: string; handlerName: string;
}

export function exerciseLog(src: ReportSource, set: ReportSet): { rows: ExerciseLogRow[]; counts: { performed: number; excused: number; unable: number; incomplete: number } } {
  const exById = indexById(src.exercises);
  const evById = indexById(src.events);
  const dogById = indexById(src.dogs);
  const userById = indexById(src.users);
  const counts = { performed: 0, excused: 0, unable: 0, incomplete: 0 };
  const rows: ExerciseLogRow[] = set.completions.map((c) => {
    const ex = exById.get(c.exercise_id);
    const ev = evById.get(c.event_id);
    if (!c.is_complete) counts.incomplete++;
    else counts[c.performed] = (counts[c.performed] || 0) + 1;
    const odors = odorsOf(ex);
    const description = ex?.kind === 'detection'
      ? (ex.blank_controlled_negative ? 'Blank / controlled negative sniff' : odors.length ? `${ex.environments[0]?.env_type || 'Environment'} search for ${[...new Set(odors.map((o) => o.category))].join(', ')}${odors.length > 1 ? ` (+${odors.length - 1} more)` : ''}` : 'Proofing only')
      : (ex?.goal || ex?.patrol_types.join(', ') || '—');
    return {
      id: c.id, at: c.start_at || c.saved_at || c.created_at, tz: c.tz,
      location: ev?.location?.name || ev?.location?.address || '—',
      exerciseName: ex?.name || '—',
      type: ex?.kind === 'detection' ? 'Detection Exercise' : 'Patrol Exercise',
      description,
      status: c.is_complete ? (PERFORMED_LABEL[c.performed] || c.performed) : 'Incomplete',
      dogName: dogById.get(c.dog_id)?.name || '—',
      handlerName: userById.get(c.handler_id)?.name || '—',
    };
  });
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { rows, counts };
}

// ---------------------------------------------------------------------------------------------
// Odor list — per-dog target vs proofing summary + one row per odor
// ---------------------------------------------------------------------------------------------
export interface OdorSummaryRow {
  /** dogId|category|type — unique even when two dogs share a display name. */
  id: string;
  dogName: string; category: string; type: string; role: 'Target Odor' | 'Proofing Odor';
  count: number; lastTrainedAt: string | null; tz: string;
}
export interface OdorDetailRow {
  id: string; at: string; tz: string; location: string; exerciseName: string; environment: string;
  odorType: string; category: string; role: string; amount: string; concealed: string; hxd: string; packaging: string; blind: string; description: string; dogName: string;
}

export function odorList(src: ReportSource, set: ReportSet): { summary: OdorSummaryRow[]; details: OdorDetailRow[] } {
  const exById = indexById(src.exercises);
  const evById = indexById(src.events);
  const dogById = indexById(src.dogs);
  const summaryMap = new Map<string, OdorSummaryRow>();
  const details: OdorDetailRow[] = [];

  for (const c of set.completions) {
    const ex = exById.get(c.exercise_id);
    if (!ex || ex.kind !== 'detection') continue;
    const ev = evById.get(c.event_id);
    const dog = dogById.get(c.dog_id);
    const at = c.start_at || c.saved_at || c.created_at;
    for (const o of odorsOf(ex)) {
      const isTarget = !!dog && dog.odor_types.includes(o.category);
      const role: OdorSummaryRow['role'] = isTarget ? 'Target Odor' : 'Proofing Odor';
      const key = `${c.dog_id}|${o.category}|${o.type}`;
      const cur = summaryMap.get(key);
      if (cur) {
        cur.count++;
        if (at && (!cur.lastTrainedAt || at > cur.lastTrainedAt)) { cur.lastTrainedAt = at; cur.tz = c.tz; }
      } else {
        summaryMap.set(key, { id: key, dogName: dog?.name || '—', category: o.category || '—', type: o.type || '—', role, count: 1, lastTrainedAt: at || null, tz: c.tz });
      }
      details.push({
        id: `${c.id}-${details.length}`, at, tz: c.tz,
        location: ev?.location?.name || ev?.location?.address || '—',
        exerciseName: ex.name, environment: [o.env, o.unit].filter(Boolean).join(' — ') || '—',
        odorType: o.type || '—', category: o.category || '—', role,
        amount: o.amount != null ? `${o.amount} ${o.unitLabel || ''}`.trim() : '—',
        concealed: o.concealed || '—',
        hxd: o.height_ft != null || o.depth_ft != null ? `${o.height_ft ?? '—'} × ${o.depth_ft ?? '—'} ft` : '—',
        packaging: o.packaging || '—',
        blind: c.is_blind === true ? 'Yes' : c.is_blind === false ? 'No' : 'Not answered',
        description: o.description || '—',
        dogName: dog?.name || '—',
      });
    }
  }
  details.sort((a, b) => (a.at < b.at ? 1 : -1));
  const summary = [...summaryMap.values()].sort((a, b) => a.dogName.localeCompare(b.dogName) || a.role.localeCompare(b.role) || b.count - a.count);
  return { summary, details };
}

// ---------------------------------------------------------------------------------------------
// Deployment log rows come straight from the summary; vet / vaccination has its own shape
// ---------------------------------------------------------------------------------------------
export interface VaccinationRow {
  id: string;
  dogName: string; type: string; core: boolean; givenAt: string; nextDueAt: string | null; tz: string; overdue: boolean; dueInDays: number | null;
}

export function vetReport(src: ReportSource, set: ReportSet, now = Date.now()): {
  visits: { visit: VetVisit; dogName: string; handlerName: string; vaccinations: Vaccination[] }[];
  vaccinations: VaccinationRow[];
  totalCost: number;
} {
  const dogById = indexById(src.dogs);
  const userById = indexById(src.users);
  const byVisit = new Map<string, Vaccination[]>();
  for (const v of set.vaccinations) {
    const k = v.vet_visit_id || '';
    const l = byVisit.get(k);
    if (l) l.push(v); else byVisit.set(k, [v]);
  }
  const visits = set.vets
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((visit) => ({
      visit,
      dogName: dogById.get(visit.dog_id)?.name || '—',
      handlerName: userById.get(visit.owner_user_id)?.name || '—',
      vaccinations: byVisit.get(visit.id) || [],
    }));
  const vaccinations: VaccinationRow[] = set.vaccinations
    .map((v) => {
      const due = v.next_due_at ? new Date(v.next_due_at).getTime() : null;
      return {
        id: v.id,
        dogName: dogById.get(v.dog_id)?.name || '—',
        type: v.type, core: v.core, givenAt: v.given_at, nextDueAt: v.next_due_at, tz: v.tz,
        overdue: due != null && due < now,
        dueInDays: due != null ? Math.round((due - now) / 86400000) : null,
      };
    })
    .sort((a, b) => a.dogName.localeCompare(b.dogName) || Number(b.core) - Number(a.core) || a.type.localeCompare(b.type));
  return { visits, vaccinations, totalCost: set.vets.reduce((s, v) => s + (v.cost || 0), 0) };
}

// ---------------------------------------------------------------------------------------------
// Supervisor: not-reviewed list
// ---------------------------------------------------------------------------------------------
export interface NotReviewedRow { id: string; recordId: string; handlerName: string; kind: string; title: string; at: string; tz: string; dogName: string; state: string }

export function notReviewedList(src: ReportSource, set: ReportSet): NotReviewedRow[] {
  const exById = indexById(src.exercises);
  const dogById = indexById(src.dogs);
  const userById = indexById(src.users);
  const rows: NotReviewedRow[] = [];
  for (const c of set.completions) {
    if (!c.is_complete || c.review === 'reviewed') continue;
    rows.push({
      id: `completion-${c.id}`, recordId: c.id,
      handlerName: userById.get(c.handler_id)?.name || '—', kind: 'Training',
      title: exById.get(c.exercise_id)?.name || 'Exercise', at: c.start_at || c.saved_at || c.created_at, tz: c.tz,
      dogName: dogById.get(c.dog_id)?.name || '—', state: REVIEW_LABEL[c.review] || c.review,
    });
  }
  for (const d of set.deployments) {
    if (d.review === 'reviewed') continue;
    rows.push({
      id: `deployment-${d.id}`, recordId: d.id,
      handlerName: userById.get(d.handler_id)?.name || '—', kind: 'Deployment',
      title: d.case_number || 'N/A', at: d.occurred_at, tz: d.tz,
      dogName: dogById.get(d.dog_id)?.name || '—', state: REVIEW_LABEL[d.review] || d.review,
    });
  }
  for (const c of set.classes) {
    if (c.review === 'reviewed') continue;
    rows.push({
      id: `class-${c.id}`, recordId: c.id,
      handlerName: userById.get(c.owner_user_id)?.name || '—', kind: 'Class',
      title: c.title || 'Class', at: c.occurred_at, tz: c.tz, dogName: '—', state: REVIEW_LABEL[c.review] || c.review,
    });
  }
  rows.sort((a, b) => a.handlerName.localeCompare(b.handlerName) || (a.at < b.at ? 1 : -1));
  return rows;
}

/** Split a selected set into one set per handler (supervisor group variants). */
export function splitByHandler(set: ReportSet): { handlerId: string; set: ReportSet }[] {
  const ids = set.handlerIds.length ? set.handlerIds : [''];
  return ids.map((handlerId) => {
    const completions = set.completions.filter((c) => c.handler_id === handlerId);
    const deployments = set.deployments.filter((d) => d.handler_id === handlerId);
    const classes = set.classes.filter((c) => c.owner_user_id === handlerId);
    const vets = set.vets.filter((v) => v.owner_user_id === handlerId);
    const vaccinations = set.vaccinations.filter((v) => v.owner_user_id === handlerId);
    const instants = [
      ...completions.map((c) => c.start_at || c.saved_at || c.created_at),
      ...deployments.map((d) => d.occurred_at), ...classes.map((c) => c.occurred_at), ...vets.map((v) => v.date),
    ].filter((x): x is string => !!x).sort();
    return {
      handlerId,
      set: {
        completions, deployments, classes, vets, vaccinations,
        handlerIds: [handlerId],
        dogIds: [...new Set([...completions.map((c) => c.dog_id), ...deployments.map((d) => d.dog_id)])],
        firstAt: instants[0] || null, lastAt: instants[instants.length - 1] || null,
        total: completions.length + deployments.length + classes.length + vets.length,
      },
    };
  });
}

// re-exported so report components can label things without importing three modules
export { PERFORMED_LABEL, REVIEW_LABEL, FULFILLMENT_LABEL };
export type { Completion, Deployment, ClassRecord, Dog, Exercise, TrainingEvent, User, VetVisit, Vaccination };
