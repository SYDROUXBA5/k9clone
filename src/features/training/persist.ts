// Persistence for a whole training record through the Repository (History rows come for free).
// Shared by the Training Record screen and Solo Quick Training.
import type { Repository } from '@/db/repository';
import type { Completion, Exercise, Notification, TrainingEvent } from '@/db/types';
import { nowISO } from '@/db/util';
import { detailsFingerprint, type CompletionDraft, type EventDraft, type ExerciseDraft } from './logic';

export interface SaveInput {
  me: string;
  event: EventDraft;
  exercises: ExerciseDraft[];
  removedExerciseIds: string[];
  /** completions to write, keyed by exercise localKey */
  completions: Array<{ exerciseKey: string; draft: CompletionDraft }>;
  /** label for History rows */
  label?: string;
}
export interface SaveResult { eventId: string; exerciseIds: Record<string, string>; completionIds: Record<string, string>; bumped: string[] }

export async function saveTrainingRecord(repo: Repository, input: SaveInput): Promise<SaveResult> {
  const { me, event, exercises, completions } = input;
  const now = nowISO();
  const label = input.label || event.name || 'Training event';

  // 1. event
  const { id: evId, ...evFields } = event;
  const savedEvent = await repo.upsert('training_event', { ...(evId ? { id: evId } : {}), ...evFields, owner_user_id: evId ? undefined : me } as Partial<TrainingEvent>, { label });
  const eventId = savedEvent.id;

  // remembered location
  const loc = event.location;
  if (loc && loc.name && loc.name.trim()) {
    const existing = (await repo.list('location', (l) => l.owner_user_id === me && l.name.toLowerCase() === loc.name.trim().toLowerCase()))[0];
    if (existing) await repo.upsert('location', { id: existing.id, address: loc.address || existing.address, postal_code: loc.postal_code || existing.postal_code, lat: loc.lat ?? existing.lat, lng: loc.lng ?? existing.lng, use_count: (existing.use_count || 0) + 1, last_used_at: now }, { silent: true });
    else await repo.upsert('location', { owner_user_id: me, name: loc.name.trim(), address: loc.address || '', postal_code: loc.postal_code || '', lat: loc.lat ?? null, lng: loc.lng ?? null, use_count: 1, last_used_at: now }, { silent: true });
  }

  // 2. removed exercises (and their completions)
  for (const xid of input.removedExerciseIds) {
    const cps = await repo.list('completion', (c) => c.exercise_id === xid);
    for (const c of cps) await repo.remove('completion', c.id, { label: 'Completion' });
    const x = await repo.get('exercise', xid);
    await repo.remove('exercise', xid, { label: x?.name || 'Exercise' });
  }

  // 3. exercises — bump version when shared details change after completions exist
  const exerciseIds: Record<string, string> = {};
  const bumped: string[] = [];
  const versionByKey: Record<string, number> = {};
  const savingCompletionIds = new Set(completions.map((c) => c.draft.id).filter(Boolean) as string[]);
  for (const x of exercises) {
    const { isNew, localKey, ...fields } = x;
    let version = x.version || 1;
    let changed = false;
    if (!isNew) {
      const before = await repo.get('exercise', x.id);
      if (before && detailsFingerprint(before) !== detailsFingerprint(x)) {
        changed = true;
        const existing = await repo.list('completion', (c) => c.exercise_id === x.id && !!c.saved_at);
        if (existing.length) {
          version = (before.version || 1) + 1;
          bumped.push(x.id);
        }
      }
    }
    const row: Partial<Exercise> = { ...fields, id: x.id, event_id: eventId, version, owner_user_id: isNew ? me : undefined, created_by: x.created_by || me };
    if (isNew || changed || !(await repo.get('exercise', x.id))) await repo.upsert('exercise', row, { label: x.name || (x.kind === 'detection' ? 'Detection Exercise' : 'Patrol Exercise') });
    exerciseIds[localKey] = x.id;
    versionByKey[localKey] = version;
    if (changed && version > (x.version || 1)) {
      // mark every saved completion (not being re-saved right now) outdated; keep exercise_version_seen
      const cps = await repo.list('completion', (c) => c.exercise_id === x.id && !!c.saved_at && !savingCompletionIds.has(c.id));
      const editor = (await repo.get('user', me))?.name || 'A group leader';
      const exName = x.name || (x.kind === 'detection' ? 'Detection Exercise' : 'Patrol Exercise');
      for (const c of cps) {
        await repo.upsert('completion', { id: c.id, is_outdated: true }, { label: 'Completion outdated — exercise details changed' });
        // The affected handler is told in-app (E6: email only when Supabase + Resend exist).
        if (c.handler_id && c.handler_id !== me) {
          await repo.upsert('notification', {
            owner_user_id: c.handler_id, // the row belongs to the handler being told, not to the editor
            user_id: c.handler_id,
            type: 'record_update',
            title: 'Exercise details changed — your completion is outdated',
            body: `${editor} modified the details of ${exName} after you saved this completion record. Review the Details tab and save again to confirm you agree with the changes.`,
            read: false,
            link: `/records/training/${eventId}`,
          } as Partial<Notification>, { silent: true });
        }
      }
    }
  }

  // 4. completions
  const completionIds: Record<string, string> = {};
  for (const { exerciseKey, draft } of completions) {
    const exerciseId = exerciseIds[exerciseKey];
    if (!exerciseId) continue;
    const { id, dirty, updated_at_seen, ...fields } = draft;
    void dirty; void updated_at_seen;
    const row: Partial<Completion> = {
      ...(id ? { id } : {}),
      ...fields,
      event_id: eventId,
      exercise_id: exerciseId,
      owner_user_id: id ? undefined : draft.handler_id,
      review: 'not_reviewed',
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
      is_outdated: false,
      exercise_version_seen: versionByKey[exerciseKey] || 1,
      is_complete: true,
      saved_at: now,
    };
    const saved = await repo.upsert('completion', row, { label: `Completion — ${label}` });
    completionIds[`${exerciseKey}:${draft.dog_id}`] = saved.id;
    // documents attached before the completion had an id
    for (const docId of draft.files || []) {
      const d = await repo.get('document', docId);
      if (d && d.owner_id === 'pending') await repo.upsert('document', { id: d.id, owner_id: saved.id }, { silent: true });
    }
  }
  for (const docId of event.files || []) {
    const d = await repo.get('document', docId);
    if (d && d.owner_id === 'pending') await repo.upsert('document', { id: d.id, owner_id: eventId }, { silent: true });
  }
  return { eventId, exerciseIds, completionIds, bumped };
}

/** Delete a whole training record (asks first in the UI; every removal lands in History). */
export async function deleteTrainingRecord(repo: Repository, eventId: string): Promise<void> {
  const cps = await repo.list('completion', (c) => c.event_id === eventId);
  for (const c of cps) await repo.remove('completion', c.id, { label: 'Completion' });
  const xs = await repo.list('exercise', (x) => x.event_id === eventId);
  for (const x of xs) await repo.remove('exercise', x.id, { label: x.name || 'Exercise' });
  const ev = await repo.get('training_event', eventId);
  await repo.remove('training_event', eventId, { label: ev?.name || 'Training event' });
}
