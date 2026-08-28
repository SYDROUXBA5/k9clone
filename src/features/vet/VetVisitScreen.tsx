// VET VISIT record (bar §2.8 / PT-VET-01…08). Same shape as the other record editors: desktop keeps
// a left summary card and the form on the right; phone stacks the same fields in the same order.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useList, useRecord, useRepo } from '@/db/provider';
import type { Dog, VetVisit } from '@/db/types';
import { uuid } from '@/db/util';
import { CARE_TYPES } from '@/db/vocab';
import { useAuth, useVisibleUserIds } from '@/features/auth/AuthProvider';
import { RoleClosed, canAuthorRecords } from '@/features/nav/RoleGuard';
import { useSeatGate } from '@/features/billing/useSeatGate';
import { AttachmentsField } from '@/features/deployment/fields/AttachmentsField';
import { NarrativeField } from '@/features/deployment/fields/NarrativeField';
import { NumberField } from '@/features/deployment/fields/NumberField';
import { SectionCard } from '@/features/deployment/DeploymentScreen';
import {
  Badge, Banner, Button, Card, ConfirmDialog, DateTimeField, EmptyState, Muted, Row, Screen, Select, Text, TextField,
  VocabMultiSelect, fmtDate, fmtDateTime, useIsDesktop, useToast, space,
} from '@/ui';
import { VaccinationRows } from './VaccinationRows';
import { VaccinationSummaryCard } from './VaccinationSummary';
import {
  VET_NAME_MAX, VET_NOTES_SAMPLES, VET_TEXT_MAX, autoVetName, describeVetErrors, emptyVetDraft, kgFromLb,
  newVaccinationRow, prefillVetFrom, reflowVaccinations, toVaccinationRow, toVetVisit, validateVetDraft, vetDraftFromRecord,
  type VetDraft, type VetErrors,
} from './vetModel';

export function VetVisitScreen() {
  // `dog` / `due` arrive from the Vaccines page's "No — book" action, so booking a visit lands on a
  // form that already knows which dog and which vaccination the supervisor was looking at.
  const { id, dog: dogParam, due: dueParam, mode } = useLocalSearchParams<{ id: string; dog?: string; due?: string; mode?: string }>();
  const isNew = !id || id === 'new';
  const record = useRecord('vet_visit', isNew ? null : id);
  const visible = useVisibleUserIds();
  const { role } = useAuth();
  if (isNew && !canAuthorRecords(role)) return <RoleClosed title="Add Vet Visit" />;
  if (!isNew && (!record || !visible.includes(record.owner_user_id))) {
    return (
      <Screen title="Vet Visit" testID="screen-vet-missing">
        <EmptyState icon="medkit-outline" title="Vet visit not found" body="It may have been deleted. Deleted records stay in History." />
      </Screen>
    );
  }
  // A saved visit opens read-only, like every other saved record: `?mode=edit` (the row menu's Edit)
  // is what puts it into the editor, so nobody changes a vet record just by opening it.
  return <VetForm key={record?.id || 'new'} record={record || null} viewOnly={!isNew && mode !== 'edit'} dogParam={isNew ? dogParam : undefined} dueParam={isNew ? dueParam : undefined} />;
}

function VetForm({ record, viewOnly, dogParam, dueParam }: { record: VetVisit | null; viewOnly?: boolean; dogParam?: string; dueParam?: string }) {
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const desktop = useIsDesktop();
  const { user } = useAuth();
  const ownerId = record?.owner_user_id || user?.id || '';

  // The seat gate is the single source of truth for read-only (DECISIONS E19 / U7).
  const gate = useSeatGate({ ownerId });
  const readOnly = gate.readOnly || !!viewOnly;

  const allDogs = useList('dog', (d) => d.owner_user_id === ownerId);
  const activeDogs = useMemo(() => allDogs.filter((d) => d.status !== 'retired' || d.id === record?.dog_id), [allDogs, record?.dog_id]);
  const requestedDog = useMemo(() => (dogParam ? activeDogs.find((d) => d.id === dogParam) : undefined), [activeDogs, dogParam]);
  const defaultDog = useMemo(() => requestedDog || activeDogs.find((d) => d.is_default) || activeDogs[0], [activeDogs, requestedDog]);
  const savedVax = useList('vaccination', (v) => !!record && v.vet_visit_id === record.id);
  const previous = useList('vet_visit', (v) => v.owner_user_id === ownerId && v.id !== record?.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const [recordId] = useState(() => record?.id || uuid());
  const [prefilledFrom, setPrefilledFrom] = useState<VetVisit | null>(() => (!record && previous[0] ? previous[0] : null));
  const [draft, setDraft] = useState<VetDraft>(() => {
    if (record) return vetDraftFromRecord(record, repo.snapshot('vaccination').filter((v) => v.vet_visit_id === record.id));
    const base = emptyVetDraft(defaultDog?.id || '');
    const start = previous[0] ? prefillVetFrom(previous[0], base) : base;
    if (!dueParam) return start;
    // Booked straight off the Vaccines page: pre-load the care type and a row for the vaccine that is
    // due, so the visit that fixes the reminder is one tap from the reminder itself.
    const withCare = start.care_types.includes('Vaccinations') ? start : { ...start, care_types: [...start.care_types, 'Vaccinations'] };
    const already = withCare.vaccinations.some((v) => v.type === dueParam);
    return already ? withCare : { ...withCare, vaccinations: reflowVaccinations([...withCare.vaccinations, { ...newVaccinationRow(start.date), type: dueParam }]) };
  });
  const [errors, setErrors] = useState<VetErrors>({});
  const [errorList, setErrorList] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(record?.updated_at || null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dog: Dog | undefined = activeDogs.find((d) => d.id === draft.dog_id);

  const patch = (p: Partial<VetDraft>) => { setDraft((d) => ({ ...d, ...p })); setDirty(true); };
  const clearErr = (...keys: string[]) => {
    if (keys.some((k) => errors[k])) setErrors((e) => { const n = { ...e }; keys.forEach((k) => delete n[k]); return n; });
  };
  const setDate = (at: string | null, tz: string) => {
    setDraft((d) => {
      const name = d.name_auto ? autoVetName(at, tz) : d.name;
      const rows = reflowVaccinations(d.vaccinations.map((r) => (r.given_at ? r : { ...r, given_at: at })));
      return { ...d, date: at, tz, name, vaccinations: rows };
    });
    setDirty(true);
    clearErr('date');
  };

  const save = async () => {
    const e = validateVetDraft(draft);
    setErrors(e);
    const list = describeVetErrors(e);
    setErrorList(list);
    if (list.length) { toast.show(`${list.length} field${list.length > 1 ? 's need' : ' needs'} attention — see the list at the top.`, 'error'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const row = toVetVisit(draft, { id: recordId, owner_user_id: ownerId });
      await repo.upsert('vet_visit', row, { label: row.name || 'Vet visit' });
      // vaccinations: upsert every row, soft-delete the ones removed from the table
      const keep = new Set(draft.vaccinations.map((v) => v.id));
      for (const old of savedVax) if (!keep.has(old.id)) await repo.remove('vaccination', old.id, { label: `Vaccination: ${old.type}` });
      for (const v of draft.vaccinations) {
        await repo.upsert('vaccination', toVaccinationRow(v, { visitId: recordId, dogId: draft.dog_id, owner_user_id: ownerId, tz: draft.tz }), { label: `Vaccination: ${v.type}` });
      }
      setDirty(false);
      setSavedAt(new Date().toISOString());
      toast.show(record ? 'Vet visit saved' : 'Vet visit created');
      if (!record) router.replace(`/records/vet/${recordId}` as never);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveError(msg);
      toast.show(`Save failed — ${msg}`, 'error', { title: 'Retry', onPress: () => void save() });
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!record) return;
    setConfirmDelete(false);
    for (const v of savedVax) await repo.remove('vaccination', v.id, { label: `Vaccination: ${v.type}` });
    await repo.remove('vet_visit', record.id, { label: record.name || 'Vet visit' });
    toast.show('Vet visit deleted — logged to History');
    router.replace('/records');
  };

  const clearPrefill = () => { setPrefilledFrom(null); setDraft(emptyVetDraft(defaultDog?.id || '')); setDirty(false); };

  const summaryCard = (
    <View style={desktop ? { width: 320, marginRight: space.lg } : { marginBottom: space.md }}>
      <Card testID="card-vet-summary">
        <Text variant="h3" testID="text-vet-title">{draft.name.trim() || 'New vet visit'}</Text>
        <Muted>{draft.date ? fmtDateTime(draft.date, draft.tz) : 'No date yet'}</Muted>
        {draft.location.trim() ? <Muted numberOfLines={2}>{draft.location}</Muted> : null}
        <Row wrap gap={6} style={{ marginTop: space.sm }}>
          {dog ? <Badge testID="badge-vet-dog">K9 {dog.name}</Badge> : null}
          {draft.vaccinations.length ? <Badge tone="accent">{draft.vaccinations.length} vaccination{draft.vaccinations.length === 1 ? '' : 's'}</Badge> : null}
        </Row>
        {draft.care_types.length ? (
          <View style={{ marginTop: space.sm }}>
            <Muted>Care types</Muted>
            <Text testID="text-vet-care-types">{draft.care_types.join(', ')}</Text>
          </View>
        ) : null}
        {record ? (
          <Muted style={{ marginTop: space.sm }} testID="text-vet-created-by">
            CREATED BY {repo.getSync('user', record.owner_user_id)?.name || 'Unknown'}, {fmtDateTime(record.created_at, draft.tz)}
          </Muted>
        ) : null}
      </Card>
      {dog ? <View style={{ marginTop: space.md }}><VaccinationSummaryCard dog={dog} /></View> : null}
    </View>
  );

  return (
    <Screen
      title="Vet Visit"
      subtitle={!record ? 'Dog, date and at least one care type are needed to save.' : viewOnly ? 'Vet records look like any other record — they appear on the calendar and in reports.' : 'Editing — Save writes the change and logs it to History.'}
      testID={record ? 'screen-vet' : 'screen-vet-new'}
      maxWidth={1240}
      actions={(
        <Row wrap>
          <Button title="Close" variant="secondary" icon="close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/records'))} testID="btn-close-vet" />
          {viewOnly && !gate.readOnly && record ? (
            <Button title="Edit vet visit" icon="create-outline" onPress={() => router.replace(`/records/vet/${record.id}?mode=edit` as never)} testID="btn-edit-vet" />
          ) : null}
          {!readOnly ? <Button title={saving ? 'Saving…' : 'Save'} onPress={() => void save()} loading={saving} testID="btn-save-vet" /> : null}
        </Row>
      )}
    >
      {gate.readOnly ? (
        <Banner
          tone={gate.isBilling ? 'warning' : 'info'}
          testID="banner-readonly"
          title={gate.isBilling ? 'This record is read-only' : undefined}
          body={gate.reason}
          action={gate.isBilling ? { title: 'Billing', onPress: () => router.push('/billing' as never), testID: 'btn-readonly-billing' } : undefined}
        />
      ) : viewOnly && record ? (
        <Banner
          tone="info"
          testID="banner-vet-view-only"
          body="You are looking at a saved vet visit. Choose Edit vet visit to change it."
          action={{ title: 'Edit vet visit', onPress: () => router.replace(`/records/vet/${record.id}?mode=edit` as never), testID: 'btn-edit-vet-banner' }}
        />
      ) : null}
      {saveError ? <Banner tone="danger" title="Save failed" body={saveError} action={{ title: 'Retry', onPress: () => void save() }} testID="banner-save-error" /> : null}
      {errorList.length ? (
        <Banner tone="danger" testID="banner-missing" title={errorList.length === 1 ? 'One field needs attention' : `${errorList.length} fields need attention`} body={<View>{errorList.map((m, i) => <Text key={i}>• {m}</Text>)}</View>} />
      ) : null}

      <View style={desktop ? { flexDirection: 'row', alignItems: 'flex-start' } : undefined}>
        {summaryCard}
        <View style={{ flex: 1, minWidth: 0 }}>
          <SectionCard title="VET VISIT" testID="section-vet">
            {prefilledFrom && !record ? (
              <Banner tone="info" testID="banner-prefilled" body={`Pre-filled from ${fmtDate(prefilledFrom.date, prefilledFrom.tz)}`} action={{ title: 'Clear', onPress: clearPrefill, testID: 'btn-clear-prefill' }} />
            ) : null}
            <TextField
              label="Vet Visit Name"
              required
              value={draft.name}
              onChangeText={(v) => { setDraft((d) => ({ ...d, name: v, name_auto: false })); setDirty(true); clearErr('name'); }}
              editable={!readOnly}
              testID="input-vet-name"
              maxLength={VET_NAME_MAX}
              error={errors.name}
              help={draft.name_auto ? 'The name adjusts itself to the month of the visit — type your own to override it.' : 'You named this visit yourself.'}
              right={!draft.name_auto && !readOnly ? <Button title="Use auto name" variant="ghost" onPress={() => { setDraft((d) => ({ ...d, name: autoVetName(d.date, d.tz), name_auto: true })); setDirty(true); }} testID="btn-vet-auto-name" style={{ minHeight: 36, paddingVertical: 4 }} /> : undefined}
            />
            <Select
              label="Dog"
              required
              options={activeDogs.map((d) => ({ value: d.id, label: `${d.name}${d.is_default ? ' (default)' : ''}`, description: [d.breed, d.purpose].filter(Boolean).join(' · ') }))}
              allowCustom={false}
              value={draft.dog_id}
              onChange={(v) => { patch({ dog_id: v }); clearErr('dog_id'); }}
              disabled={readOnly}
              testID="select-vet-dog"
              error={errors.dog_id}
              placeholder="Please select an active dog"
              help="Your default dog is offered first. Retired dogs are not listed."
            />
            <TextField
              label="Location Name"
              value={draft.location}
              onChangeText={(v) => { patch({ location: v }); clearErr('location'); }}
              editable={!readOnly}
              testID="input-vet-location"
              maxLength={VET_TEXT_MAX}
              error={errors.location}
              placeholder="e.g. Sandy Creek Veterinary Clinic"
              help="Optional — the clinic or hospital that treated the dog."
            />
            <DateTimeField
              label="Date & Time"
              required
              value={{ at: draft.date, tz: draft.tz }}
              onChange={(v) => setDate(v.at, v.tz)}
              disabled={readOnly}
              testID="input-vet-datetime"
              error={errors.date}
              showNow
            />
            <VocabMultiSelect
              label="Veterinary Care Types"
              required
              customType="care_type"
              options={CARE_TYPES}
              values={draft.care_types}
              onChange={(v) => { patch({ care_types: v }); clearErr('care_types'); }}
              disabled={readOnly}
              testID="select-vet-care-types"
              error={errors.care_types}
              placeholder="Add at least one care type"
              help="Exam, vaccination, dental, injury, medication, surgery, heat or weight check… type your own and it is remembered."
              maxLength={80}
            />
            <NumberField
              label="Weight (lb)"
              value={draft.weight_lb}
              onChange={(v) => { patch({ weight_lb: v }); clearErr('weight_lb'); }}
              editable={!readOnly}
              testID="input-vet-weight"
              error={errors.weight_lb}
              help={draft.weight_lb != null ? `Shown in pounds, stored as ${kgFromLb(draft.weight_lb)?.toFixed(2)} kg.` : 'Optional. Entered in pounds, stored in kilograms.'}
            />
            <NumberField
              label="Cost (USD)"
              value={draft.cost}
              onChange={(v) => { patch({ cost: v }); clearErr('cost'); }}
              editable={!readOnly}
              testID="input-vet-cost"
              error={errors.cost}
              help="Optional — what the visit cost the unit."
            />
          </SectionCard>

          <SectionCard title="VACCINATIONS" testID="section-vaccinations">
            <VaccinationRows
              rows={draft.vaccinations}
              onChange={(rows) => patch({ vaccinations: rows })}
              visitDate={draft.date}
              errors={errors}
              disabled={readOnly}
            />
          </SectionCard>

          <SectionCard title="NOTES & FILES" testID="section-vet-notes">
            <NarrativeField
              label="Notes"
              value={draft.notes}
              onChange={(v) => patch({ notes: v })}
              disabled={readOnly}
              testID="input-vet-notes"
              samples={VET_NOTES_SAMPLES}
              previous={previous.filter((p) => p.notes?.trim()).slice(0, 5).map((p) => ({ name: `${fmtDate(p.date, p.tz)} · ${p.name}`, text: p.notes }))}
              templateScope="any"
              placeholder="Findings, treatment, medication, duty restrictions and the recheck date."
              minHeight={150}
              help="Notes print on the Vet Visit report."
            />
            <AttachmentsField ownerType="vet_visit" ownerId={recordId} ownerUserId={ownerId} disabled={readOnly} files={draft.files} onFilesChange={(ids) => patch({ files: ids })} testID="vet-files" label="Supplemental Files" />
          </SectionCard>

          {!readOnly ? (
            <Card testID="card-vet-actions">
              <Row justify="space-between" wrap>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Muted testID="text-save-state">{dirty ? 'Unsaved changes' : savedAt ? `Saved ${fmtDateTime(savedAt)}` : 'Not yet saved'}</Muted>
                  <Muted>Vaccination reminders are raised two weeks before the due date and again on the day it is due.</Muted>
                </View>
                <Row wrap>
                  {record ? <Button title="Delete" variant="danger" icon="trash-outline" onPress={() => setConfirmDelete(true)} testID="btn-delete-vet" /> : null}
                  <Button title={saving ? 'Saving…' : 'Save'} onPress={() => void save()} loading={saving} testID="btn-save-vet-bottom" />
                </Row>
              </Row>
            </Card>
          ) : null}
        </View>
      </View>

      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this vet visit?"
        body="The visit and its vaccination rows are removed from your records and the deletion is logged to History."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        testID="dialog-delete-vet"
      />
    </Screen>
  );
}
