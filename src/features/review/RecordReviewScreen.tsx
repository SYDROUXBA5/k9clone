// /review/[type]/[id] — the standalone review view of one record (completion · deployment · class):
// read-only record body · <ReviewBar/> (supervisor trio / handler banners) · outdated diff · trainer
// comments · share with supervisor · a minimal owner "re-save" (narrative field) so the rejected →
// re-save → Not Reviewed loop is testable regardless of merge order. U3/U4 record editors mount the
// same components; "Open full record" links there.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import { REVIEWABLE_LABEL, afterHandlerSave, effectiveReview, isOutdated, recordRoute, reviewEntityOf, type ReviewableRow, type ReviewableType } from '@/db/review';
import type { ClassRecord, Completion, Deployment, Weather } from '@/db/types';
import { cToF, kphToMph } from '@/db/util';
import { PERFORMED_STATES, REQUEST_FULFILLMENT } from '@/db/vocab';
import { useAuth } from '@/features/auth/AuthProvider';
import { Banner, Button, Card, EmptyState, Muted, Row, Screen, Section, StatusPill, Text, TextArea, fmtDateTime, fmtDuration, tzShort, useColors, useIsDesktop, useToast, space } from '@/ui';
import { ExerciseDetailsScreen } from './ExerciseDetailsScreen';
import { ReviewBar, useReviewAccess } from './ReviewBar';
import { ShareButton } from './ShareButton';
import { TrainerCommentButton, TrainerComments } from './TrainerComments';

const TYPES: ReviewableType[] = ['completion', 'deployment', 'class'];

export function RecordReviewRoute() {
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const type = String(params.type || '');
  const id = String(params.id || '');
  if (type === 'exercise') return <ExerciseDetailsScreen exerciseId={id} />;
  if (!TYPES.includes(type as ReviewableType)) {
    return <Screen title="Review" testID="screen-review-unknown"><EmptyState icon="help-circle-outline" title="Unknown record type" body={`“${type}” is not a reviewable record. Use completion, deployment, class or exercise.`} /></Screen>;
  }
  return <RecordReviewScreen recordType={type as ReviewableType} recordId={id} />;
}

function KV({ label, value, testID }: { label: string; value: React.ReactNode; testID?: string }) {
  const c = useColors();
  const empty = value === null || value === undefined || value === '' || value === '—';
  return (
    <View style={[styles.kv, { borderBottomColor: c.border }]} testID={testID}>
      <Muted style={styles.kvLabel}>{label}</Muted>
      <View style={{ flex: 1, minWidth: 0 }}>{typeof value === 'string' || typeof value === 'number' ? <Text style={empty ? { color: c.muted } : undefined}>{empty ? '—' : String(value)}</Text> : value}</View>
    </View>
  );
}
const weatherText = (w: Weather | null | undefined) => {
  if (!w) return '—';
  const parts = [w.conditions, w.temp_c != null ? `${cToF(w.temp_c)}°F` : null, w.humidity != null ? `${w.humidity}% humidity` : null, w.wind_kph != null ? `wind ${kphToMph(w.wind_kph)} mph${w.wind_dir ? ` ${w.wind_dir}` : ''}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
};
const humanKey = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).replace(/ M$/, ' (m)').replace(/ Min$/, ' (min)');
const humanVal = (v: unknown): string => Array.isArray(v) ? v.map(humanVal).join(', ') : v && typeof v === 'object' ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${humanKey(k)}: ${humanVal(x)}`).join('; ') : v === true ? 'Yes' : v === false ? 'No' : v == null || v === '' ? '—' : String(v);

export function RecordReviewScreen({ recordType, recordId }: { recordType: ReviewableType; recordId: string }) {
  const { user, role } = useAuth();
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const desktop = useIsDesktop();
  const { row, isOwner, canView, canReview } = useReviewAccess(recordType, recordId);
  const users = useList('user');
  const dogs = useList('dog');
  useList('exercise'); useList('training_event');
  const nameOf = (id: string | null | undefined) => users.find((u) => u.id === id)?.name || '—';
  const dogName = (id: string | null | undefined) => dogs.find((d) => d.id === id)?.name || '—';
  const narrativeKey = recordType === 'completion' ? 'comments' : recordType === 'deployment' ? 'summary' : 'notes';
  const narrativeLabel = recordType === 'completion' ? 'Handler Comments' : recordType === 'deployment' ? 'Summary' : 'Notes';
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const current = (row as unknown as Record<string, unknown> | undefined)?.[narrativeKey];
  useEffect(() => { if (!dirty) setDraft(typeof current === 'string' ? current : ''); }, [current, dirty]);

  if (!row) {
    return <Screen title="Review" testID="screen-review-missing"><EmptyState icon="document-outline" title="Record not found" body="It may have been deleted, or the link is out of date." action={{ title: 'Back', onPress: () => router.back(), testID: 'btn-review-back' }} /></Screen>;
  }
  if (!canView) {
    return <Screen title="Review" testID="screen-review-denied"><EmptyState icon="lock-closed-outline" title="You do not have access to this record" body="Records are visible to their handler, the handler's supervisors and trainers, members of the same training event, and supervisors it was shared with." action={{ title: 'Back', onPress: () => router.back(), testID: 'btn-review-back' }} /></Screen>;
  }

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    try {
      await repo.upsert(reviewEntityOf(recordType), { id: recordId, [narrativeKey]: draft, ...(recordType === 'completion' ? { saved_at: new Date().toISOString(), is_complete: true } : {}) } as Partial<ReviewableRow>, { actor_id: user.id, label: `${REVIEWABLE_LABEL[recordType]} re-saved` });
      const res = await afterHandlerSave(repo, recordType, recordId, { actor_id: user.id });
      setDirty(false);
      toast.show(res.resubmitted ? 'Saved — record is back to Not Reviewed for your supervisor' : 'Saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveError(msg);
      toast.show(`Save failed — ${msg}`, 'error', { title: 'Retry', onPress: () => void save() });
    } finally { setSaving(false); }
  };

  // ----- per-type body -----
  let title = REVIEWABLE_LABEL[recordType];
  let subtitle = '';
  let body: React.ReactNode = null;
  if (recordType === 'completion') {
    const cpl = row as Completion;
    const ex = repo.getSync('exercise', cpl.exercise_id);
    const ev = repo.getSync('training_event', cpl.event_id);
    title = `${ex?.name || 'Exercise'} · ${dogName(cpl.dog_id)}`;
    subtitle = `${nameOf(cpl.handler_id)} · ${ev?.name || 'Training event'} · ${fmtDateTime(ev?.starts_at || cpl.start_at, cpl.tz)} ${tzShort(cpl.tz)}`;
    body = (
      <>
        <Section title="Event">
          <KV label="Event" value={ev?.name} />
          <KV label="Date / time" value={ev ? `${fmtDateTime(ev.starts_at, ev.tz)} ${tzShort(ev.tz, ev.starts_at)}` : '—'} />
          <KV label="Duration" value={fmtDuration(ev?.duration_min)} />
          <KV label="Location" value={ev?.location?.name ? `${ev.location.name}${ev.location.address ? `, ${ev.location.address}` : ''}` : '—'} />
        </Section>
        <Section title="Exercise Details (shared)" actions={<Button title="View details" variant="ghost" icon="open-outline" onPress={() => router.push(`/review/exercise/${cpl.exercise_id}` as never)} testID="btn-open-exercise" />}>
          <KV label="Exercise" value={ex?.name} />
          <KV label="Type" value={ex ? (ex.kind === 'detection' ? 'Detection' : ex.patrol_types.length > 1 ? 'Patrol — Scenario' : 'Patrol') : '—'} />
          <KV label="Patrol Types" value={ex?.patrol_types?.join(', ')} />
          <KV label="Exercise Monitor" value={cpl.monitor || ex?.monitor} />
          <KV label="Goal" value={ex?.goal} />
          {ex?.kind === 'detection' ? <KV label="Blank / Controlled Negative" value={ex.blank_controlled_negative ? 'Yes' : 'No'} /> : null}
          {ex?.environments?.length ? <KV label="Environments" value={ex.environments.map((e) => `${e.env_type} ×${e.count}: ${e.units.map((u) => `${u.name} (${u.odors.map((o) => `${o.type}${o.amount != null ? ` ${o.amount} ${o.unit}` : ''}`).join(', ') || 'no odor'})`).join('; ')}`).join(' | ')} /> : null}
          <KV label="Version" value={`v${ex?.version || 1} (this completion saw v${cpl.exercise_version_seen || 1})`} />
        </Section>
        <Section title="Completion">
          <KV label="Dog" value={dogName(cpl.dog_id)} />
          <KV label="Handler" value={nameOf(cpl.handler_id)} />
          <KV label="Performed" value={PERFORMED_STATES.find((p) => p.value === cpl.performed)?.label || cpl.performed} />
          <KV label="Blind exercise" value={cpl.is_blind === null ? '— (not answered)' : cpl.is_blind ? 'Yes' : 'No'} />
          <KV label="Odor set" value={cpl.odor_set_at ? `${fmtDateTime(cpl.odor_set_at, cpl.tz)} ${tzShort(cpl.tz)}` : '—'} />
          <KV label="Start / End" value={cpl.start_at ? `${fmtDateTime(cpl.start_at, cpl.tz)} → ${cpl.end_at ? fmtDateTime(cpl.end_at, cpl.tz) : '—'} ${tzShort(cpl.tz)}` : '—'} />
          <KV label="Weather" value={weatherText(cpl.weather)} />
          {Object.entries(cpl.sections || {}).map(([k, v]) => <KV key={k} label={k} value={humanVal(v)} />)}
          <KV label="Files" value={`${cpl.files?.length || 0} attached`} />
        </Section>
      </>
    );
  } else if (recordType === 'deployment') {
    const dp = row as Deployment;
    title = `Deployment · ${dp.case_number ? `Case ${dp.case_number}` : fmtDateTime(dp.occurred_at, dp.tz)}`;
    subtitle = `${nameOf(dp.handler_id)} · ${dogName(dp.dog_id)} · ${fmtDateTime(dp.occurred_at, dp.tz)} ${tzShort(dp.tz, dp.occurred_at)}`;
    body = (
      <>
        <Section title="General">
          <KV label="Date / time" value={`${fmtDateTime(dp.occurred_at, dp.tz)} ${tzShort(dp.tz, dp.occurred_at)}`} />
          <KV label="Location" value={dp.location?.name ? `${dp.location.name}${dp.location.address ? `, ${dp.location.address}` : ''}` : '—'} />
          <KV label="Case Number" value={dp.case_number} />
          <KV label="Tags" value={dp.tags?.join(', ')} />
          <KV label="Requesting Unit" value={dp.requesting_unit} />
          <KV label="Reason For Deployment" value={dp.reason} />
          <KV label="Request Fulfillment" value={REQUEST_FULFILLMENT.find((r) => r.value === dp.request_fulfillment)?.label || dp.request_fulfillment} />
          <KV label="Dog" value={dogName(dp.dog_id)} />
          <KV label="Handler" value={nameOf(dp.handler_id)} />
          <KV label="Type" value={dp.kind === 'detection' ? 'Detection' : `Patrol${dp.patrol_types?.length ? ` — ${dp.patrol_types.join(', ')}` : ''}`} />
          <KV label="Weather" value={weatherText(dp.weather)} />
        </Section>
        {Object.keys(dp.sections || {}).length ? (
          <Section title="Sections">
            {Object.entries(dp.sections).map(([k, v]) => <KV key={k} label={k} value={humanVal(v)} />)}
          </Section>
        ) : null}
        {dp.detection ? <Section title="Detection"><KV label="Details" value={humanVal(dp.detection)} /></Section> : null}
        <Section title="People">
          <KV label="People found" value={dp.people_found ?? '—'} />
          <KV label="Arrests" value={dp.arrests?.length ? dp.arrests.map((a) => `#${a.n} ${a.charges}${user?.demographics_in_reports !== false ? ` (${a.demographics.age ?? '—'}, ${a.demographics.sex || '—'}, ${a.demographics.race || '—'})` : ''}`).join('; ') : 'None'} />
          <KV label="Unintentional bites" value={dp.people_unintentionally_bitten ?? '—'} />
        </Section>
      </>
    );
  } else {
    const k = row as ClassRecord;
    title = k.title || 'Class';
    subtitle = `${nameOf(k.owner_user_id)} · ${fmtDateTime(k.occurred_at, k.tz)} ${tzShort(k.tz, k.occurred_at)}`;
    body = (
      <Section title="Class">
        <KV label="Title" value={k.title} />
        <KV label="Instructor" value={k.instructor} />
        <KV label="Location" value={k.location} />
        <KV label="Date / time" value={`${fmtDateTime(k.occurred_at, k.tz)} ${tzShort(k.tz, k.occurred_at)}`} />
        <KV label="Duration" value={fmtDuration(k.duration_min)} />
        <KV label="Files" value={`${k.files?.length || 0} attached`} />
      </Section>
    );
  }
  const savedAt = (row as Completion).saved_at || (row as Deployment).submitted_at || row.updated_at;
  const state = effectiveReview(row);
  const outdated = recordType === 'completion' && isOutdated(repo, row as Completion);

  return (
    <Screen
      title={title}
      subtitle={subtitle}
      testID={`screen-review-${recordType}`}
      actions={(
        // flexShrink lets the row take the available width so its buttons wrap on a phone instead of running off-screen.
        <Row wrap style={{ flexShrink: 1 }}>
          <Button title="Back" variant="secondary" icon="arrow-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/records'))} testID="btn-review-back" />
          <Button title="Open full record" variant="ghost" icon="open-outline" onPress={() => router.push(recordRoute(recordType, row) as never)} testID="btn-open-record" />
          {/* A trainer must not scroll the whole completion to find this — it lives at the top-right. */}
          <TrainerCommentButton recordType={recordType} recordId={recordId} />
        </Row>
      )}
    >
      {!isOwner && !canReview ? <Banner tone="info" body={`You are viewing ${nameOf((row as Completion).handler_id || row.owner_user_id)}'s record read-only${role === 'trainer' ? ' — as a trainer, use the Trainer Comments button at the top to add yours.' : '.'}`} testID="banner-readonly" /> : null}
      <ReviewBar recordType={recordType} recordId={recordId} />
      {isOwner && state === 'reviewed' ? <Banner tone="success" body={`Report Reviewed: Yes, by ${nameOf(row.reviewed_by)} on ${fmtDateTime(row.reviewed_at, row.reviewed_tz || undefined)}. Saving changes will set the record back to Not Reviewed for another review.`} testID="banner-reviewed" /> : null}
      {saveError ? <Banner tone="danger" title="Save failed" body={saveError} action={{ title: 'Retry', onPress: () => void save() }} testID="banner-save-error" /> : null}
      <Card style={{ marginBottom: space.md }}>
        <Row wrap justify="space-between" style={{ marginBottom: space.sm }}>
          <Row wrap gap={space.xs}>
            {outdated ? <StatusPill status="outdated" testID="pill-outdated-record" /> : null}
            {(row as Completion).is_complete === false && recordType === 'completion' ? <StatusPill status="incomplete" /> : null}
          </Row>
          {canReview ? <ShareButton recordType={recordType} recordId={recordId} /> : null}
        </Row>
        {body}
        <Section title={narrativeLabel}>
          {isOwner ? (
            <>
              <TextArea label={narrativeLabel} value={draft} onChangeText={(v) => { setDraft(v); setDirty(true); }} minHeight={140} maxLength={32000} testID="input-narrative" help={outdated ? 'This completion is outdated — acknowledge the exercise changes above, or edit and save here.' : 'Edit and save to re-submit this record for review.'} />
              <Row justify="flex-end">
                <Button title={saving ? 'Saving…' : 'Save'} icon="save-outline" onPress={() => void save()} loading={saving} disabled={!dirty} testID="btn-resave-record" />
              </Row>
            </>
          ) : (
            <Text testID="text-narrative" style={typeof current === 'string' && current ? undefined : { color: '#6B6A66' }}>{typeof current === 'string' && current ? current : '— (empty)'}</Text>
          )}
        </Section>
        <TrainerComments recordType={recordType} recordId={recordId} hideAddButton />
      </Card>
      <Muted testID="text-record-footer" style={{ marginBottom: space.lg }}>
        Created by {nameOf(row.owner_user_id)}, {fmtDateTime(row.created_at)} · Saved On: {fmtDateTime(savedAt)} · Report Reviewed: {state === 'reviewed' ? `Yes, by ${nameOf(row.reviewed_by)}` : 'No'}{outdated ? ' · Outdated' : ''}
      </Muted>
      {desktop ? null : <View style={{ height: space.xl }} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  kv: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: 1, gap: space.sm },
  kvLabel: { width: 150 },
});
