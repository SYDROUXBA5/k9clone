// Class record — form model, defaults, validation (bar §2.7). No dog on a class; counts into
// `Classes Attended` / `Total Class Duration` (duration stored in minutes, shown as Hours:Mins).
import type { ClassRecord } from '@/db/types';
import { deviceTimeZone } from '@/db/util';

export const CLASS_TITLE_MAX = 250;
export const CLASS_TEXT_MAX = 250;

/** Sample notes templates that ship with the app (titles [OURS]; the reference ships samples for deployments only). */
export const CLASS_NOTES_SAMPLES: { name: string; text: string }[] = [
  { name: 'CLASSROOM SESSION.', text: 'Attended [class name] presented by [instructor] at [location]. Topics covered: [topic 1], [topic 2], [topic 3]. Key take-aways for the K9 team: [take-aways]. Materials received: [handouts / slides / certificate].' },
  { name: 'CERTIFICATION SEMINAR.', text: 'Attended the [organisation] certification seminar on [topic]. Sessions: [session list]. Standards discussed: [standards]. Action items for our unit: [actions].' },
  { name: 'LEGAL UPDATE.', text: 'Legal update class covering recent case law on K9 deployments and detection: [cases]. Practical implications for record keeping and reporting: [implications].' },
];

export interface ClassDraft {
  title: string;
  location: string;
  instructor: string;
  occurred_at: string | null;
  tz: string;
  duration_h: number | null;
  duration_m: number | null;
  notes: string;
  files: string[];
}

export function emptyClassDraft(): ClassDraft {
  return { title: '', location: '', instructor: '', occurred_at: new Date().toISOString(), tz: deviceTimeZone(), duration_h: null, duration_m: null, notes: '', files: [] };
}
export function classDraftFromRecord(r: ClassRecord): ClassDraft {
  const min = r.duration_min ?? null;
  return {
    title: r.title || '', location: r.location || '', instructor: r.instructor || '', occurred_at: r.occurred_at, tz: r.tz || deviceTimeZone(),
    duration_h: min == null ? null : Math.floor(min / 60), duration_m: min == null ? null : min % 60, notes: r.notes || '', files: r.files || [],
  };
}
/** Fields carried over from the handler's previous class ("Pre-filled from <date> — Clear"). */
export function prefillClassFrom(prev: ClassRecord, base: ClassDraft): ClassDraft {
  return { ...base, location: prev.location || '', instructor: prev.instructor || '' };
}

export function durationMinutes(d: Pick<ClassDraft, 'duration_h' | 'duration_m'>): number | null {
  if (d.duration_h == null && d.duration_m == null) return null;
  return (d.duration_h ?? 0) * 60 + (d.duration_m ?? 0);
}
/** `2 Hours`, `1 Hour 30 Mins`, `45 Mins` — the view label. */
export function fmtDuration(min: number | null | undefined): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${h === 1 ? 'Hour' : 'Hours'}`);
  if (m || !h) parts.push(`${m} Mins`);
  return parts.join(' ');
}

export type ClassErrors = Record<string, string>;

/** Save rules: title + date only. */
export function validateClassDraft(d: ClassDraft, existing?: ClassRecord | null): ClassErrors {
  const e: ClassErrors = {};
  if (!d.title.trim()) e.title = 'Title is required — please enter a class name';
  else if (d.title.length > CLASS_TITLE_MAX) e.title = `Class Name is limited to ${CLASS_TITLE_MAX} characters`;
  if (!d.occurred_at) e.occurred_at = 'Please enter the class date and time';
  else {
    const t = new Date(d.occurred_at).getTime();
    if (t > Date.now() + 365 * 86400000) e.occurred_at = "The class date can't be more than 1 year from now";
    if (t < Date.now() - 20 * 365 * 86400000) e.occurred_at = "The class date can't be less than 20 years ago";
  }
  if (d.location.length > CLASS_TEXT_MAX) e.location = `Location Name is limited to ${CLASS_TEXT_MAX} characters`;
  if (d.instructor.length > CLASS_TEXT_MAX) e.instructor = `Instructor is limited to ${CLASS_TEXT_MAX} characters`;
  if (d.duration_m != null && (d.duration_m < 0 || d.duration_m > 59)) e.duration = 'Minutes must be between 0 and 59';
  if (d.duration_h != null && d.duration_h < 0) e.duration = 'Hours cannot be negative';
  if (existing?.notes?.trim() && !d.notes.trim()) e.notes = 'Notes cannot be cleared once saved — type N/A if no notes were taken';
  return e;
}
/** Submit rules: notes are required to mark the class record as complete. */
export function validateClassSubmit(d: ClassDraft, existing?: ClassRecord | null): ClassErrors {
  const e = validateClassDraft(d, existing);
  if (!d.notes.trim()) e.notes = 'Notes are required to mark the training class record as complete.';
  return e;
}
export function describeClassErrors(e: ClassErrors): string[] {
  const names: Record<string, string> = { title: 'Class Name', occurred_at: 'Date & Time', location: 'Location Name', instructor: 'Instructor', duration: 'Duration (Hours:Mins)', notes: 'Notes' };
  return Object.entries(e).map(([k, msg]) => (names[k] ? `${names[k]}: ${msg}` : msg));
}

export function classTitle(r: Pick<ClassRecord, 'title'>): string {
  return r.title?.trim() || 'Class';
}

export function toClassRecord(draft: ClassDraft, base: { id: string; owner_user_id: string }, mode: 'draft' | 'submit', existing?: ClassRecord | null): Partial<ClassRecord> & { id: string } {
  const now = new Date().toISOString();
  const submitted = mode === 'submit';
  const wasReviewed = !!existing && existing.review !== 'not_reviewed';
  return {
    id: base.id, owner_user_id: base.owner_user_id,
    title: draft.title.trim(), location: draft.location.trim(), instructor: draft.instructor.trim(),
    occurred_at: draft.occurred_at!, tz: draft.tz, duration_min: durationMinutes(draft), notes: draft.notes, files: draft.files,
    submitted_at: submitted ? now : existing?.submitted_at ?? null,
    is_complete: submitted || (!!existing?.is_complete && !!draft.notes.trim()),
    // a re-save after review/rejection goes back to Not Reviewed for re-review
    review: submitted || wasReviewed ? 'not_reviewed' : existing?.review ?? 'not_reviewed',
    reviewed_by: submitted || wasReviewed ? null : existing?.reviewed_by ?? null,
    reviewed_at: submitted || wasReviewed ? null : existing?.reviewed_at ?? null,
    rejection_reason: submitted || wasReviewed ? null : existing?.rejection_reason ?? null,
  };
}
