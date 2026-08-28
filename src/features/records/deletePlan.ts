// What "Delete" actually removes for a training record (PT-REC-17).
//
// The shared-exercise rule from the parity dossier: an Exercise is written once per event and read by
// every invitee; a Completion belongs to one handler. **Deleting a Completion or an Exercise must never
// cascade into another handler's Completions.** So a plain invitee who deletes her row of a shared
// group exercise removes HER completions and nothing else — the exercise stays for everyone else, and
// it simply disappears from her own Records (`removed_for`).
//
// The exercise / event itself is destroyed only when the actor may do so (leader, event owner or the
// exercise's creator) AND no other handler has anything saved against it.
import type { Completion, Exercise, TrainingEvent, User } from '@/db/types';

export interface DeletePlan {
  /** Completions of the acting user to hard-delete. */
  completionIds: string[];
  /** Exercises nobody else has completions for — safe to hard-delete. */
  exerciseIds: string[];
  /** Exercises other handlers still use — hidden from the acting user only (`removed_for`). */
  hideExerciseIds: string[];
  /** The event, when the whole record is being deleted and nobody else has anything saved. */
  eventId: string | null;
  /** The event, hidden from the acting user only. */
  hideEventId: string | null;
  /** Names of the other handlers whose rows survive (for the confirm copy). */
  otherHandlers: string[];
  /** True when something of someone else's is at stake — drives the confirm wording. */
  shared: boolean;
  /** True when the exercise/event is destroyed outright. */
  destroys: boolean;
}

export function planTrainingDelete(input: {
  userId: string;
  event: TrainingEvent;
  /** Exercises of this event. */
  exercises: Exercise[];
  /** Completions of this event. */
  completions: Completion[];
  users: User[];
  /** The exercise the row belongs to; null = the whole record's ⋯ menu. */
  exerciseId: string | null;
}): DeletePlan {
  const { userId, event, users, exerciseId } = input;
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name || 'another handler';
  const isLeaderOrOwner = event.owner_user_id === userId || event.invitees.some((i) => i.user_id === userId && i.is_leader);

  const scope = exerciseId ? input.exercises.filter((e) => e.id === exerciseId) : input.exercises;
  const scopeIds = new Set(scope.map((e) => e.id));
  const inScope = input.completions.filter((c) => scopeIds.has(c.exercise_id));
  const mine = inScope.filter((c) => c.handler_id === userId);
  const others = inScope.filter((c) => c.handler_id !== userId);
  const otherHandlers = [...new Set(others.map((c) => c.handler_id))].map(nameOf);
  const otherInvitees = event.invitees.filter((i) => i.user_id !== userId).length;

  const plan: DeletePlan = {
    completionIds: mine.map((c) => c.id),
    exerciseIds: [], hideExerciseIds: [], eventId: null, hideEventId: null,
    otherHandlers, shared: otherHandlers.length > 0 || otherInvitees > 0, destroys: false,
  };

  // The one place a shared record may be destroyed: the actor owns/leads it and nobody else saved anything.
  const mayDestroy = (ex?: Exercise) =>
    (isLeaderOrOwner || (!!ex && (ex.created_by === userId || ex.owner_user_id === userId))) && others.length === 0;

  for (const ex of scope) {
    if (mayDestroy(ex)) plan.exerciseIds.push(ex.id);
    else plan.hideExerciseIds.push(ex.id);
  }
  if (!exerciseId) {
    if (isLeaderOrOwner && others.length === 0) plan.eventId = event.id;
    else plan.hideEventId = event.id;
  }
  plan.destroys = plan.exerciseIds.length > 0 || plan.eventId !== null;
  return plan;
}

/** Confirm-dialog body for a training delete — says exactly what survives. */
export function deletePlanBody(plan: DeletePlan, what: 'exercise' | 'record'): string {
  const noun = what === 'exercise' ? 'exercise' : 'training record';
  if (!plan.destroys) {
    const who = plan.otherHandlers.length
      ? `${plan.otherHandlers.slice(0, 3).join(', ')}${plan.otherHandlers.length > 3 ? ` and ${plan.otherHandlers.length - 3} more` : ''}`
      : 'the other handlers';
    const mine = plan.completionIds.length
      ? `Only your completion${plan.completionIds.length === 1 ? '' : 's'} ${plan.completionIds.length === 1 ? 'is' : 'are'} removed`
      : 'Nothing of anyone else’s is removed';
    return `${mine}; the shared ${noun} stays for other handlers (${who}). It disappears from your Records and the deletion is logged to History.`;
  }
  if (plan.shared) {
    return `No other handler has saved anything here, so the ${noun} is removed for the whole group. The deletion is logged to History and cannot be undone from here.`;
  }
  return `The ${noun}${plan.completionIds.length ? ' and your completions of it' : ''} are removed. The deletion is logged to History and cannot be undone from here.`;
}
