// SOLO QUICK TRAINING — /quick-training. Mobile only (native, or Developer → "Simulate phone" on web).
// One screen for training alone with one dog at the current location: TRAINING SETTINGS (Location Name, Date &
// Time = now, Duration = 0:15, Dog = default dog, Patrol Type predicted from past activity + "+ PATROL TYPE";
// Detection is offered too — one environment with one odor) → tiles COMPLETE EXERCISE (completion form inline →
// Save) or SAVE FOR LATER (event + exercise saved as Incomplete). Everything is prefilled from the last quick training.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import { ROLE_LABEL, type Dog, type TrainingEvent, type User } from '@/db/types';
import { AMOUNT_UNITS, COMMENTS_MAX, ENVIRONMENT_TYPES, ODOR_CATEGORIES, ODOR_TYPES, PACKAGING_DEFAULTS, PATROL_TYPES } from '@/db/vocab';
import { useAuth } from '@/features/auth/AuthProvider';
import { canAuthorRecords } from '@/features/nav/RoleGuard';
import { useIsPhoneMode } from '@/features/nav/Shell';
import { fetchWeather } from '@/features/weather/openMeteo';
import { Badge, Banner, Button, Card, DateTimeField, EmptyState, Muted, Row, Screen, Segmented, Select, Text, TextField, VocabSelect, fmtDate, space, useColors, useIsDesktop, useToast, radius } from '@/ui';
import { CompletionForm } from './CompletionForm';
import { DurationField } from './EventForm';
import { LocationField } from './LocationField';
import {
  exerciseErrorSummary, exerciseToDraft, newCompletionDraft, newEnvironment, newEventDraft, newExerciseDraft, newOdor, newUnit, predictPatrolType,
  validateCompletion, validateEvent, validateExercise, type CompletionDraft, type EventDraft, type ExerciseDraft,
} from './logic';
import { saveTrainingRecord } from './persist';

/** Quick-training events are ordinary training events named like this so the next one can prefill from them. */
export const QUICK_TRAINING_NAME = 'Solo Quick Training';

export function QuickTrainingScreen() {
  const phone = useIsPhoneMode();
  const { user, role } = useAuth();
  const router = useRouter();
  if (!user) return null;
  if (!phone) {
    return (
      <Screen title="Solo Quick Training" testID="screen-quick-training-web">
        <EmptyState
          icon="phone-portrait-outline"
          title="Solo Quick Training is a phone feature"
          body={canAuthorRecords(role)
            ? 'Train alone with one dog at your current location from the mobile app. On this computer, add a Training Record instead — or turn on Profile → Developer → Simulate phone to try the phone flow here.'
            : `Train alone with one dog at your current location from the mobile app. Training records are written by handlers and trainers, so there is nothing for a ${ROLE_LABEL[role || 'supervisor']} to add here — open a saved record from Records to review it.`}
          // Only offer the button to a role that may actually save one: pointing a supervisor at the
          // capture route would land it on the "not available in this role" screen it is now gated by.
          action={canAuthorRecords(role)
            ? { title: 'Add Training Record', onPress: () => router.push('/records/training/new' as never), testID: 'btn-go-training-record' }
            : { title: 'Go to Records', onPress: () => router.push('/records' as never), testID: 'btn-go-records' }}
        />
      </Screen>
    );
  }
  if (role !== 'handler') {
    return (
      <Screen title="Solo Quick Training" testID="screen-quick-training-role">
        <EmptyState icon="paw-outline" title="Handlers only" body="Solo Quick Training records a training exercise for one of your own dogs. Switch to the Handler role to use it." />
      </Screen>
    );
  }
  return <QuickTrainingForm me={user} />;
}

function QuickTrainingForm({ me }: { me: User }) {
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const desktop = useIsDesktop();
  const dogs = useList('dog', (d) => d.owner_user_id === me.id && !d.deleted_at && !d.date_retired);
  const users = useList('user');

  // ---- prefill from the last quick training (or sensible defaults) ----
  const [init] = useState(() => {
    const prev = repo.snapshot('training_event')
      .filter((e) => e.owner_user_id === me.id && !e.deleted_at && e.name === QUICK_TRAINING_NAME)
      .sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1))[0] as TrainingEvent | undefined;
    const prevX = prev ? repo.snapshot('exercise').filter((x) => x.event_id === prev.id && !x.deleted_at).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0] : undefined;
    const prevC = prevX ? repo.snapshot('completion').filter((x) => x.exercise_id === prevX.id && !x.deleted_at)[0] : undefined;
    const myDogs = repo.snapshot('dog').filter((d) => d.owner_user_id === me.id && !d.deleted_at && !d.date_retired);
    const defaultDog = (prevC && myDogs.find((d) => d.id === prevC.dog_id)) || myDogs.find((d) => d.is_default) || myDogs[0] || null;
    const mine = repo.snapshot('exercise').filter((x) => x.owner_user_id === me.id && !x.deleted_at);
    const predicted = predictPatrolType(mine) || 'Obedience';
    const ev: EventDraft = { ...newEventDraft(me), name: QUICK_TRAINING_NAME, duration_min: prev?.duration_min ?? 15 };
    if (prev?.location?.name) ev.location = { address: '', postal_code: '', ...prev.location };
    let x: ExerciseDraft;
    if (prevX) {
      const id = newExerciseDraft(me.id).id;
      x = { ...exerciseToDraft(prevX), id, localKey: id, isNew: true, version: 1, files: [], created_by: me.id, name: '', goal: '', monitor: '' };
      // fresh ids for the environment tree
      x.environments = x.environments.map((e) => ({ ...e, id: newEnvironment().id, units: e.units.map((u) => ({ ...u, id: newUnit().id, odors: u.odors.map((o) => ({ ...o, id: newOdor().id })) })) }));
    } else {
      x = newExerciseDraft(me.id, 'patrol');
      x.patrol_types = [predicted];
    }
    if (x.kind === 'patrol' && !x.patrol_types.length) x.patrol_types = [predicted];
    if (x.kind === 'detection' && !x.environments.length) x.environments = [oneEnvironment()];
    return { ev, x, dogId: defaultDog?.id || '', prefilledFrom: prev?.starts_at || null, predicted };
  });
  const [ev, setEv] = useState<EventDraft>(init.ev);
  const [x, setX] = useState<ExerciseDraft>(init.x);
  const [dogId, setDogId] = useState(init.dogId);
  const [completing, setCompleting] = useState(false);
  const [completion, setCompletion] = useState<CompletionDraft | null>(null);
  const [saving, setSaving] = useState<'complete' | 'later' | null>(null);
  const [errors, setErrors] = useState<{ dog?: string; date?: string; exercise?: string; comments?: string }>({});
  const dog = dogs.find((d) => d.id === dogId) || null;
  const scenario = x.kind === 'patrol' && x.patrol_types.length >= 2;

  const setKind = (kind: ExerciseDraft['kind']) => {
    setX((p) => {
      const n = { ...p, kind };
      if (kind === 'patrol' && !n.patrol_types.length) n.patrol_types = [init.predicted];
      if (kind === 'detection' && !n.environments.length) n.environments = [oneEnvironment()];
      return n;
    });
  };
  const env = x.environments[0];
  const unit = env?.units[0];
  const odor = unit?.odors[0];
  const setEnvType = (t: string) => setX((p) => ({ ...p, environments: p.environments.map((e, i) => (i === 0 ? { ...e, env_type: t } : e)) }));
  const setUnitName = (n: string) => setX((p) => ({ ...p, environments: p.environments.map((e, i) => (i === 0 ? { ...e, units: e.units.map((u, j) => (j === 0 ? { ...u, name: n } : u)) } : e)) }));
  const setOdor = (patch: Partial<NonNullable<typeof odor>>) => setX((p) => ({ ...p, environments: p.environments.map((e, i) => (i === 0 ? { ...e, units: e.units.map((u, j) => (j === 0 ? { ...u, odors: u.odors.map((o, k) => (k === 0 ? { ...o, ...patch } : o)) } : u)) } : e)) }));

  const validate = (needCompletion: boolean): boolean => {
    const e: typeof errors = {};
    const ee = validateEvent(ev);
    if (ee.starts_at) e.date = ee.starts_at;
    if (!dog) e.dog = dogs.length ? 'Dog is required — pick the dog you are training.' : 'Dog is required — add a dog on the Dogs page first.';
    const xe = validateExercise(x);
    const xs = exerciseErrorSummary(xe);
    if (xs) e.exercise = xs;
    if (needCompletion && completion) {
      const ce = validateCompletion(completion, COMMENTS_MAX);
      if (ce.comments) e.comments = ce.comments;
    }
    setErrors(e);
    const first = e.date || e.dog || e.exercise || e.comments;
    if (first) { toast.show(first, 'error'); return false; }
    return true;
  };

  const startCompletion = () => {
    if (!validate(false) || !dog) return;
    setCompletion((prev) => prev || { ...newCompletionDraft(dog, me.id, x, ev.tz), dirty: true });
    setCompleting(true);
  };

  const persist = async (mode: 'complete' | 'later') => {
    if (!validate(mode === 'complete') || !dog) return;
    setSaving(mode);
    try {
      let event = ev;
      // Save For Later still captures the weather for the time and place.
      if (typeof ev.location.lat === 'number' && typeof ev.location.lng === 'number' && !ev.forecast) {
        const r = await fetchWeather(ev.starts_at, ev.location.lat, ev.location.lng);
        if (r.ok) event = { ...ev, forecast: r.weather };
      }
      const res = await saveTrainingRecord(repo, {
        me: me.id,
        event,
        exercises: [x],
        removedExerciseIds: [],
        completions: mode === 'complete' && completion ? [{ exerciseKey: x.localKey, draft: { ...completion, dog_id: dog.id, handler_id: me.id } }] : [],
        label: `${QUICK_TRAINING_NAME} — ${dog.name}`,
      });
      toast.show(mode === 'complete' ? `Exercise completed for ${dog.name} — sent for review` : `Saved for later — complete ${dog.name}’s record from the phone or an office computer`);
      router.replace(`/records/training/${res.eventId}` as never);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.show(`Save failed — ${msg}. Your entries are still on screen.`, 'error', { title: 'Retry', onPress: () => void persist(mode) });
    } finally {
      setSaving(null);
    }
  };
  const cancel = () => { if (completing) { setCompleting(false); return; } if (router.canGoBack()) router.back(); else router.replace('/records' as never); };

  return (
    <Screen testID="screen-quick-training" maxWidth={720}>
      {/* Title bar: `✕ · SOLO QUICK TRAINING` → `Cancel · SOLO QUICK TRAINING · Save` while completing (the shell's top bar carries the same title on phone). */}
      <Row justify="space-between" style={{ marginBottom: space.md }} wrap>
        {completing ? <Button title="Cancel" variant="secondary" onPress={cancel} testID="btn-quick-cancel" /> : <Button title="Close" variant="ghost" icon="close" onPress={cancel} testID="btn-quick-close" accessibilityLabel="Close Solo Quick Training" />}
        {desktop || completing ? <Text variant="h3" accessibilityRole="header" testID="text-quick-title" style={{ flex: 1, textAlign: 'center' }}>{completing ? `COMPLETION — ${dog?.name || ''}` : 'SOLO QUICK TRAINING'}</Text> : null}
        {completing ? <Button title={saving === 'complete' ? 'Saving…' : 'Save'} onPress={() => void persist('complete')} loading={saving === 'complete'} testID="btn-quick-save" /> : desktop ? <View style={{ width: 88 }} /> : null}
      </Row>
      {!completing ? (
        <Muted style={{ marginBottom: space.md }} testID="text-quick-intro">
          Train alone with one dog on a patrol (or detection) exercise at your current location. The training event and exercise record are created automatically.
        </Muted>
      ) : null}
      {init.prefilledFrom && !completing ? <Banner tone="info" testID="banner-quick-prefilled" body={`Pre-filled from your last quick training on ${fmtDate(init.prefilledFrom, ev.tz)}. Change anything below.`} /> : null}

      <Card style={{ marginBottom: space.md }} testID="card-training-settings">
        <Row gap={6} style={{ marginBottom: space.sm }}>
          <Ionicons name="settings-outline" size={22} color={c.primary} />
          <Text variant="h3">TRAINING SETTINGS</Text>
        </Row>
        <LocationField value={ev.location} onChange={(v) => setEv({ ...ev, location: v })} readOnly={completing} testID="quick-location" />
        <DateTimeField label="Date & Time" required value={{ at: ev.starts_at || null, tz: ev.tz }} onChange={(v) => setEv({ ...ev, starts_at: v.at || '', tz: v.tz })} readOnly={completing} error={errors.date} testID="quick-datetime" />
        <DurationField value={ev.duration_min} onChange={(v) => setEv({ ...ev, duration_min: v })} readOnly={completing} testID="quick-duration" />
        <Select label="Dog" required options={dogs.map((d) => ({ value: d.id, label: `${d.name}${d.is_default ? ' (default)' : ''}` }))} value={dogId} onChange={setDogId} allowCustom={false} error={errors.dog} testID="quick-dog" disabled={completing} placeholder={dogs.length ? 'Pick your dog' : 'No active dogs — add one on the Dogs page'} />
        <Segmented label="Exercise type" options={[{ value: 'patrol', label: 'Patrol' }, { value: 'detection', label: 'Detection' }]} value={x.kind} onChange={(v) => !completing && setKind(v)} testID="quick-kind" />
        <View style={{ height: space.md }} />
        {x.kind === 'patrol' ? (
          <View>
            {x.patrol_types.map((t, i) => (
              <Row key={i} align="flex-start" gap={space.sm}>
                <View style={{ flex: 1 }}>
                  <VocabSelect label={i === 0 ? 'Patrol Type' : `Patrol Type ${i + 1}`} required={i === 0} customType="patrol_type" options={PATROL_TYPES} value={t} onChange={(v) => setX({ ...x, patrol_types: x.patrol_types.map((p, j) => (j === i ? v : p)) })} testID={`quick-patrol-type-${i + 1}`} disabled={completing} help={i === 0 && t === init.predicted && !init.prefilledFrom ? 'Predicted from your past training activity.' : undefined} error={i === 0 ? errors.exercise : undefined} />
                </View>
                {i > 0 && !completing ? <Button title="Remove" variant="ghost" icon="trash-outline" onPress={() => setX({ ...x, patrol_types: x.patrol_types.filter((_, j) => j !== i) })} testID={`quick-patrol-type-remove-${i + 1}`} accessibilityLabel={`Remove patrol type ${i + 1}`} style={{ marginTop: 26 }} /> : null}
              </Row>
            ))}
            {!completing ? (
              <Row wrap>
                <Button title="+ Patrol Type" variant="secondary" onPress={() => setX({ ...x, patrol_types: [...x.patrol_types, ''] })} testID="quick-add-patrol-type" />
                {scenario ? <Badge tone="accent" testID="quick-scenario-badge">Scenario</Badge> : null}
              </Row>
            ) : scenario ? <Badge tone="accent" testID="quick-scenario-badge">Scenario</Badge> : null}
          </View>
        ) : env && unit && odor ? (
          <View>
            {errors.exercise ? <Text color="danger" style={{ marginBottom: space.sm }}>{errors.exercise}</Text> : null}
            <VocabSelect label="Environment" required customType="environment_type" options={ENVIRONMENT_TYPES} value={env.env_type} onChange={setEnvType} testID="quick-env-type" disabled={completing} />
            <TextField label={`${env.env_type || 'Unit'} with odor`} value={unit.name} onChangeText={setUnitName} placeholder={env.env_type === 'Vehicle' ? 'e.g. Ford Mustang' : 'e.g. Locker #23'} testID="quick-unit-name" editable={!completing} />
            <Row gap={space.sm} align="flex-start" wrap>
              <VocabSelect label="Odor Category" required customType="odor_category" options={[...ODOR_CATEGORIES, 'Proofing']} value={odor.category} onChange={(v) => setOdor({ category: v })} testID="quick-odor-category" containerStyle={{ flex: 1, minWidth: 150 }} disabled={completing} />
              <VocabSelect label="Odor Type" required customType="odor_type" options={ODOR_TYPES[odor.category] || []} value={odor.type} onChange={(v) => setOdor({ type: v })} testID="quick-odor-type" containerStyle={{ flex: 1, minWidth: 150 }} disabled={completing} placeholder="Select or type an odor" />
            </Row>
            <Row gap={space.sm} align="flex-start" wrap>
              <TextField label="Amount" value={odor.amount == null ? '' : String(odor.amount)} onChangeText={(v) => setOdor({ amount: v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v) })} keyboardType="decimal-pad" testID="quick-odor-amount" containerStyle={{ flex: 1, minWidth: 110 }} editable={!completing} />
              <Select label="Unit" options={AMOUNT_UNITS} value={odor.unit} onChange={(v) => setOdor({ unit: v })} testID="quick-odor-unit" containerStyle={{ width: 130 }} disabled={completing} />
              <VocabSelect label="Packaging" customType="packaging" options={[...PACKAGING_DEFAULTS, 'None']} value={odor.packaging} onChange={(v) => setOdor({ packaging: v })} testID="quick-odor-packaging" containerStyle={{ flex: 1, minWidth: 150 }} clearable disabled={completing} />
            </Row>
            <TextField label="Concealed location" value={odor.concealed} onChangeText={(v) => setOdor({ concealed: v })} placeholder="e.g. grill of the Ford Mustang" testID="quick-odor-concealed" editable={!completing} />
          </View>
        ) : null}
      </Card>

      {!completing ? (
        <View style={{ gap: space.md }}>
          <Tile icon="checkmark-circle-outline" title="COMPLETE EXERCISE" body="Complete this exercise now by adding your comments and other details." onPress={startCompletion} testID="tile-complete-exercise" primary />
          <Tile icon="save-outline" title="SAVE FOR LATER" body="Create the training event and exercise now (time, duration, location, weather, type and dog are captured) and provide the dog completion details at a later time." onPress={() => void persist('later')} testID="tile-save-for-later" loading={saving === 'later'} />
        </View>
      ) : dog && completion ? (
        <Card testID="card-quick-completion">
          <Row justify="space-between" wrap style={{ marginBottom: space.sm }}>
            <Text variant="h3">COMPLETION — {dog.name}</Text>
            <Muted>{x.kind === 'patrol' ? x.patrol_types.filter(Boolean).join(' + ') : `Detection: ${odor?.category || ''}`}</Muted>
          </Row>
          <CompletionForm
            draft={completion}
            onChange={setCompletion}
            exercise={x}
            dog={dog}
            handler={users.find((u) => u.id === me.id)}
            readOnly={false}
            eventAt={ev.starts_at}
            eventLat={ev.location.lat}
            eventLng={ev.location.lng}
            errors={{ comments: errors.comments }}
            testID="quick-completion"
          />
          <Row justify="flex-end" style={{ marginTop: space.md }}>
            <Button title="Cancel" variant="secondary" onPress={cancel} testID="btn-quick-cancel-bottom" />
            <Button title={saving === 'complete' ? 'Saving…' : 'Save'} onPress={() => void persist('complete')} loading={saving === 'complete'} testID="btn-quick-save-bottom" />
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}

function oneEnvironment() {
  const e = newEnvironment('Vehicle');
  e.units = [{ ...newUnit(''), odors: [newOdor('Drugs')] }];
  return e;
}

function Tile({ icon, title, body, onPress, testID, primary, loading }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; onPress: () => void; testID: string; primary?: boolean; loading?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={body}
      accessibilityState={{ disabled: !!loading, busy: !!loading }}
      testID={testID}
      onPress={onPress}
      disabled={loading}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [{
        flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 84, padding: space.md, borderRadius: radius.md, borderWidth: 1,
        borderColor: primary ? c.primary : c.borderStrong, backgroundColor: primary ? c.primary : c.surface, opacity: loading ? 0.6 : pressed ? 0.85 : hovered ? 0.95 : 1,
      }]}
    >
      <Ionicons name={icon} size={34} color={primary ? '#fff' : c.primary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="h3" style={{ color: primary ? '#fff' : c.text }}>{loading ? 'Saving…' : title}</Text>
        <Text style={{ color: primary ? '#E8F0EE' : c.muted }}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color={primary ? '#fff' : c.muted} />
    </Pressable>
  );
}
