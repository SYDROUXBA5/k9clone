// Dog add/edit form. Minimum required field = Name; a blank name never crashes — the form names it.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { useList, useRecord, useRepo } from '@/db/provider';
import type { Dog } from '@/db/types';
import { DOG_BREEDS, DOG_MAX_TEXT, DOG_PURPOSES, DOG_SEXES, ODOR_CATEGORIES, PATROL_TYPES } from '@/db/vocab';
import { deviceTimeZone } from '@/db/util';
import { useAuth } from '@/features/auth/AuthProvider';
import { DocumentsSection } from '@/features/profile/DocumentsSection';
import {
  Banner, Button, Card, ConfirmDialog, DateTimeField, EmptyState, Muted, Row, Screen, Section, Select, Switch, Table, Text, TextArea, TextField,
  VocabMultiSelect, VocabSelect, fmtDate, fromInputs, toDateInput, useToast, space,
} from '@/ui';

type Draft = Pick<Dog, 'name' | 'breed' | 'purpose' | 'sex' | 'dob' | 'patrol_types' | 'odor_types' | 'is_default' | 'notes' | 'date_started' | 'date_retired'>;
const EMPTY: Draft = { name: '', breed: '', purpose: '', sex: '', dob: null, patrol_types: [], odor_types: [], is_default: false, notes: '', date_started: null, date_retired: null };

/** Record Keeping Start Date defaults to today − 3 years on a new dog. */
function defaultStartDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 3);
  return d.toISOString().slice(0, 10);
}
const todayISO = () => new Date().toISOString().slice(0, 10);

export function DogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const dog = useRecord('dog', isNew ? null : id);
  if (!isNew && !dog) {
    return (
      <Screen title="Dog" testID="screen-dog-missing">
        <EmptyState title="Dog not found" body="It may have been deleted. Deleted dogs stay in History." />
      </Screen>
    );
  }
  return <DogForm key={dog?.id || 'new'} dog={dog} />;
}

function DogForm({ dog }: { dog: Dog | undefined }) {
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const { user, role } = useAuth();
  const readOnly = role !== 'handler' || (dog ? dog.owner_user_id !== user?.id : false);
  const [draft, setDraft] = useState<Draft>(dog ? { ...EMPTY, ...pickDraft(dog) } : { ...EMPTY, date_started: defaultStartDate() });
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);
  const vaccinations = useList('vaccination', (v) => v.dog_id === dog?.id).sort((a, b) => (a.next_due_at || '') < (b.next_due_at || '') ? -1 : 1);
  const documents = useList('document', (d) => d.owner_type === 'dog' && d.owner_id === dog?.id);
  const tz = deviceTimeZone();

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft((p) => ({ ...p, [k]: v })); setDirty(true); if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined })); };

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = 'Name is required';
    if (draft.name.trim().length > DOG_MAX_TEXT) e.name = `Name is limited to ${DOG_MAX_TEXT} characters`;
    if ((draft.breed || '').length > DOG_MAX_TEXT) e.breed = `Breed is limited to ${DOG_MAX_TEXT} characters`;
    if ((draft.purpose || '').length > DOG_MAX_TEXT) e.purpose = `Type / Purpose is limited to ${DOG_MAX_TEXT} characters`;
    if (draft.date_retired && draft.date_retired > todayISO()) e.date_retired = 'Record Keeping End Date cannot be in the future';
    if (draft.date_retired && draft.date_started && draft.date_retired < draft.date_started) e.date_retired = 'End Date cannot be before the Start Date';
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  // Active / Retired follows from the End Date: blank = active, set = retired.
  const derivedStatus: Dog['status'] = draft.date_retired ? 'retired' : 'active';

  const save = async () => {
    if (!validate()) { toast.show('Please fix the highlighted fields.', 'error'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await repo.upsert('dog', { ...(dog ? { id: dog.id } : {}), ...draft, name: draft.name.trim(), status: derivedStatus, owner_user_id: dog?.owner_user_id || user!.id }, { label: draft.name.trim() });
      if (draft.is_default) {
        for (const other of repo.snapshot('dog')) if (other.owner_user_id === user!.id && other.id !== saved.id && other.is_default) await repo.upsert('dog', { id: other.id, is_default: false }, { silent: true });
      }
      toast.show(dog ? `${saved.name} saved` : `${saved.name} added`);
      setDirty(false);
      if (!dog) router.replace(`/dogs/${saved.id}` as never);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveError(msg);
      toast.show(`Save failed — ${msg}`, 'error', { title: 'Retry', onPress: () => void save() });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!dog) return;
    setConfirmDelete(false);
    await repo.remove('dog', dog.id, { label: dog.name });
    toast.show(`${dog.name} deleted — logged to History`);
    router.replace('/dogs');
  };

  return (
    <Screen
      title={dog ? dog.name : 'Add dog'}
      subtitle={dog ? [dog.breed, dog.purpose, dog.status === 'retired' ? 'Retired' : 'Active'].filter(Boolean).join(' · ') : 'Only the name is required. Everything else can be added later.'}
      testID={dog ? 'screen-dog-detail' : 'screen-dog-new'}
      actions={(
        <Row>
          <Button title={dog ? 'Back' : 'Cancel'} variant="secondary" onPress={() => router.back()} testID="btn-back" />
          {!readOnly ? <Button title={saving ? 'Saving…' : 'Save'} onPress={save} loading={saving} disabled={dog ? !dirty : false} testID="btn-save-dog" /> : null}
        </Row>
      )}
    >
      {readOnly ? <Banner tone="info" body={dog && dog.owner_user_id !== user?.id ? "You are viewing another handler's dog. Supervisors and trainers cannot edit handler data." : 'Switch to the Handler role to edit dogs.'} testID="banner-readonly" /> : null}
      {saveError ? <Banner tone="danger" title="Save failed" body={saveError} action={{ title: 'Retry', onPress: () => void save() }} testID="banner-save-error" /> : null}
      <Card>
        <Section title="General" description="Your dog's name and basic attributes are visible to other members that train with you.">
          <TextField label="Name" required value={draft.name} onChangeText={(v) => set('name', v)} error={errors.name} testID="input-dog-name" editable={!readOnly} placeholder="e.g. Rook" autoCapitalize="words" maxLength={DOG_MAX_TEXT} />
          <VocabSelect label="Breed" customType="breed" options={DOG_BREEDS} value={draft.breed} onChange={(v) => set('breed', v)} testID="select-dog-breed" disabled={readOnly} clearable placeholder="Select or type a breed" error={errors.breed} maxLength={DOG_MAX_TEXT} help="e.g. Belgian Malinois, German Shepherd or Labrador Retriever." />
          <VocabSelect label="Type / Purpose" customType="dog_purpose" options={DOG_PURPOSES} value={draft.purpose || ''} onChange={(v) => set('purpose', v)} testID="select-dog-purpose" disabled={readOnly} clearable placeholder="Select or type a purpose" error={errors.purpose} maxLength={DOG_MAX_TEXT} help="e.g. Explosive Detection, Patrol Apprehension & Tracking, Dual Purpose (Narcotics/Patrol), Search & Rescue." />
          <Select label="Sex" options={DOG_SEXES} value={draft.sex} onChange={(v) => set('sex', v as Draft['sex'])} testID="select-dog-sex" disabled={readOnly} allowCustom={false} clearable />
          <DateTimeField label="Date of Birth" mode="date" value={{ at: draft.dob ? fromInputs(draft.dob, '12:00', tz) : null, tz }} onChange={(v) => set('dob', v.at ? toDateInput(v.at, tz) : null)} testID="input-dog-dob" readOnly={readOnly} help="Used to display the age of your dog." />
          {!readOnly ? <Switch label="This is my default dog" help="Your default dog appears as the first choice when selecting a dog in training and deployment records." value={!!draft.is_default} onChange={(v) => set('is_default', v)} testID="switch-dog-default" /> : null}
        </Section>
        <Section title="Record keeping" description="Records are only possible between these dates. Active or Retired follows from the End Date.">
          <DateTimeField label="Record Keeping Start Date" mode="date" required value={{ at: draft.date_started ? fromInputs(draft.date_started, '12:00', tz) : null, tz }} onChange={(v) => set('date_started', v.at ? toDateInput(v.at, tz) : null)} testID="input-dog-date-started" readOnly={readOnly} help="It will not be possible to add training or deployment records for this dog prior to the Record Keeping Start Date." error={errors.date_started} />
          <DateTimeField label="Record Keeping End Date" mode="date" value={{ at: draft.date_retired ? fromInputs(draft.date_retired, '12:00', tz) : null, tz }} onChange={(v) => set('date_retired', v.at ? toDateInput(v.at, tz) : null)} testID="input-dog-date-retired" readOnly={readOnly} help="Leave End Date blank if this dog is currently active. Setting it retires the dog; no future dates." error={errors.date_retired} />
          <Row gap={6}>
            <Muted>Status:</Muted>
            <Text variant="bodyStrong" testID="text-dog-status">{derivedStatus === 'retired' ? 'Retired' : 'Active'}</Text>
            {draft.date_retired && !readOnly ? <Button title="Clear End Date" variant="ghost" onPress={() => set('date_retired', null)} testID="btn-clear-end-date" /> : null}
          </Row>
        </Section>
        <Section title="Patrol types" description="For patrol and dual-purpose dogs only. Select all patrol exercise types this dog performs — only exercises of those types are visible for completion by this dog.">
          <VocabMultiSelect label="Patrol Types" customType="patrol_type" options={PATROL_TYPES} values={draft.patrol_types} onChange={(v) => set('patrol_types', v)} testID="select-dog-patrol-types" disabled={readOnly} placeholder="Add patrol types" />
        </Section>
        <Section title="Detection odor types" description="The dog's target odors. Odors in an exercise are categorised Target vs Proofing per dog from this list.">
          <VocabMultiSelect label="Detection Odor Types" customType="odor_category" options={ODOR_CATEGORIES} values={draft.odor_types} onChange={(v) => set('odor_types', v)} testID="select-dog-odor-types" disabled={readOnly} placeholder="Add target odors" />
          {dog && dirty && (JSON.stringify(dog.patrol_types) !== JSON.stringify(draft.patrol_types) || JSON.stringify(dog.odor_types) !== JSON.stringify(draft.odor_types)) ? (
            <Banner tone="warning" body="If you change the dog's patrol or odor type settings, exercises that no longer apply will hide their completion for this dog." />
          ) : null}
        </Section>
        <Section title="Notes">
          <TextArea label="Notes" value={draft.notes || ''} onChangeText={(v) => set('notes', v)} testID="input-dog-notes" editable={!readOnly} minHeight={90} />
        </Section>
        {!readOnly ? (
          <Row justify="space-between" wrap>
            {dog ? <Button title="Delete dog" variant="danger" icon="trash-outline" onPress={() => setConfirmDelete(true)} testID="btn-delete-dog" /> : <View />}
            <Button title={saving ? 'Saving…' : 'Save'} onPress={save} loading={saving} disabled={dog ? !dirty : false} testID="btn-save-dog-bottom" />
          </Row>
        ) : null}
      </Card>

      {dog ? (
        <>
          <Section title="Vaccination summary" description="Auto next-due: core every 3 years, non-core annual." style={{ marginTop: space.lg }}>
            <Table
              testID="table-dog-vaccinations"
              rows={vaccinations}
              keyOf={(v) => v.id}
              emptyText="No recorded vaccinations."
              columns={[
                { key: 'type', title: 'Vaccine', render: (v) => v.type },
                { key: 'core', title: 'Core', render: (v) => (v.core ? 'Core' : 'Non-core') },
                { key: 'given', title: 'Given', render: (v) => fmtDate(v.given_at, v.tz) },
                { key: 'due', title: 'Next due', render: (v) => <Text color={v.next_due_at && new Date(v.next_due_at).getTime() < Date.now() ? 'danger' : 'text'}>{fmtDate(v.next_due_at, v.tz)}{v.next_due_at && new Date(v.next_due_at).getTime() < Date.now() ? ' · Overdue' : ''}</Text> },
              ]}
            />
          </Section>
          <Section title="Documents" description="Certificates, photos and files for this dog, organised by category.">
            {/* The owner's own dog gets the full panel (add, rename, recategorise, delete). Anyone
                else — a supervisor or trainer looking at a handler's dog — sees the same documents
                read-only, because supervisors never edit handler data. */}
            {!readOnly && dog && user ? (
              <DocumentsSection userId={user.id} ownerType="dog" ownerId={dog.id} testID="section-dog-documents" />
            ) : documents.length ? (
              <Table testID="table-dog-documents" rows={documents} keyOf={(d) => d.id} columns={[{ key: 'name', title: 'Name', render: (d) => d.name }, { key: 'cat', title: 'Category', render: (d) => d.category }, { key: 'kind', title: 'Kind', render: (d) => d.kind }]} />
            ) : (
              <Card><Muted testID="text-docs-empty">No documents yet.</Muted></Card>
            )}
          </Section>
        </>
      ) : null}

      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete ${dog?.name || 'dog'}?`}
        body="The dog is removed from your list. Its records stay, and the deletion is logged to History."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
        testID="dialog-delete-dog"
      />
    </Screen>
  );
}

function pickDraft(d: Dog): Draft {
  return { name: d.name, breed: d.breed || '', purpose: d.purpose || '', sex: d.sex || '', dob: d.dob || null, patrol_types: d.patrol_types || [], odor_types: d.odor_types || [], is_default: !!d.is_default, notes: d.notes || '', date_started: d.date_started || null, date_retired: d.date_retired || (d.status === 'retired' ? todayISO() : null) };
}
