// CSV export — every log / summary report can be flattened to a header row + data rows, built in
// memory and handed to the platform downloader. RFC4180 quoting; dates print in the record's zone.
import { fmtShortDateTime } from '@/features/records/format';
import type { DeploymentSummary, ExerciseLogRow, NotReviewedRow, OdorDetailRow, TrainingSummary } from './aggregate';
import { deploymentSummary, exerciseLog, notReviewedList, odorList, trainingSummary, vetReport } from './aggregate';
import type { ReportSet, ReportSource } from './select';

export interface CsvTable { name: string; header: string[]; rows: (string | number)[][] }

function cell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(table: CsvTable): string {
  return [table.header, ...table.rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const dt = (iso: string | null | undefined, tz: string) => (iso ? fmtShortDateTime(iso, tz) : '');
const hrs = (min: number) => (min / 60).toFixed(2);

export function buildCsv(type: string, src: ReportSource, set: ReportSet): CsvTable {
  switch (type) {
    case 'exercise_log': {
      const { rows } = exerciseLog(src, set);
      return {
        name: 'exercise-log',
        header: ['Date', 'Handler', 'Dog', 'Location', 'Exercise Name', 'Type', 'Description', 'Status'],
        rows: rows.map((r: ExerciseLogRow) => [dt(r.at, r.tz), r.handlerName, r.dogName, r.location, r.exerciseName, r.type, r.description, r.status]),
      };
    }
    case 'deployment_log':
    case 'deployment_summary': {
      const s: DeploymentSummary = deploymentSummary(src, set);
      return {
        name: type === 'deployment_log' ? 'deployment-log' : 'deployment-summary',
        header: ['Case Number', 'Date', 'Handler', 'Dog', 'Category', 'Fulfillment', 'Requesting Agency', 'Environments', 'Alerts / Indications', 'Items Seized', 'People Found', 'Arrests', 'Arrests With Bites', 'Review'],
        rows: s.rows.map((r) => [
          r.caseNumber, dt(r.at, r.tz), r.handlerName, r.dogName, r.kind === 'detection' ? 'Detection' : 'Patrol', r.fulfillment, r.requestingUnit,
          r.kind === 'detection' ? r.environments : '-', r.kind === 'detection' ? r.indications : '-', r.kind === 'detection' ? r.itemsSeized : '-',
          r.kind === 'patrol' ? (r.peopleFound ?? 'N/A') : '-', r.arrests, r.arrestsWithBites, r.review,
        ]),
      };
    }
    case 'exercise_odor_list': {
      const { details } = odorList(src, set);
      return {
        name: 'exercise-odor-list',
        header: ['Date', 'Dog', 'Location', 'Exercise Name', 'Environment', 'Odor Type', 'Category', 'Odor Role', 'Amount', 'Concealed', 'H x D', 'Packaging', 'Blind', 'Description'],
        rows: details.map((r: OdorDetailRow) => [dt(r.at, r.tz), r.dogName, r.location, r.exerciseName, r.environment, r.odorType, r.category, r.role, r.amount, r.concealed, r.hxd, r.packaging, r.blind, r.description]),
      };
    }
    case 'vet_visit':
    case 'vaccination_summary': {
      const v = vetReport(src, set);
      if (type === 'vaccination_summary') {
        return {
          name: 'vaccination-summary',
          header: ['Dog', 'Vaccination', 'Core', 'Given', 'Next Due', 'Status'],
          rows: v.vaccinations.map((r) => [r.dogName, r.type, r.core ? 'Core' : 'Other', dt(r.givenAt, r.tz), r.nextDueAt ? dt(r.nextDueAt, r.tz) : '', r.overdue ? 'Overdue' : r.dueInDays != null ? `Due in ${r.dueInDays} days` : '']),
        };
      }
      return {
        name: 'vet-visits',
        header: ['Date', 'Handler', 'Dog', 'Name', 'Location', 'Care Types', 'Cost (USD)', 'Vaccinations', 'Notes'],
        rows: v.visits.map((r) => [dt(r.visit.date, r.visit.tz), r.handlerName, r.dogName, r.visit.name, r.visit.location, (r.visit.care_types || []).join('; '), r.visit.cost ?? '', r.vaccinations.map((x) => x.type).join('; '), r.visit.notes || '']),
      };
    }
    case 'not_reviewed_list': {
      const rows: NotReviewedRow[] = notReviewedList(src, set);
      return {
        name: 'not-reviewed-records',
        header: ['Handler', 'Record Type', 'Title', 'Dog', 'Date', 'Review State'],
        rows: rows.map((r) => [r.handlerName, r.kind, r.title, r.dogName, dt(r.at, r.tz), r.state]),
      };
    }
    default: {
      // Training Summary (and its by-handler variant): the exercise list is the tabular payload.
      const s: TrainingSummary = trainingSummary(src, set);
      return {
        name: 'training-summary',
        header: ['Date', 'Handler', 'Dog', 'Event', 'Location', 'Exercise Name', 'Type', 'Performed', 'Blind', 'Duration (hours)', 'Review'],
        rows: s.exercises.map((r) => [dt(r.at, r.tz), r.handlerName, r.dogName, r.eventName, r.location, r.exerciseName, r.type, r.performed, r.blind, r.minutes != null ? hrs(r.minutes) : '', r.review]),
      };
    }
  }
}
