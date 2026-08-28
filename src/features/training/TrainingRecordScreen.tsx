// Training Record — /records/training/[id] ('new' creates). Desktop: left pane (EVENT card → EXERCISES list →
// + Exercise) + right pane (selected item: Event form, or an exercise with tabs Details | one per dog) with
// Cancel / Save. Phone: the same panes stacked — a picker row (Event · Exercise 1 · …) above the same content.
// One Save persists event + exercises + the signed-in handler's completions; shared-detail edits bump the
// exercise version and mark other completions Outdated. New records pre-fill from the handler's last record.
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useList, useRecord, useRepo } from '@/db/provider';
import type { Dog, TrainingEvent, User } from '@/db/types';
import { COMMENTS_MAX } from '@/db/vocab';
import { useAuth } from '@/features/auth/AuthProvider';
import { RoleClosed, canAuthorRecords } from '@/features/nav/RoleGuard';
import { useSeatGate } from '@/features/billing/useSeatGate';
import { Badge, Banner, Button, Card, ConfirmDialog, EmptyState, Muted, Row, Screen, Segmented, Select, StatusPill, Text, TextField, fmtDate, fmtDateTime, fmtDuration, space, useColors, useIsDesktop, useToast, radius } from '@/ui';
import { CompletionForm } from './CompletionForm';
import { EventForm } from './EventForm';
import { EventReadView } from './EventReadView';
import { ExerciseDetails } from './ExerciseDetails';
import {
  completionStatus, completionToDraft, eventCompletionLabel, eventToDraft, exerciseAppliesToDog, exerciseDisplayName, exerciseErrorSummary, exerciseToDraft,
  exerciseTypeLabel, newCompletionDraft, newEventDraft, newExerciseDraft, prefillFromPrevious, validateCompletion, validateEvent, validateExercise,
  type CompletionDraft, type CompletionErrors, type EventDraft, type EventErrors, type ExerciseDraft, type ExerciseErrors,
} from './logic';
import { deleteTrainingRecord, saveTrainingRecord } from './persist';

type Selection = { kind: 'event' } | { kind: 'exercise'; key: string; tab: string /* 'details' | dogId */ };
const cKey = (exKey: string, dogId: string) => `${exKey}:${dogId}`;

export function TrainingRecordScreen() {
  const { id, view } = useLocalSearchParams<{ id: string; view?: string }>();
  const isNew = !id || id === 'new';
  const event = useRecord('training_event', isNew ? null : id);
  const { user, role } = useAuth();
  if (!user) return null;
  // A blank capture form is useless to a role that may never save one — a supervisor reviews, it does
  // not author (PT-ROLE). Say so, the way /vaccines already does for a handler, instead of rendering a
  // form whose only control is Cancel. Existing records still open read-only for review.
  if (isNew && !canAuthorRecords(role)) return <RoleClosed title="Add Training Record" />;
  if (!isNew && (!event || event.deleted_at)) {
    return (
      <Screen title="Training Record" testID="screen-training-missing">
        <EmptyState title="Training record not found" body="It may have been deleted. Deleted records stay in History." />
      </Screen>
    );
  }
  if (event && view === '1') return <TrainingEventReadScreen event={event} />;
  return <TrainingRecordForm key={event?.id || 'new'} event={event} me={user} />;
}

/** EVT-13 — the opened event, read only. `?view=1` on the same route; `Edit training` returns to the editor. */
function TrainingEventReadScreen({ event }: { event: TrainingEvent }) {
  const router = useRouter();
  const desktop = useIsDesktop();
  const users = useList('user');
  const creator = users.find((u) => u.id === event.owner_user_id);
  const actions = (
    <Row wrap>
      <Button title="Back to records" variant="secondary" onPress={() => router.replace('/records' as never)} testID="btn-read-back" />
      <Button title="Edit training" icon="create-outline" onPress={() => router.replace(`/records/training/${event.id}` as never)} testID="btn-read-edit" />
    </Row>
  );
  return (
    <Screen
      title={event.name || 'Training event'}
      subtitle={`CREATED BY ${creator?.name || '—'}, ${fmtDateTime(event.created_at, event.tz)}`}
      testID="screen-training-event-read"
      actions={desktop ? actions : undefined}
    >
      {desktop ? null : <View style={{ marginBottom: space.md }}>{actions}</View>}
      <EventReadView event={event} users={users} />
    </Screen>
  );
}

function TrainingRecordForm({ event, me }: { event: TrainingEvent | undefined; me: User }) {
  // `?exercise=&dog=` deep-links straight to one dog's completion — U8 sends the handler here after a
  // GPS track is attached, so the record opens on the tab the track just filled rather than on the
  // event's first exercise, where the map they came to see is not shown.
  const { exercise: exerciseParam, dog: dogParam } = useLocalSearchParams<{ exercise?: string; dog?: string }>();
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const desktop = useIsDesktop();
  const { role } = useAuth();
  const isNew = !event;

  const users = useList('user');
  const allDogs = useList('dog', (d) => !d.deleted_at);
  const storedExercises = useList('exercise', (x) => !!event && x.event_id === event.id && !x.deleted_at);
  const storedCompletions = useList('completion', (x) => !!event && x.event_id === event.id && !x.deleted_at);
  const groups = useList('training_group', (g) => g.leaders.includes(me.id) || g.members.includes(me.id) || g.leader_id === me.id);
  const myEvents = useList('training_event', (e) => e.owner_user_id === me.id && !e.deleted_at);
  const myExercises = useList('exercise', (x) => x.owner_user_id === me.id && !x.deleted_at);

  // ---- initial drafts (once; the component is keyed by event id) ----
  const [init] = useState(() => {
    if (event) {
      const xs = repo.snapshot('exercise').filter((x) => x.event_id === event.id && !x.deleted_at).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      const cps = repo.snapshot('completion').filter((x) => x.event_id === event.id && !x.deleted_at);
      const comp: Record<string, CompletionDraft> = {};
      for (const cp of cps) comp[cKey(cp.exercise_id, cp.dog_id)] = completionToDraft(cp);
      return { event: eventToDraft(event), exercises: xs.map(exerciseToDraft), completions: comp, prefilledFrom: null as string | null };
    }
    // auto-populate from the handler's most recent training record
    const prev = repo.snapshot('training_event').filter((e) => e.owner_user_id === me.id && !e.deleted_at && new Date(e.starts_at).getTime() <= Date.now()).sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1))[0];
    if (prev) {
      const prevX = repo.snapshot('exercise').filter((x) => x.event_id === prev.id && !x.deleted_at).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      const p = prefillFromPrevious(prev, prevX, me);
      return { event: p.event, exercises: p.exercises, completions: {} as Record<string, CompletionDraft>, prefilledFrom: prev.starts_at };
    }
    return { event: newEventDraft(me), exercises: [] as ExerciseDraft[], completions: {} as Record<string, CompletionDraft>, prefilledFrom: null as string | null };
  });
  const [ev, setEv] = useState<EventDraft>(init.event);
  const [exercises, setExercises] = useState<ExerciseDraft[]>(init.exercises);
  const [completions, setCompletions] = useState<Record<string, CompletionDraft>>(init.completions);
  const [removed, setRemoved] = useState<string[]>([]);
  const [prefilledFrom, setPrefilledFrom] = useState<string | null>(init.prefilledFrom);
  const [selection, setSelection] = useState<Selection>(() => {
    const asked = exerciseParam ? init.exercises.find((x) => x.id === exerciseParam) : null;
    if (asked) return { kind: 'exercise', key: asked.localKey, tab: dogParam || 'details' };
    return init.exercises.length && !isNew ? { kind: 'exercise', key: init.exercises[0].localKey, tab: 'details' } : { kind: 'event' };
  });
  const [dirty, setDirty] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [eventErrors, setEventErrors] = useState<EventErrors>({});
  const [exErrors, setExErrors] = useState<Record<string, ExerciseErrors>>({});
  const [cpErrors, setCpErrors] = useState<Record<string, CompletionErrors>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveEx, setConfirmRemoveEx] = useState<string | null>(null);
  const [eventMode, setEventMode] = useState<'new' | 'existing'>('new');
  const storedSig = `${storedExercises.map((x) => x.id).join(',')}|${storedCompletions.map((x) => `${x.id}:${x.updated_at}`).join(',')}`;
  const [seenStored, setSeenStored] = useState(storedSig);

  // Merge in rows written after we mounted (another handler's completion, a supervisor's review) — never clobber dirty drafts.
  if (seenStored !== storedSig) {
    setSeenStored(storedSig);
    setExercises((prev) => {
      const known = new Set(prev.map((x) => x.id));
      const extra = storedExercises.filter((x) => !known.has(x.id) && !removed.includes(x.id)).map(exerciseToDraft);
      return extra.length ? [...prev, ...extra] : prev;
    });
    setCompletions((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const cp of storedCompletions) { const k = cKey(cp.exercise_id, cp.dog_id); if (!next[k] || (!next[k].dirty && next[k].updated_at_seen !== cp.updated_at)) { next[k] = completionToDraft(cp); changed = true; } }
      return changed ? next : prev;
    });
  }

  // ---- permissions (bar §4 / EVT-14) ----
  const isSupervisor = role === 'supervisor';
  // Seat gate (U7 / DECISIONS E19+E27): role and ownership stay this screen's business — every role is passed as
  // "may edit" so the hook contributes ONLY its seat verdict, which by design applies to handlers alone.
  const gate = useSeatGate({ editableBy: ['handler', 'trainer', 'supervisor', 'billing_manager'] });
  const seatLocked = gate.readOnly;
  const myInvite = ev.invitees.find((i) => i.user_id === me.id);
  const canEditEvent = !seatLocked && !isSupervisor && (isNew || (event?.owner_user_id === me.id) || !!myInvite?.is_leader);
  const canEditCompletion = (cp: CompletionDraft) => !seatLocked && !isSupervisor && cp.handler_id === me.id;

  // ---- dogs at the event ----
  const inviteeIds = ev.invitees.map((i) => i.user_id);
  const memberIds = [...new Set([...(event ? [event.owner_user_id] : [me.id]), ...inviteeIds])];
  const eventDay = ev.starts_at ? ev.starts_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const dogsAtEvent = allDogs.filter((d) => memberIds.includes(d.owner_user_id) && (!d.date_retired || d.date_retired >= eventDay || Object.keys(completions).some((k) => k.endsWith(`:${d.id}`))));
  const dogOwners: Record<string, User | undefined> = Object.fromEntries(dogsAtEvent.map((d) => [d.owner_user_id, users.find((u) => u.id === d.owner_user_id)]));
  const dogsForExercise = (x: ExerciseDraft): Dog[] => dogsAtEvent.filter((d) => exerciseAppliesToDog(x, d) || !!completions[cKey(x.localKey, d.id)]);
  const monitors = [...new Set(memberIds.map((id) => users.find((u) => u.id === id)?.name).filter(Boolean) as string[])];

  const markDirty = () => { if (!dirty) setDirty(true); setSaveError(null); };
  const updateEvent = (d: EventDraft) => { setEv(d); markDirty(); };
  const updateExercise = (key: string, d: ExerciseDraft) => { setExercises((prev) => prev.map((x) => (x.localKey === key ? d : x))); markDirty(); };
  const updateCompletion = (key: string, d: CompletionDraft) => { setCompletions((prev) => ({ ...prev, [key]: d })); markDirty(); };
  const getCompletion = (x: ExerciseDraft, dog: Dog): CompletionDraft => completions[cKey(x.localKey, dog.id)] || newCompletionDraft(dog, dog.owner_user_id, x, ev.tz);
  /** Opening one of MY dog tabs materialises the completion draft so a plain Save records it (performed = yes by
   *  default, like the vendor's pre-ticked box); an outdated or rejected completion becomes dirty so re-saving = agreement. */
  const openTab = (x: ExerciseDraft, tab: string) => {
    setSelection({ kind: 'exercise', key: x.localKey, tab });
    if (tab === 'details') return;
    const dog = allDogs.find((d) => d.id === tab);
    if (!dog) return;
    const key = cKey(x.localKey, dog.id);
    const existing = completions[key];
    if (!existing) {
      const draft = newCompletionDraft(dog, dog.owner_user_id, x, ev.tz);
      if (canEditCompletion(draft)) { setCompletions((prev) => ({ ...prev, [key]: { ...draft, dirty: true } })); markDirty(); }
    } else if ((existing.is_outdated || existing.review === 'rejected') && !existing.dirty && canEditCompletion(existing)) {
      setCompletions((prev) => ({ ...prev, [key]: { ...existing, dirty: true } }));
      markDirty();
    }
  };

  /** Gold `Next` on the New Event step: go to the exercise pane, adding the first exercise if there is none. */
  const goNext = () => {
    const ee = validateEvent(ev);
    setEventErrors(ee);
    if (Object.keys(ee).length) { toast.show(Object.values(ee)[0]!, 'error'); return; }
    if (!exercises.length) { addExercise(); return; }
    setSelection({ kind: 'exercise', key: exercises[0].localKey, tab: 'details' });
  };

  const addExercise = () => {
    // remembers the discipline used most often
    const det = myExercises.filter((x) => x.kind === 'detection').length;
    const pat = myExercises.filter((x) => x.kind === 'patrol').length;
    const x = newExerciseDraft(me.id, pat > det ? 'patrol' : 'detection');
    setExercises((prev) => [...prev, x]);
    setSelection({ kind: 'exercise', key: x.localKey, tab: 'details' });
    markDirty();
  };
  const removeExercise = (key: string) => {
    const x = exercises.find((e) => e.localKey === key);
    if (!x) return;
    if (!x.isNew) setRemoved((r) => [...r, x.id]);
    setExercises((prev) => prev.filter((e) => e.localKey !== key));
    setCompletions((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${key}:`))));
    setSelection({ kind: 'event' });
    setConfirmRemoveEx(null);
    markDirty();
  };
  const clearPrefill = () => {
    setEv(newEventDraft(me));
    setExercises([]);
    setCompletions({});
    setPrefilledFrom(null);
    setSelection({ kind: 'event' });
    setDirty(true);
    toast.show('Form cleared', 'info');
  };

  const save = async () => {
    setSaveError(null);
    // Defence in depth: the Save controls are removed from the DOM when the seat is locked, but a stale
    // handler or a keyboard shortcut must not slip a write past the banner (the pass-1 defect).
    if (seatLocked) { toast.show(gate.reason, 'error'); return; }
    // validation — names the first missing field and jumps to it
    const ee = validateEvent(ev);
    setEventErrors(ee);
    if (Object.keys(ee).length) { setSelection({ kind: 'event' }); toast.show(Object.values(ee)[0]!, 'error'); return; }
    const xe: Record<string, ExerciseErrors> = {};
    for (const x of exercises) { const e = validateExercise(x); if (Object.keys(e).length) xe[x.localKey] = e; }
    setExErrors(xe);
    const firstX = Object.keys(xe)[0];
    if (firstX) { setSelection({ kind: 'exercise', key: firstX, tab: 'details' }); toast.show(exerciseErrorSummary(xe[firstX]) || 'Check the exercise details.', 'error'); return; }
    const toSave: Array<{ exerciseKey: string; draft: CompletionDraft }> = [];
    const ce: Record<string, CompletionErrors> = {};
    for (const [k, cp] of Object.entries(completions)) {
      if (!cp.dirty || !canEditCompletion(cp)) continue;
      const exKey = k.slice(0, k.lastIndexOf(':'));
      if (!exercises.some((x) => x.localKey === exKey)) continue;
      const e = validateCompletion(cp, COMMENTS_MAX);
      if (Object.keys(e).length) { ce[k] = e; setSelection({ kind: 'exercise', key: exKey, tab: cp.dog_id }); setCpErrors(ce); toast.show(Object.values(e)[0]!, 'error'); return; }
      toSave.push({ exerciseKey: exKey, draft: cp });
    }
    setCpErrors({});
    setSaving(true);
    try {
      const res = await saveTrainingRecord(repo, {
        me: me.id,
        event: canEditEvent ? ev : ev, // read-only viewers still save their own completions; event fields unchanged
        exercises: canEditEvent ? exercises : exercises.filter((x) => !x.isNew),
        removedExerciseIds: canEditEvent ? removed : [],
        completions: toSave,
        label: ev.name || `Training ${fmtDate(ev.starts_at, ev.tz)}`,
      });
      // reflect saved ids / versions in the drafts
      setExercises((prev) => prev.map((x) => ({ ...x, isNew: false, version: res.bumped.includes(x.id) ? x.version + 1 : x.version })));
      setCompletions((prev) => {
        const next = { ...prev };
        for (const { exerciseKey, draft } of toSave) {
          const k = cKey(exerciseKey, draft.dog_id);
          next[k] = { ...draft, id: res.completionIds[k] || draft.id, dirty: false, review: 'not_reviewed', reviewed_by: null, reviewed_at: null, rejection_reason: null, is_outdated: false, is_complete: true, saved_at: draft.saved_at || new Date().toISOString() };
        }
        return next;
      });
      setRemoved([]);
      setDirty(false);
      setPrefilledFrom(null);
      const n = toSave.length;
      toast.show(`Saved${n ? ` — ${n} completion${n > 1 ? 's' : ''} sent for review` : ''}${res.bumped.length ? ` · ${res.bumped.length} exercise${res.bumped.length > 1 ? 's' : ''} changed: other completions marked Outdated` : ''}`);
      if (isNew) router.replace(`/records/training/${res.eventId}` as never);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveError(msg);
      toast.show(`Save failed — ${msg}. Your changes are still on screen.`, 'error', { title: 'Retry', onPress: () => void save() });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    setConfirmDelete(false);
    await deleteTrainingRecord(repo, event.id);
    toast.show('Training record deleted — logged to History');
    router.replace('/records' as never);
  };
  const cancel = () => { if (router.canGoBack()) router.back(); else router.replace('/records' as never); };

  // ---- derived for the left pane ----
  // Pill counts MY dogs' completions; a viewer without dogs here (supervisor / trainer) sees the whole event's progress.
  const ownDogIds = dogsAtEvent.filter((d) => d.owner_user_id === me.id).map((d) => d.id);
  const myDogIdsAtEvent = ownDogIds.length ? ownDogIds : dogsAtEvent.map((d) => d.id);
  const totalMine = exercises.reduce((n, x) => n + dogsForExercise(x).filter((d) => myDogIdsAtEvent.includes(d.id)).length, 0);
  const doneMine = exercises.reduce((n, x) => n + dogsForExercise(x).filter((d) => myDogIdsAtEvent.includes(d.id) && completions[cKey(x.localKey, d.id)]?.saved_at).length, 0);
  const pill = eventCompletionLabel(totalMine, doneMine);
  const anyOutdated = Object.values(completions).some((cp) => cp.is_outdated);
  const anyRejected = Object.values(completions).some((cp) => cp.review === 'rejected');

  const statusGlyph = (cp: CompletionDraft | undefined) => {
    const s = completionStatus(cp);
    if (s === 'complete') return <Ionicons name="checkmark-circle" size={20} color={c.success} />;
    if (s === 'rejected') return <Ionicons name="alert-circle" size={20} color={c.danger} />;
    if (s === 'outdated') return <Ionicons name="time" size={20} color={c.warning} />;
    return <Ionicons name="ellipse-outline" size={20} color={c.muted} />;
  };

  const leftPane = (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel="Event" accessibilityState={{ selected: selection.kind === 'event' }} testID="pane-event" onPress={() => setSelection({ kind: 'event' })} style={[{ borderWidth: 1, borderColor: selection.kind === 'event' ? c.primary : c.border, borderLeftWidth: 4, borderLeftColor: c.primary, borderRadius: radius.md, backgroundColor: c.surface, padding: space.md, marginBottom: space.md }]}>
        <Muted>EVENT</Muted>
        <Text variant="bodyStrong" numberOfLines={1}>{ev.name || (isNew ? 'New training event' : 'Training event')}</Text>
        <Text>{ev.starts_at ? fmtDateTime(ev.starts_at, ev.tz) : 'Date & time not set'}{ev.duration_min ? ` · ${fmtDuration(ev.duration_min)}` : ''}</Text>
        {ev.location.name ? <Muted numberOfLines={2}>{ev.location.name}{ev.location.address ? ` — ${ev.location.address}` : ''}</Muted> : <Muted>No location</Muted>}
        <Row style={{ marginTop: 6 }} wrap>
          <StatusPill status={pill === 'Complete' ? 'complete' : 'incomplete'} label={pill} testID="pill-event-completion" />
          {anyOutdated ? <StatusPill status="outdated" testID="pill-event-outdated" /> : null}
          {anyRejected ? <StatusPill status="rejected" testID="pill-event-rejected" /> : null}
        </Row>
      </Pressable>
      <Muted style={{ marginBottom: 6 }}>EXERCISES</Muted>
      {exercises.length === 0 ? <Muted style={{ marginBottom: space.sm }} testID="text-no-exercises">No exercises yet.</Muted> : null}
      {exercises.map((x, i) => {
        const dogs = dogsForExercise(x);
        const active = selection.kind === 'exercise' && selection.key === x.localKey;
        return (
          <Pressable key={x.localKey} accessibilityRole="button" accessibilityLabel={exerciseDisplayName(x, i)} accessibilityState={{ selected: active }} testID={`pane-exercise-${i + 1}`} onPress={() => setSelection({ kind: 'exercise', key: x.localKey, tab: active ? selection.tab : 'details' })} style={[{ borderWidth: 1, borderColor: active ? c.primary : c.border, borderRadius: radius.md, backgroundColor: active ? c.primarySoft : c.surface, padding: space.sm, marginBottom: 6 }]}>
            <Row>
              <Ionicons name={x.kind === 'detection' ? 'search-outline' : 'shield-outline'} size={22} color={c.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={1}>{exerciseDisplayName(x, i)}</Text>
                <Muted numberOfLines={1}>{exerciseTypeLabel(x)}{x.isNew ? ' · unsaved' : ''}</Muted>
              </View>
              {dogs.length ? <Row gap={2}>{dogs.map((d) => <View key={d.id} accessibilityLabel={`${d.name}: ${completionStatus(completions[cKey(x.localKey, d.id)])}`}>{statusGlyph(completions[cKey(x.localKey, d.id)])}</View>)}</Row> : null}
            </Row>
          </Pressable>
        );
      })}
      {canEditEvent ? <Button title="+ Exercise" variant="accent" onPress={addExercise} testID="btn-add-exercise" style={{ marginTop: space.sm }} /> : null}
      <Card style={{ marginTop: space.md, backgroundColor: c.surfaceAlt }}>
        <Muted>{selection.kind === 'event' ? 'Event: when, where and who trains together. Only Date & Time is required.' : selection.tab === 'details' ? 'Details describe what will be done and are shared by every handler at the event. Editing them after completions exist marks those completions Outdated.' : 'Dog Completion is per dog and is not shared with other handlers.'}</Muted>
      </Card>
    </View>
  );

  // EXD-13 blind guard: a handler who marked one of their own completions blind cannot read the shared Details
  // (the odor placements) until the event is over. The creator / group leaders who wrote them always see them.
  const eventEndsAt = ev.starts_at ? new Date(new Date(ev.starts_at).getTime() + (ev.duration_min || 60) * 60000) : null;
  const eventOver = !eventEndsAt || eventEndsAt.getTime() <= Date.now();
  const blindLabelFor = (x: ExerciseDraft): string | null => {
    if (canEditEvent || isSupervisor || eventOver || !eventEndsAt) return null;
    const mine = dogsAtEvent.filter((d) => d.owner_user_id === me.id);
    const blind = mine.some((d) => completions[cKey(x.localKey, d.id)]?.is_blind === true);
    return blind ? fmtDateTime(eventEndsAt.toISOString(), ev.tz) : null;
  };

  const selectedExercise = selection.kind === 'exercise' ? exercises.find((x) => x.localKey === selection.key) : undefined;
  const selectedIndex = selectedExercise ? exercises.indexOf(selectedExercise) : -1;
  const rightTitle = selection.kind === 'event' ? (isNew ? 'New Event' : 'Event') : selectedExercise ? exerciseDisplayName(selectedExercise, selectedIndex) : 'Exercise';

  const rightPane = (
    <View>
      {selection.kind === 'event' ? (
        <View>
          {isNew ? (
            <View style={{ marginBottom: space.md }}>
              <Segmented label="Event mode" options={[{ value: 'new', label: 'New Event' }, { value: 'existing', label: 'Existing Event' }]} value={eventMode} onChange={setEventMode} testID="seg-event-mode" />
              {eventMode === 'existing' ? <ExistingEventPicker me={me} onPick={(eid) => router.replace(`/records/training/${eid}` as never)} /> : null}
            </View>
          ) : null}
          {eventMode === 'new' || !isNew ? (
            <>
              <EventTitle name={ev.name} placeholder={isNew ? 'New training event' : 'Training event'} readOnly={!canEditEvent} onChange={(v) => updateEvent({ ...ev, name: v })} />
              <EventForm draft={ev} onChange={updateEvent} readOnly={!canEditEvent} me={me} users={users} groups={groups} errors={eventErrors} showNameField={false} />
              {canEditEvent ? (
                <Row justify="flex-end" style={{ marginTop: space.md }}>
                  <Button title="Next" variant="accent" iconRight="arrow-forward" onPress={goNext} testID="btn-event-next" accessibilityLabel="Next — go to the exercises" />
                </Row>
              ) : null}
            </>
          ) : null}
          {!canEditEvent && !isNew && !seatLocked ? <Banner tone="info" testID="banner-event-readonly" body={isSupervisor ? 'Supervisors review records; they never edit handler data.' : 'Only the event creator and group leaders can modify the event and its exercise details. You can still complete your own dogs’ tabs.'} /> : null}
        </View>
      ) : selectedExercise ? (
        <ExercisePane
          x={selectedExercise}
          index={selectedIndex}
          tab={selection.tab}
          onTab={(t) => openTab(selectedExercise, t)}
          dogs={dogsForExercise(selectedExercise)}
          allDogsAtEvent={dogsAtEvent}
          dogOwners={dogOwners}
          users={users}
          monitors={monitors}
          canEditDetails={canEditEvent}
          seatLocked={seatLocked}
          onChangeDetails={(d) => updateExercise(selectedExercise.localKey, d)}
          onRemove={canEditEvent ? () => setConfirmRemoveEx(selectedExercise.localKey) : undefined}
          getCompletion={(dog) => getCompletion(selectedExercise, dog)}
          onChangeCompletion={(dog, d) => updateCompletion(cKey(selectedExercise.localKey, dog.id), d)}
          canEditCompletion={canEditCompletion}
          eventAt={ev.starts_at}
          eventLat={ev.location.lat}
          eventLng={ev.location.lng}
          errors={exErrors[selectedExercise.localKey] || {}}
          cpErrors={cpErrors}
          me={me}
          blindUntil={blindLabelFor(selectedExercise)}
        />
      ) : <EmptyState title="Pick an exercise" body="Choose an exercise on the left, or add one." />}
    </View>
  );

  const viewEvent = event ? <Button title="View event" variant="ghost" icon="eye-outline" onPress={() => router.push(`/records/training/${event.id}?view=1` as never)} testID="btn-view-event" /> : null;
  const actions = isSupervisor || seatLocked ? (
    <Row>
      {viewEvent}
      <Button title="Close" variant="secondary" onPress={cancel} testID="btn-cancel" />
    </Row>
  ) : (
    <Row>
      {viewEvent}
      <Button title="Cancel" variant="secondary" onPress={cancel} testID="btn-cancel" />
      <Button title={saving ? 'Saving…' : 'Save'} onPress={() => void save()} loading={saving} disabled={!dirty} testID="btn-save-record" />
    </Row>
  );

  const header = (
    <>
      {seatLocked ? (
        <Banner
          tone={gate.isBilling ? 'warning' : 'info'}
          testID="banner-readonly"
          title={gate.isBilling ? 'This record is read-only' : undefined}
          body={gate.reason}
          action={gate.isBilling ? { title: 'Billing', onPress: () => router.push('/billing' as never), testID: 'btn-readonly-billing' } : undefined}
        />
      ) : null}
      {prefilledFrom ? <Banner tone="info" testID="banner-prefilled" title={`Pre-filled from ${fmtDate(prefilledFrom, ev.tz)}`} body="Location, duration, invitees, tags and the exercise scaffold come from your last training record; the date is now. Clear empties everything." action={{ title: 'Clear', onPress: clearPrefill, testID: 'btn-clear-prefill' }} /> : null}
      {saveError ? <Banner tone="danger" title="Save failed" body={`${saveError} — nothing was lost; retry when ready.`} action={{ title: 'Retry', onPress: () => void save(), testID: 'btn-retry-save' }} testID="banner-save-error" /> : null}
    </>
  );

  if (desktop) {
    return (
      <Screen title={isNew ? 'New Training Record' : 'Edit Training'} subtitle={event ? `Created by ${users.find((u) => u.id === event.owner_user_id)?.name || '—'}, ${fmtDateTime(event.created_at, event.tz)}` : undefined} testID="screen-training-record" actions={actions} maxWidth={1400}>
        {header}
        <Row align="flex-start" gap={space.lg}>
          <View style={{ width: 320 }}>{leftPane}</View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Card>
              <Row justify="space-between" style={{ marginBottom: space.md }} wrap>
                <Text variant="h2" testID="text-pane-title">{rightTitle}</Text>
                {actions}
              </Row>
              {rightPane}
              <Row justify="space-between" style={{ marginTop: space.lg }} wrap>
                {event && event.owner_user_id === me.id && !isSupervisor && !seatLocked ? <Button title="Delete record" variant="danger" icon="trash-outline" onPress={() => setConfirmDelete(true)} testID="btn-delete-record" /> : <View />}
                {actions}
              </Row>
            </Card>
          </View>
        </Row>
        {dialogs()}
      </Screen>
    );
  }

  // CMP-14 — on the phone a dog tab is a full-screen completion: the bar reads `Cancel · COMPLETION — <Dog> · Save`.
  const completionDog = selection.kind === 'exercise' && selection.tab !== 'details' ? dogsAtEvent.find((d) => d.id === selection.tab) : undefined;
  if (completionDog) {
    return (
      <Screen testID="screen-training-record" maxWidth={1100}>
        <View testID="bar-completion" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: space.md }}>
          <Button title="Cancel" variant="secondary" onPress={() => setSelection({ kind: 'exercise', key: selection.kind === 'exercise' ? selection.key : '', tab: 'details' })} testID="btn-completion-back" accessibilityLabel="Cancel — back to the exercise details" />
          <Text variant="h3" accessibilityRole="header" testID="text-completion-title" style={{ flex: 1, textAlign: 'center' }}>{`COMPLETION — ${completionDog.name}`}</Text>
          {isSupervisor || seatLocked ? <Button title="Close" variant="secondary" onPress={cancel} testID="btn-cancel" /> : <Button title={saving ? 'Saving…' : 'Save'} onPress={() => void save()} loading={saving} disabled={!dirty} testID="btn-save-record" />}
        </View>
        {header}
        <Card>{rightPane}</Card>
        {dialogs()}
      </Screen>
    );
  }

  return (
    <Screen title={isNew ? 'New Training Record' : 'Edit Training'} testID="screen-training-record" actions={actions}>
      {header}
      {/* Phone: picker row (Event · exercises · +) then the same pane content, then the left-pane list for status */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: space.sm }} style={{ marginBottom: space.sm }}>
        <TabPill label="Event" active={selection.kind === 'event'} onPress={() => setSelection({ kind: 'event' })} testID="tab-event" />
        {exercises.map((x, i) => <TabPill key={x.localKey} label={exerciseDisplayName(x, i)} active={selection.kind === 'exercise' && selection.key === x.localKey} onPress={() => setSelection({ kind: 'exercise', key: x.localKey, tab: selection.kind === 'exercise' && selection.key === x.localKey ? selection.tab : 'details' })} testID={`tab-exercise-${i + 1}`} />)}
        {canEditEvent ? <TabPill label="+ Exercise" active={false} accent onPress={addExercise} testID="btn-add-exercise" /> : null}
      </ScrollView>
      <Card>
        <Row justify="space-between" style={{ marginBottom: space.sm }} wrap>
          <Text variant="h2" testID="text-pane-title">{rightTitle}</Text>
          <StatusPill status={pill === 'Complete' ? 'complete' : 'incomplete'} label={pill} testID="pill-event-completion" />
        </Row>
        {rightPane}
        <Row justify="space-between" style={{ marginTop: space.lg }} wrap>
          {event && event.owner_user_id === me.id && !isSupervisor && !seatLocked ? <Button title="Delete record" variant="danger" icon="trash-outline" onPress={() => setConfirmDelete(true)} testID="btn-delete-record" /> : <View />}
          {actions}
        </Row>
      </Card>
      <View style={{ marginTop: space.lg }}>{leftPane}</View>
      {dialogs()}
    </Screen>
  );

  function dialogs() {
    return (
      <>
        <ConfirmDialog visible={confirmDelete} title="Delete this training record?" body="The event, its exercises and every completion are removed and the deletion is logged to History." onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} testID="dialog-delete-record" />
        <ConfirmDialog visible={!!confirmRemoveEx} title="Remove this exercise?" body="Completions saved for it are removed too when you save. The removal is logged to History." confirmTitle="Remove" onCancel={() => setConfirmRemoveEx(null)} onConfirm={() => confirmRemoveEx && removeExercise(confirmRemoveEx)} testID="dialog-remove-exercise" />
      </>
    );
  }
}

/** EVT-01 — the event name is the pane title, edited in place through the pencil. */
function EventTitle({ name, placeholder, readOnly, onChange }: { name: string; placeholder: string; readOnly?: boolean; onChange: (v: string) => void }) {
  const c = useColors();
  const [editing, setEditing] = useState(false);
  if (editing && !readOnly) {
    return (
      <Row align="flex-end" gap={space.sm} style={{ marginBottom: space.md }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <TextField label="Event name" value={name} onChangeText={onChange} placeholder="e.g. Friday Morning Training" testID="event-name" autoFocus={!!name} help="Optional — shown on the record row and calendar." containerStyle={{ marginBottom: 0 }} />
        </View>
        <Button title="Done" variant="secondary" onPress={() => setEditing(false)} testID="btn-event-name-done" />
      </Row>
    );
  }
  return (
    <Row gap={space.sm} style={{ marginBottom: space.md }}>
      <Text variant="h3" numberOfLines={2} style={{ flex: 1, minWidth: 0 }} testID="text-event-title">{name || placeholder}</Text>
      {!readOnly ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Edit event name" testID="btn-edit-event-name" onPress={() => setEditing(true)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong }}>
          <Ionicons name="pencil" size={20} color={c.primary} />
        </Pressable>
      ) : null}
    </Row>
  );
}

function TabPill({ label, active, onPress, testID, accent, glyph }: { label: string; active: boolean; onPress: () => void; testID: string; accent?: boolean; glyph?: React.ReactNode }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label} testID={testID} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: active ? c.primary : accent ? c.accent : c.borderStrong, backgroundColor: active ? c.primary : accent ? c.accentSoft : c.surface }}>
      {glyph}
      <Text style={{ color: active ? '#fff' : accent ? c.accent : c.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function ExercisePane({ x, index, tab, onTab, dogs, allDogsAtEvent, dogOwners, users, monitors, canEditDetails, seatLocked, onChangeDetails, onRemove, getCompletion, onChangeCompletion, canEditCompletion, eventAt, eventLat, eventLng, errors, cpErrors, me, blindUntil }: {
  x: ExerciseDraft; index: number; tab: string; onTab: (t: string) => void; dogs: Dog[]; allDogsAtEvent: Dog[]; dogOwners: Record<string, User | undefined>; users: User[]; monitors: string[]; canEditDetails: boolean; seatLocked: boolean;
  /** Set when this handler marked the exercise blind and the event has not finished — Details stay hidden until then. */
  blindUntil?: string | null;
  onChangeDetails: (d: ExerciseDraft) => void; onRemove?: () => void; getCompletion: (dog: Dog) => CompletionDraft; onChangeCompletion: (dog: Dog, d: CompletionDraft) => void; canEditCompletion: (cp: CompletionDraft) => boolean;
  eventAt: string; eventLat: number | null; eventLng: number | null; errors: ExerciseErrors; cpErrors: Record<string, CompletionErrors>; me: User;
}) {
  const c = useColors();
  const dog = tab !== 'details' ? dogs.find((d) => d.id === tab) : undefined;
  const glyphFor = (cp: CompletionDraft) => {
    const s = completionStatus(cp);
    if (s === 'complete') return <Ionicons name="checkmark-circle" size={18} color={tab === cp.dog_id ? '#fff' : c.success} />;
    if (s === 'rejected') return <Ionicons name="alert-circle" size={18} color={tab === cp.dog_id ? '#fff' : c.danger} />;
    if (s === 'outdated') return <Ionicons name="time" size={18} color={tab === cp.dog_id ? '#fff' : c.warning} />;
    return null;
  };
  return (
    <View testID={`exercise-pane-${index + 1}`}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: space.sm }} style={{ marginBottom: space.sm }} accessibilityRole="tablist">
        <TabPill label="Details" active={tab === 'details'} onPress={() => onTab('details')} testID="tab-details" />
        {dogs.map((d) => <TabPill key={d.id} label={`${d.name}${dogOwners[d.owner_user_id] && d.owner_user_id !== me.id ? ` · ${dogOwners[d.owner_user_id]!.first_name}` : ''}`} active={tab === d.id} onPress={() => onTab(d.id)} testID={`tab-dog-${d.id}`} glyph={glyphFor(getCompletion(d))} />)}
      </ScrollView>
      {tab === 'details' && blindUntil ? (
        <View testID="details-blind-hidden" style={{ borderWidth: 1, borderColor: c.warning, borderRadius: radius.md, backgroundColor: c.surfaceAlt, padding: space.lg, alignItems: 'center' }}>
          <Ionicons name="eye-off-outline" size={32} color={c.warning} />
          <Text variant="h3" style={{ marginTop: space.sm, textAlign: 'center' }}>Blind exercise — details hidden until the event is over</Text>
          <Muted style={{ textAlign: 'center', marginTop: 6 }}>{`You marked this exercise blind on your dog’s completion, so the odor placements stay hidden from you until the event ends (${blindUntil}). Untick “This was a blind exercise” on the dog tab if it was not blind after all.`}</Muted>
        </View>
      ) : tab === 'details' ? (
        <View>
          {!canEditDetails && !seatLocked ? <Banner tone="info" testID="banner-details-readonly" body="Details are shared by every handler at this event; only the event creator and group leaders can change them." /> : null}
          <ExerciseDetails draft={x} onChange={onChangeDetails} readOnly={!canEditDetails} dogs={dogs.length ? dogs : []} allDogsAtEvent={allDogsAtEvent} dogOwners={dogOwners} monitors={monitors} errors={errors} testID="details" />
          {onRemove ? <Button title="Remove exercise" variant="ghost" icon="trash-outline" onPress={onRemove} testID="btn-remove-exercise" style={{ alignSelf: 'flex-start', marginTop: space.md }} /> : null}
        </View>
      ) : dog ? (
        <CompletionForm
          key={dog.id}
          draft={getCompletion(dog)}
          onChange={(d) => onChangeCompletion(dog, d)}
          exercise={x}
          dog={dog}
          handler={users.find((u) => u.id === dog.owner_user_id)}
          readOnly={!canEditCompletion(getCompletion(dog))}
          eventAt={eventAt}
          eventLat={eventLat}
          eventLng={eventLng}
          errors={cpErrors[cKey(x.localKey, dog.id)] || {}}
          editorName={users.find((u) => u.id === x.created_by)?.name}
          reviewerName={users.find((u) => u.id === getCompletion(dog).reviewed_by)?.name}
          testID={`completion-${dog.id}`}
        />
      ) : (
        <EmptyState title="No dog on this tab" body={dogs.length ? 'Pick a dog tab above.' : 'No dog at this event matches this exercise — check the dogs’ patrol / odor types or the invitees.'} />
      )}
    </View>
  );
}

function ExistingEventPicker({ me, onPick }: { me: User; onPick: (id: string) => void }) {
  const events = useList('training_event', (e) => !e.deleted_at && (e.owner_user_id === me.id || (e.invitees || []).some((i) => i.user_id === me.id)))
    .sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1))
    .slice(0, 40);
  const [picked, setPicked] = useState('');
  return (
    <View style={{ marginTop: space.md }}>
      <Select label="Existing Event" options={events.map((e) => ({ value: e.id, label: `${fmtDateTime(e.starts_at, e.tz)} — ${e.name || 'Training event'}${e.location?.name ? ` · ${e.location.name}` : ''}` }))} value={picked} onChange={setPicked} allowCustom={false} testID="select-existing-event" placeholder="Pick an event you were invited to" help="Attach your exercises and completions to an event already created (e.g. by a trainer)." />
      <Button title="Open event" onPress={() => picked && onPick(picked)} disabled={!picked} testID="btn-open-existing-event" />
    </View>
  );
}

