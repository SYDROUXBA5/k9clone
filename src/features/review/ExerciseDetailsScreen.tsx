// /review/exercise/[id] — the shared Exercise Details of one exercise: current details, version
// history, every completion against it (with Outdated / review pills), and — for the event creator,
// a group leader or a trainer of the group — an editor for the Details that goes through
// saveExerciseDetails() (version bump → snapshots → completions flagged Outdated → handlers notified).
// U3's full exercise editor is the parity screen; this one exists so the outdated loop is testable now.
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { accessContext, canSee } from '@/db/access';
import { useList, useRecord, useRepo } from '@/db/provider';
import { detailsLines, effectiveReview, exerciseDetailsOf, isOutdated, lineDiff, saveExerciseDetails } from '@/db/review';
import type { Completion, ExerciseDetails } from '@/db/types';
import { PATROL_TYPES } from '@/db/vocab';
import { useAuth } from '@/features/auth/AuthProvider';
import { Banner, Button, Card, Checkbox, EmptyState, Muted, Row, Screen, Section, Segmented, StatusPill, Table, Text, TextArea, TextField, VocabMultiSelect, VocabSelect, fmtDateTime, tzShort, useColors, useToast, space, type Column } from '@/ui';
import { OutdatedBanner } from './ReviewBar';

export function ExerciseDetailsScreen({ exerciseId }: { exerciseId: string }) {
  const { user, role } = useAuth();
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const ex = useRecord('exercise', exerciseId);
  const ev = useRecord('training_event', ex?.event_id || null);
  const completions = useList('completion', (x) => x.exercise_id === exerciseId);
  const users = useList('user');
  const dogs = useList('dog');
  useList('training_group'); useList('management_group');
  const nameOf = (id: string | null | undefined) => users.find((u) => u.id === id)?.name || '—';
  const dogName = (id: string) => dogs.find((d) => d.id === id)?.name || '—';
  const [draft, setDraft] = useState<ExerciseDetails | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (ex && !draft) setDraft(exerciseDetailsOf(ex)); }, [ex, draft]);

  if (!ex) return <Screen title="Exercise" testID="screen-exercise-missing"><EmptyState icon="document-outline" title="Exercise not found" action={{ title: 'Back', onPress: () => router.back(), testID: 'btn-review-back' }} /></Screen>;
  if (!user) return null;
  const ctx = accessContext(repo, user, role);
  const canView = canSee(repo, ctx, 'exercise', ex) || completions.some((x) => (x.handler_id || x.owner_user_id) === user.id);
  if (!canView) return <Screen title="Exercise" testID="screen-exercise-denied"><EmptyState icon="lock-closed-outline" title="You do not have access to this exercise" action={{ title: 'Back', onPress: () => router.back(), testID: 'btn-review-back' }} /></Screen>;

  const group = ev?.group_id ? repo.getSync('training_group', ev.group_id) : undefined;
  const isLeader = !!group && (group.leader_id === user.id || group.leaders.includes(user.id));
  const isEventLeader = !!ev?.invitees.some((i) => i.user_id === user.id && i.is_leader);
  const trainsGroup = role === 'trainer' && !!group && group.members.some((m) => ctx.readable.has(m));
  const canEdit = role !== 'supervisor' && (ex.created_by === user.id || ex.owner_user_id === user.id || ev?.owner_user_id === user.id || isLeader || isEventLeader || trainsGroup);
  const savedCount = completions.filter((x) => x.saved_at || x.is_complete).length;
  const mine = completions.filter((x) => (x.handler_id || x.owner_user_id) === user.id);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(exerciseDetailsOf(ex));

  const save = async () => {
    if (!draft) return;
    const e: Record<string, string> = {};
    if (!draft.name.trim()) e.name = 'Exercise name is required';
    if (draft.kind === 'patrol' && !draft.patrol_types.length) e.patrol_types = 'Pick at least one patrol type (2 or more = Scenario)';
    setErrors(e);
    if (Object.keys(e).length) { toast.show('Please fix the highlighted fields.', 'error'); return; }
    setSaving(true);
    try {
      const res = await saveExerciseDetails(repo, ex.id, { ...draft, name: draft.name.trim() }, user.id);
      toast.show(res.bumped ? `Details saved as v${res.version} — ${res.flagged} completion${res.flagged === 1 ? '' : 's'} flagged Outdated and handler${res.flagged === 1 ? '' : 's'} notified` : 'Details saved');
      setDraft(null);
    } catch (err) {
      toast.show(`Save failed — ${err instanceof Error ? err.message : 'try again'}`, 'error', { title: 'Retry', onPress: () => void save() });
    } finally { setSaving(false); }
  };

  const columns: Column<Completion>[] = [
    { key: 'handler', title: 'Handler', render: (r) => nameOf(r.handler_id) },
    { key: 'dog', title: 'Dog', render: (r) => dogName(r.dog_id) },
    { key: 'saved', title: 'Saved On', render: (r) => (r.saved_at ? fmtDateTime(r.saved_at, r.tz) : 'Incomplete') },
    { key: 'seen', title: 'Details seen', render: (r) => `v${r.exercise_version_seen || 1}` },
    { key: 'state', title: 'Status', render: (r) => (
      <Row wrap gap={space.xs}>
        {r.saved_at || r.is_complete ? <StatusPill status={effectiveReview(r)} /> : <StatusPill status="incomplete" />}
        {isOutdated(repo, r) ? <StatusPill status="outdated" testID={`pill-outdated-${r.id}`} /> : null}
      </Row>
    ) },
  ];
  const versions = ex.versions || [];
  const lines = detailsLines(exerciseDetailsOf(ex));

  return (
    <Screen
      title={ex.name}
      subtitle={`${ev?.name || 'Training event'} · ${ev ? `${fmtDateTime(ev.starts_at, ev.tz)} ${tzShort(ev.tz, ev.starts_at)}` : ''} · Details v${ex.version || 1}`}
      testID="screen-exercise-details"
      actions={<Button title="Back" variant="secondary" icon="arrow-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/records'))} testID="btn-review-back" />}
    >
      {mine.map((m) => (
        <View key={m.id}>
          <OutdatedBanner completion={m} />
        </View>
      ))}
      {savedCount > 0 && canEdit ? <Banner tone="warning" testID="banner-outdated-warning" body={`${savedCount} completion${savedCount === 1 ? ' has' : 's have'} been saved against these details. Saving a change bumps the version, flags ${savedCount === 1 ? 'it' : 'them'} Outdated and shows each handler a red/green diff to verify and re-save.`} /> : null}
      <Card style={{ marginBottom: space.md }}>
        <Section title="Exercise Details (shared — one exercise, one completion per dog)">
          {canEdit && draft ? (
            <>
              <TextField label="Exercise name" required value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} error={errors.name} testID="input-exercise-name" maxLength={80} />
              <View style={{ marginBottom: space.md }}>
                <Text variant="label" style={{ marginBottom: 6 }}>Type</Text>
                <Segmented label="Type" options={[{ value: 'detection', label: 'Detection' }, { value: 'patrol', label: 'Patrol' }]} value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v })} testID="seg-exercise-kind" />
              </View>
              {draft.kind === 'patrol' ? <VocabMultiSelect label="Patrol Types" customType="patrol_type" options={PATROL_TYPES} values={draft.patrol_types} onChange={(v) => setDraft({ ...draft, patrol_types: v })} error={errors.patrol_types} testID="select-exercise-patrol-types" help="Two or more patrol types make this a Scenario exercise." /> : null}
              <VocabSelect label="Exercise Monitor" customType="other" options={users.map((u) => u.name)} value={draft.monitor} onChange={(v) => setDraft({ ...draft, monitor: v })} testID="select-exercise-monitor" clearable placeholder="Who monitored the exercise" />
              <TextArea label="Goal" value={draft.goal} onChangeText={(v) => setDraft({ ...draft, goal: v })} minHeight={120} testID="input-exercise-goal" help="Sentence-level changes show as red/green lines on each handler's outdated completion." />
              {draft.kind === 'detection' ? <Checkbox label="Blank / Controlled Negative (no odor placed)" value={draft.blank_controlled_negative} onChange={(v) => setDraft({ ...draft, blank_controlled_negative: v })} testID="check-exercise-blank" /> : null}
              {draft.environments.length ? <Muted style={{ marginBottom: space.sm }}>Environments and odors ({draft.environments.length}) are edited in the full exercise editor (Records → event → Details).</Muted> : null}
              <Row justify="flex-end" wrap>
                <Button title="Discard changes" variant="ghost" onPress={() => setDraft(exerciseDetailsOf(ex))} disabled={!dirty} testID="btn-discard-exercise" />
                <Button title={saving ? 'Saving…' : 'Save Details'} icon="save-outline" onPress={() => void save()} loading={saving} disabled={!dirty} testID="btn-save-exercise-details" />
              </Row>
            </>
          ) : (
            <View testID="exercise-details-readonly">
              {lines.map((l, i) => <Text key={i} style={{ marginLeft: (l.length - l.trimStart().length) * 6 }}>{l.trim()}</Text>)}
              {role === 'supervisor' ? <Muted style={{ marginTop: space.sm }}>Supervisors view exercise details read-only.</Muted> : <Muted style={{ marginTop: space.sm }}>Only Event Creators and Group Leaders can modify events and exercises.</Muted>}
            </View>
          )}
        </Section>
      </Card>
      <Card style={{ marginBottom: space.md }}>
        <Section title={`Completions (${completions.length})`} description="One completion per dog. Outdated = saved against an earlier version of these details.">
          <Table columns={columns} rows={completions} keyOf={(r) => r.id} onRowPress={(r) => router.push(`/review/completion/${r.id}` as never)} testID="table-exercise-completions" emptyText="No completions yet." rowTestID={(r) => `row-completion-${r.id}`} />
        </Section>
      </Card>
      <Card>
        <Section title={`Version history (${versions.length + 1})`} description="Each save of the Details after completions existed keeps the previous version here.">
          {versions.length === 0 ? <Muted testID="versions-empty">Details never changed since the first completion (v{ex.version || 1}).</Muted> : (
            [...versions].reverse().map((v, i) => {
              const nextDetails = i === 0 ? exerciseDetailsOf(ex) : [...versions].reverse()[i - 1].details;
              const diff = lineDiff(detailsLines(v.details), detailsLines(nextDetails)).filter((l) => l.kind !== 'same');
              return (
                <View key={v.version} style={{ marginBottom: space.sm, borderLeftWidth: 3, borderLeftColor: c.border, paddingLeft: space.sm }} testID={`version-${v.version}`}>
                  <Text variant="bodyStrong">v{v.version} → v{v.version + 1} · {fmtDateTime(v.saved_at, v.tz)} {tzShort(v.tz, v.saved_at)}</Text>
                  {diff.map((l, j) => <Text key={j} style={{ color: l.kind === 'del' ? c.danger : c.success }}>{l.kind === 'del' ? '− ' : '+ '}{l.text.trim()}</Text>)}
                </View>
              );
            })
          )}
        </Section>
      </Card>
    </Screen>
  );
}
