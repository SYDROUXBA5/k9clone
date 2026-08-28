// Per-dog Completion form: performed / excused / unable, blind (tri-state), Exercise Monitor, OPTIONAL: Time
// Settings, Odor Summary (Details) with Target/Proofing per dog, WEATHER (auto + Reload), one section per patrol
// type ("(Scenario)" when ≥2), HANDLER COMMENTS (32,000 + USE TEMPLATE + previous narratives), Exercise Summary
// (for review only), SUPPLEMENTAL FILES. Read-only when the signed-in user is not the handler.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useList } from '@/db/provider';
import type { Dog, User } from '@/db/types';
import { COMMENTS_MAX, PERFORMED_STATES } from '@/db/vocab';
import { Banner, Checkbox, DateTimeField, Muted, Row, Segmented, StatusPill, Text, TextArea, TextField, fmtDate, space, useColors, radius } from '@/ui';
import { WeatherBlock } from '@/features/weather/WeatherBlock';
import { odorSummaryLines } from './ExerciseDetails';
import { FilesField } from './FilesField';
import { completionStatus, isScenario, type CompletionDraft, type CompletionErrors, type ExerciseDraft } from './logic';
import { sectionFor } from './patrolSections';
import { SectionFields } from './SectionFields';
import { TemplatePicker, UseTemplateLink } from './TemplatePicker';
import { TrackingMapSection } from '@/features/tracking';

export function CompletionForm({ draft, onChange, exercise, dog, handler, readOnly, eventAt, eventLat, eventLng, errors, editorName, reviewerName, testID }: {
  draft: CompletionDraft; onChange: (d: CompletionDraft) => void; exercise: ExerciseDraft; dog: Dog; handler: User | undefined; readOnly: boolean;
  eventAt: string | null; eventLat: number | null | undefined; eventLng: number | null | undefined; errors: CompletionErrors; editorName?: string; reviewerName?: string; testID: string;
}) {
  const c = useColors();
  const [timesOpen, setTimesOpen] = useState(!!(draft.start_at || draft.end_at || draft.odor_set_at));
  const [summaryOpen, setSummaryOpen] = useState(!!draft.summary);
  const [tplOpen, setTplOpen] = useState(false);
  const set = <K extends keyof CompletionDraft>(k: K, v: CompletionDraft[K]) => onChange({ ...draft, [k]: v, dirty: true });
  const scenario = isScenario(exercise);
  const status = completionStatus(draft);
  const previous = useList('completion', (x) => x.handler_id === draft.handler_id && !!x.comments && x.id !== draft.id)
    .sort((a, b) => ((b.saved_at || b.updated_at) < (a.saved_at || a.updated_at) ? -1 : 1))
    .slice(0, 5)
    .map((x, i) => ({ text: x.comments, when: x.saved_at || x.updated_at, label: `Previous narrative ${i + 1}` }));
  const odorLines = exercise.kind === 'detection' ? odorSummaryLines(exercise, dog) : [];

  return (
    <View testID={testID}>
      {draft.review === 'rejected' ? (
        <Banner tone="danger" testID={`${testID}-rejected`} title={`Rejected${reviewerName ? ` by ${reviewerName}` : ''}${draft.reviewed_at ? ` on ${fmtDate(draft.reviewed_at, draft.tz)}` : ''}`} body={draft.rejection_reason ? `Reason: ${draft.rejection_reason}${readOnly ? '' : ' — fix the record and save again to send it back for review.'}` : (readOnly ? 'No reason was given.' : 'Fix the record and save again to send it back for review.')} />
      ) : null}
      {draft.is_outdated ? (
        <Banner tone="warning" testID={`${testID}-outdated`} title="Exercise details changed after this completion was saved" body={readOnly
          ? `${editorName || 'A group leader'} modified the exercise details after ${handler?.first_name || 'the handler'} saved this completion record. It stays Outdated until ${handler?.first_name || 'the handler'} re-saves it.`
          : `${editorName || 'A group leader'} modified the exercise details after you saved this completion record. Your completion is now outdated and needs to be verified — review the Details tab and save again to confirm you agree with the changes.`} />
      ) : null}

      {draft.saved_at ? (
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surfaceAlt, padding: space.md, marginBottom: space.md }} testID={`${testID}-header`}>
          <Row wrap gap={space.md}>
            <Text>Exercise Performed: <Text variant="bodyStrong">{draft.performed === 'performed' ? 'Yes' : draft.performed === 'excused' ? 'No — excused' : 'No — unable'}</Text></Text>
            <Text>Saved On: <Text variant="bodyStrong">{fmtDate(draft.saved_at, draft.tz, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text></Text>
            <Text>Report Reviewed: <Text variant="bodyStrong">{draft.review === 'reviewed' ? `Yes${reviewerName ? `, by ${reviewerName}` : ''}` : 'No'}</Text></Text>
            <StatusPill status={status === 'complete' ? (draft.review === 'reviewed' ? 'reviewed' : 'not_reviewed') : status} testID={`${testID}-status`} />
          </Row>
        </View>
      ) : null}
      {readOnly ? <Banner tone="info" testID={`${testID}-readonly`} body={`This completion belongs to ${handler?.name || 'another handler'}. Only the handler edits their own dog's completion.`} /> : null}
      {errors.dog ? <Text color="danger" testID={`${testID}-error-dog`}>{errors.dog}</Text> : null}

      <Checkbox label={`${dog.name} performed this exercise`} value={draft.performed === 'performed'} onChange={(v) => set('performed', v ? 'performed' : 'excused')} testID={`${testID}-performed`} disabled={readOnly} />
      {draft.performed !== 'performed' ? (
        <View style={{ paddingLeft: space.md, marginBottom: space.sm }}>
          <Segmented label="Why the dog did not perform" options={PERFORMED_STATES.filter((p) => p.value !== 'performed').map((p) => ({ value: p.value, label: p.label }))} value={draft.performed} onChange={(v) => !readOnly && set('performed', v)} testID={`${testID}-not-performed`} />
        </View>
      ) : null}
      <Checkbox label="This was a blind exercise" help={draft.is_blind === null ? 'Not answered yet — an unanswered box is not the same as No.' : undefined} value={draft.is_blind} onChange={(v) => set('is_blind', v)} testID={`${testID}-blind`} disabled={readOnly} />
      <View style={{ height: space.sm }} />
      <TextField label="Exercise Monitor" value={draft.monitor} onChangeText={(v) => set('monitor', v)} testID={`${testID}-monitor`} editable={!readOnly} help="Pre-filled from the exercise Details." />

      <Pressable accessibilityRole="button" accessibilityLabel="Optional: Time Settings" accessibilityState={{ expanded: timesOpen }} testID={`${testID}-times-toggle`} onPress={() => setTimesOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space.sm, marginBottom: space.sm }}>
        <Ionicons name="time-outline" size={22} color={c.primary} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>OPTIONAL: Time Settings</Text>
        <Ionicons name={timesOpen ? 'chevron-up' : 'chevron-down'} size={22} color={c.muted} />
      </Pressable>
      {timesOpen ? (
        <View style={{ paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: c.border, marginBottom: space.md }}>
          {exercise.kind === 'detection' ? <DateTimeField label="Odor Placement (Set Time)" value={{ at: draft.odor_set_at, tz: draft.tz }} onChange={(v) => set('odor_set_at', v.at)} readOnly={readOnly} testID={`${testID}-set-time`} /> : null}
          <DateTimeField label="Start Time" value={{ at: draft.start_at, tz: draft.tz }} onChange={(v) => set('start_at', v.at)} readOnly={readOnly} testID={`${testID}-start-time`} />
          <DateTimeField label="End Time" value={{ at: draft.end_at, tz: draft.tz }} onChange={(v) => set('end_at', v.at)} readOnly={readOnly} testID={`${testID}-end-time`} error={errors.times} />
        </View>
      ) : null}

      {exercise.kind === 'detection' ? (
        <View style={{ marginBottom: space.md }} testID={`${testID}-odor-summary`}>
          <Text variant="bodyStrong">Odor Summary (Details):</Text>
          {odorLines.length ? odorLines.map((l, i) => <Text key={i} style={{ paddingLeft: space.sm }}>• {l}</Text>) : <Muted>{exercise.blank_controlled_negative ? 'Blank / controlled negative — no odor placed.' : 'No odors set up in the Details yet.'}</Muted>}
          <Muted>Target / Proofing is set automatically from {dog.name}’s Detection Odor Types.</Muted>
        </View>
      ) : null}

      <WeatherBlock value={draft.weather} onChange={(w) => set('weather', w)} at={draft.start_at || eventAt} lat={eventLat} lng={eventLng} tz={draft.tz} readOnly={readOnly} testID={`${testID}-weather`} />

      <TrackingMapSection trackId={draft.track_id} testID={`${testID}-tracking-map`} />

      {exercise.kind === 'patrol' ? (exercise.patrol_types.filter(Boolean).map((t) => (
        <SectionFields key={t} def={sectionFor(t)} values={(draft.sections[t] || {}) as Record<string, unknown>} onChange={(v) => set('sections', { ...draft.sections, [t]: v })} readOnly={readOnly} scenario={scenario} testID={`${testID}-section-${t.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} tz={draft.tz} dateISO={eventAt} />
      ))) : null}

      <View style={{ marginBottom: space.md }}>
        <Row gap={6} style={{ marginBottom: 4 }}>
          <Ionicons name="create-outline" size={20} color={c.primary} />
          <Text variant="h3">HANDLER COMMENTS</Text>
        </Row>
        <TextArea label="Handler Comments" value={draft.comments} onChangeText={(v) => set('comments', v)} maxLength={COMMENTS_MAX} minHeight={160} testID={`${testID}-comments`} editable={!readOnly} error={errors.comments} right={!readOnly ? <UseTemplateLink onPress={() => setTplOpen(true)} testID={`${testID}-comments-template`} /> : undefined} help={scenario ? 'One narrative for the whole scenario — the vendor’s example begins “SCENARIO synopsis: …”.' : undefined} />
        <TemplatePicker visible={tplOpen} onClose={() => setTplOpen(false)} scope="comments" currentText={draft.comments} previous={previous} onInsert={(t) => set('comments', draft.comments ? `${draft.comments}\n${t}` : t)} testID={`${testID}-templates`} />
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel="Exercise Summary (for review only)" accessibilityState={{ expanded: summaryOpen }} testID={`${testID}-summary-toggle`} onPress={() => setSummaryOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space.sm, marginBottom: space.sm }}>
        <Ionicons name="list-outline" size={22} color={c.primary} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>Exercise Summary (for review only)</Text>
        <Ionicons name={summaryOpen ? 'chevron-up' : 'chevron-down'} size={22} color={c.muted} />
      </Pressable>
      {summaryOpen ? <TextArea label="Exercise Summary" value={draft.summary} onChangeText={(v) => set('summary', v)} minHeight={80} testID={`${testID}-summary`} editable={!readOnly} help="A short summary shown to the reviewing supervisor or trainer." /> : null}

      <Row gap={6} style={{ marginBottom: 4 }}>
        <Ionicons name="attach-outline" size={20} color={c.primary} />
        <Text variant="h3">SUPPLEMENTAL FILES</Text>
      </Row>
      <FilesField ownerType="completion" ownerId={draft.id} ids={draft.files} onChange={(ids) => set('files', ids)} readOnly={readOnly} label="Photos, video and documents" testID={`${testID}-files`} />
    </View>
  );
}
