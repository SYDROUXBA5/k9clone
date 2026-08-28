// CLASS record editor (bar §2.7): Class Name* · Location Name · Instructor · Date & Time* · Duration
// (Hours:Mins) · Notes (USE TEMPLATE) · Supplemental Files, with `Save draft` (Incomplete) and
// `Submit` (complete + Not Reviewed). Desktop: left summary card (title, datetime, location, Complete
// chip, review pills) + the form on the right; phone: the same card then the same fields in the same order.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { useList, useRecord, useRepo } from '@/db/provider';
import type { ClassRecord } from '@/db/types';
import { uuid } from '@/db/util';
import { useAuth, useVisibleUserIds } from '@/features/auth/AuthProvider';
import { RoleClosed, canAuthorRecords } from '@/features/nav/RoleGuard';
import { SectionCard } from '@/features/deployment/DeploymentScreen';
import { AttachmentsField } from '@/features/deployment/fields/AttachmentsField';
import { NarrativeField } from '@/features/deployment/fields/NarrativeField';
import { NumberField } from '@/features/deployment/fields/NumberField';
import { RejectionBanner, ReviewPills, TrainerComments, submissionStatus } from '@/features/deployment/ReviewPanel';
import { Banner, Button, Card, ConfirmDialog, DateTimeField, EmptyState, Muted, Row, Screen, Text, TextField, VocabSelect, fmtDateTime, useIsDesktop, useToast, space } from '@/ui';
import {
  CLASS_NOTES_SAMPLES, CLASS_TEXT_MAX, CLASS_TITLE_MAX, classDraftFromRecord, classTitle, describeClassErrors, emptyClassDraft, fmtDuration, durationMinutes, prefillClassFrom,
  toClassRecord, validateClassDraft, validateClassSubmit, type ClassDraft, type ClassErrors,
} from './classModel';

export function ClassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const record = useRecord('class_record', isNew ? null : id);
  const visible = useVisibleUserIds();
  const { role } = useAuth();
  if (isNew && !canAuthorRecords(role)) return <RoleClosed title="Add Class Record" />;
  if (!isNew && (!record || !visible.includes(record.owner_user_id))) {
    return (
      <Screen title="Class" testID="screen-class-missing">
        <EmptyState icon="school-outline" title="Class record not found" body="It may have been deleted. Deleted records stay in History." />
      </Screen>
    );
  }
  return <ClassForm key={record?.id || 'new'} record={record || null} />;
}

function ClassForm({ record }: { record: ClassRecord | null }) {
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const desktop = useIsDesktop();
  const { user, role, seatExpired } = useAuth();
  const ownerId = record?.owner_user_id || user?.id || '';
  const readOnly = role !== 'handler' || ownerId !== user?.id || (seatExpired && role === 'handler');
  const mgmt = useList('management_group', (g) => g.type === 'supervisor' && g.members.includes(ownerId));
  const hasSupervisor = mgmt.length > 0;
  const previous = useList('class_record', (r) => r.owner_user_id === ownerId && r.id !== record?.id).sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  const [recordId] = useState(() => record?.id || uuid());

  const [prefilledFrom, setPrefilledFrom] = useState<ClassRecord | null>(() => (!record && previous[0] ? previous[0] : null));
  const [draft, setDraft] = useState<ClassDraft>(() => {
    if (record) return classDraftFromRecord(record);
    const base = emptyClassDraft();
    return previous[0] ? prefillClassFrom(previous[0], base) : base;
  });
  const [errors, setErrors] = useState<ClassErrors>({});
  const [errorList, setErrorList] = useState<string[]>([]);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(record?.updated_at || null);

  const patch = (p: Partial<ClassDraft>) => { setDraft((d) => ({ ...d, ...p })); setDirty(true); };
  const clearErr = (...keys: string[]) => { if (keys.some((k) => errors[k])) setErrors((e) => { const n = { ...e }; keys.forEach((k) => delete n[k]); return n; }); };
  const futureDate = !!draft.occurred_at && new Date(draft.occurred_at).getTime() > Date.now() + 60000;

  const save = async (mode: 'draft' | 'submit') => {
    const e = mode === 'draft' ? validateClassDraft(draft, record) : validateClassSubmit(draft, record);
    setErrors(e);
    const list = describeClassErrors(e);
    setErrorList(list);
    if (list.length) { toast.show(mode === 'draft' ? 'A required field is missing — see the list at the top.' : `${list.length} field${list.length > 1 ? 's' : ''} still needed before submitting.`, 'error'); return; }
    setSaving(mode);
    setSaveError(null);
    try {
      const row = toClassRecord(draft, { id: recordId, owner_user_id: ownerId }, mode, record);
      const label = classTitle(row as ClassRecord);
      await repo.upsert('class_record', row, { label: mode === 'submit' && !record?.is_complete ? `${label} — Submitted` : label });
      setDirty(false);
      setSavedAt(new Date().toISOString());
      toast.show(mode === 'submit' ? (hasSupervisor ? 'This record has been submitted for review' : 'This record has been submitted and marked complete') : 'Draft saved');
      if (!record) router.replace(`/records/class/${recordId}` as never);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveError(msg);
      toast.show(`Save failed — ${msg}`, 'error', { title: 'Retry', onPress: () => void save(mode) });
    } finally { setSaving(null); }
  };
  const remove = async () => {
    if (!record) return;
    setConfirmDelete(false);
    await repo.remove('class_record', record.id, { label: classTitle(record) });
    toast.show('Class record deleted — logged to History');
    router.replace('/records');
  };
  const clearPrefill = () => { setPrefilledFrom(null); setDraft(emptyClassDraft()); setDirty(false); };

  const status = record ? submissionStatus(record, hasSupervisor, draft.tz) : 'Not yet saved';
  const summaryCard = (
    <Card testID="card-class-summary" style={desktop ? { width: 300, marginRight: space.lg } : { marginBottom: space.md }}>
      <Text variant="h3" testID="text-class-title">{draft.title.trim() || 'New class'}</Text>
      <Muted>{draft.occurred_at ? fmtDateTime(draft.occurred_at, draft.tz) : 'No date yet'}</Muted>
      {draft.location.trim() ? <Muted numberOfLines={2}>{draft.location}</Muted> : null}
      <View style={{ marginTop: space.sm }}><ReviewPills record={record} isComplete={!!record?.is_complete} /></View>
      {record ? (
        <View style={{ marginTop: space.sm, gap: 2 }} testID="rows-class-view">
          <KV k="Instructor" v={draft.instructor.trim() || '—'} />
          <KV k="Duration" v={fmtDuration(durationMinutes(draft))} />
          <KV k="Report Complete" v={record.is_complete ? 'Yes' : 'No'} />
          <KV k="Report Reviewed" v={record.review === 'reviewed' ? 'Yes' : record.review === 'rejected' ? 'Rejected' : 'No'} />
        </View>
      ) : null}
      <Muted style={{ marginTop: space.sm }}>No dog is attached to a class — training without the dog. Classes count into Classes Attended and Total Class Duration.</Muted>
    </Card>
  );

  return (
    <Screen
      title="Class"
      subtitle={record ? status : 'Only Class Name and Date & Time are needed to save a draft.'}
      testID={record ? 'screen-class' : 'screen-class-new'}
      maxWidth={1240}
      actions={(
        <Row wrap>
          <Button title="Close" variant="secondary" icon="close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/records'))} testID="btn-close-class" />
          {!readOnly ? <Button title={saving === 'draft' ? 'Saving…' : 'Save draft'} variant="secondary" onPress={() => void save('draft')} loading={saving === 'draft'} testID="btn-save-draft" /> : null}
          {!readOnly ? <Button title="Submit" onPress={() => void save('submit')} loading={saving === 'submit'} testID="btn-submit" accessibilityLabel="Submit this record" /> : null}
        </Row>
      )}
    >
      {readOnly ? <Banner tone="info" testID="banner-readonly" body={role !== 'handler' ? "You are viewing a handler's class record. Supervisors and trainers cannot edit handler data." : seatExpired ? 'Records are read-only until a subscription is active.' : 'You can only edit your own records.'} /> : null}
      {record ? <RejectionBanner record={record} /> : null}
      {record && record.review !== 'not_reviewed' && dirty && !readOnly ? <Banner tone="warning" testID="banner-rereview" body="This record was previously reviewed by your supervisor. If you save any changes the record will be set to Not Reviewed." /> : null}
      {saveError ? <Banner tone="danger" title="Save failed" body={saveError} action={{ title: 'Retry', onPress: () => void save('draft') }} testID="banner-save-error" /> : null}
      {errorList.length ? (
        <Banner tone="danger" testID="banner-missing" title={errorList.length === 1 ? 'One field needs attention' : `${errorList.length} fields need attention`} body={<View>{errorList.map((m, i) => <Text key={i}>• {m}</Text>)}</View>} />
      ) : null}

      <View style={desktop ? { flexDirection: 'row', alignItems: 'flex-start' } : undefined}>
        {summaryCard}
        <View style={{ flex: 1, minWidth: 0 }}>
          <SectionCard title="CLASS" testID="section-class">
            {prefilledFrom && !record ? <Banner tone="info" testID="banner-prefilled" body={`Pre-filled from ${fmtDateTime(prefilledFrom.occurred_at, prefilledFrom.tz)}`} action={{ title: 'Clear', onPress: clearPrefill, testID: 'btn-clear-prefill' }} /> : null}
            <TextField label="Class Name" required value={draft.title} onChangeText={(v) => { patch({ title: v }); clearErr('title'); }} editable={!readOnly} testID="input-class-title" maxLength={CLASS_TITLE_MAX} error={errors.title} help="A specific class name, or a generic title covering a set of classroom activities." placeholder="e.g. Tracking training best practices" />
            <VocabSelect label="Location Name" customType="class_location" options={[]} value={draft.location} onChange={(v) => { patch({ location: v }); clearErr('location'); }} disabled={readOnly} testID="select-class-location" clearable maxLength={CLASS_TEXT_MAX} error={errors.location} placeholder="Select or type — e.g. Miami Beach Convention Center" help="Remembered for next time." />
            <VocabSelect label="Instructor" customType="class_instructor" options={[]} value={draft.instructor} onChange={(v) => { patch({ instructor: v }); clearErr('instructor'); }} disabled={readOnly} testID="select-class-instructor" clearable maxLength={CLASS_TEXT_MAX} error={errors.instructor} placeholder="Select or type the instructor's name" help="Remembered for next time." />
            <DateTimeField label="Date & Time" required value={{ at: draft.occurred_at, tz: draft.tz }} onChange={(v) => { patch({ occurred_at: v.at, tz: v.tz }); clearErr('occurred_at'); }} error={errors.occurred_at} testID="input-class-datetime" disabled={readOnly} showNow />
            {futureDate ? <Banner tone="warning" testID="banner-future-date" body="Warning: You've entered a FUTURE class date. Check your entry to confirm that this is what you want." /> : null}
            <View style={{ marginBottom: space.md }}>
              <Text variant="label" style={{ marginBottom: 6 }}>Duration (Hours:Mins)</Text>
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <NumberField label="Hours" hideLabel integer value={draft.duration_h} onChange={(v) => { patch({ duration_h: v }); clearErr('duration'); }} editable={!readOnly} testID="input-class-duration-hours" placeholder="Hours" containerStyle={{ flex: 1, marginBottom: 0 }} accessibilityLabel="Duration hours" />
                <Text style={{ alignSelf: 'center', fontSize: 20 }}>:</Text>
                <NumberField label="Minutes" hideLabel integer value={draft.duration_m} onChange={(v) => { patch({ duration_m: v }); clearErr('duration'); }} editable={!readOnly} testID="input-class-duration-mins" placeholder="Mins" containerStyle={{ flex: 1, marginBottom: 0 }} accessibilityLabel="Duration minutes" />
              </View>
              {errors.duration ? <Text color="danger" style={{ marginTop: 4 }}>{errors.duration}</Text> : <Muted style={{ marginTop: 4 }}>Drives Total Class Duration in the Training Summary{durationMinutes(draft) != null ? ` — ${fmtDuration(durationMinutes(draft))}` : ''}.</Muted>}
            </View>
            <NarrativeField
              label="Notes"
              required
              value={draft.notes}
              onChange={(v) => { patch({ notes: v }); clearErr('notes'); }}
              error={errors.notes}
              help="Notes are required to mark the training class record as complete. Once saved they cannot be cleared — type N/A if no notes were taken."
              testID="input-class-notes"
              disabled={readOnly}
              samples={CLASS_NOTES_SAMPLES}
              previous={previous.filter((p) => p.notes?.trim()).slice(0, 5).map((p) => ({ name: `${fmtDateTime(p.occurred_at, p.tz)} · ${p.title}`, text: p.notes }))}
              templateScope="class_notes"
              placeholder="What was covered, by whom, and what the K9 team takes away from it."
              minHeight={160}
            />
            <AttachmentsField ownerType="class" ownerId={recordId} ownerUserId={ownerId} disabled={readOnly} files={draft.files} onFilesChange={(ids) => patch({ files: ids })} testID="class-files" label="Supplemental Files" />
          </SectionCard>

          {!readOnly ? (
            <Card testID="card-class-actions">
              <Row justify="space-between" wrap>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Muted testID="text-save-state">{dirty ? 'Unsaved changes' : savedAt ? `Saved ${fmtDateTime(savedAt)}` : 'Not yet saved'}</Muted>
                  <Muted>{hasSupervisor ? 'Submit this record for review once it is complete. Classes may be reviewed or rejected by supervisors.' : "Submit this record to complete it, even if you don't have a supervisor."}</Muted>
                </View>
                <Row wrap>
                  {record ? <Button title="Delete" variant="danger" icon="trash-outline" onPress={() => setConfirmDelete(true)} testID="btn-delete-class" /> : null}
                  <Button title={saving === 'draft' ? 'Saving…' : 'Save draft'} variant="secondary" onPress={() => void save('draft')} loading={saving === 'draft'} testID="btn-save-draft-bottom" />
                  <Button title="Submit" onPress={() => void save('submit')} loading={saving === 'submit'} testID="btn-submit-bottom" />
                </Row>
              </Row>
            </Card>
          ) : null}
          <TrainerComments recordType="class" recordId={record?.id || null} />
        </View>
      </View>

      <ConfirmDialog visible={confirmDelete} title="Delete this class record?" body="The record is removed from your list and the deletion is logged to History." onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} testID="dialog-delete-class" />
    </Screen>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <Muted style={{ width: 130 }}>{k}</Muted>
      <Text style={{ flex: 1 }}>{v}</Text>
    </View>
  );
}
