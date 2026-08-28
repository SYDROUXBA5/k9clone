// DEPLOYMENT record editor — General → one section per patrol type (or Indications & Items for
// detection) → People Found or Arrested → Weather → Supplemental Files → Summary, with `Save draft`
// (Incomplete) and `SUBMITTED` (complete + Not Reviewed). Desktop: left rail (summary card + section
// list with ✓ / pencil) and the sections on the right; phone: the same sections stacked, same order.
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useList, useRecord, useRepo } from '@/db/provider';
import type { Deployment, ExerciseKind, RequestFulfillment } from '@/db/types';
import { uuid } from '@/db/util';
import { DEPLOYMENT_TAGS, REQUEST_FULFILLMENT } from '@/db/vocab';
import { useAuth, useVisibleUserIds } from '@/features/auth/AuthProvider';
import { RoleClosed, canAuthorRecords } from '@/features/nav/RoleGuard';
import {
  Banner, Button, Card, ConfirmDialog, DateTimeField, EmptyState, Muted, Row, Screen, Segmented, Select, Text, TextField, VocabMultiSelect, VocabSelect,
  fmtDateTime, useColors, useIsDesktop, useToast, radius, space,
} from '@/ui';
import {
  DEPLOYMENT_KINDS, DEPLOYMENT_NARRATIVE_SAMPLES, DEPLOYMENT_SECTION_TYPES, REASONS_FOR_DEPLOYMENT, REQUEST_FULFILLMENT_LABEL, CASE_NUMBER_MAX,
  demographicsInReports, deploymentTitle, deploymentTypeLabel, describeErrors, dogsActiveOn, draftFromRecord, emptyDraft, emptySection, isDeployed, lastWithRequestingUnit, prefillFrom, toRecord,
  validateDraft, validateSubmit, type DeploymentDraft, type DraftErrors,
} from './deploymentModel';
import { AttachmentsField } from './fields/AttachmentsField';
import { LocationField } from './fields/LocationField';
import { NarrativeField } from './fields/NarrativeField';
import { WeatherBlock } from './fields/WeatherBlock';
import { RejectionBanner, ReviewPills, TrainerComments, submissionStatus } from './ReviewPanel';
import { ArrestsBlock } from './sections/ArrestsBlock';
import { DetectionSection } from './sections/DetectionSection';
import { PatrolSectionFields } from './sections/PatrolSections';
import { TrackingMapSection } from '@/features/tracking';

export function DeploymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const record = useRecord('deployment', isNew ? null : id);
  const visible = useVisibleUserIds();
  const { role } = useAuth();
  if (isNew && !canAuthorRecords(role)) return <RoleClosed title="Add Deployment Record" />;
  // another handler's record is "not found" for this viewer — never show someone else's case, dog or arrests
  if (!isNew && (!record || !visible.includes(record.owner_user_id))) {
    return (
      <Screen title="Deployment" testID="screen-deployment-missing">
        <EmptyState icon="shield-half-outline" title="Deployment record not found" body="It may have been deleted. Deleted records stay in History." />
      </Screen>
    );
  }
  return <DeploymentForm key={record?.id || 'new'} record={record || null} />;
}

type SectionKey = { key: string; title: string; kind: 'general' | 'patrol' | 'detection' | 'people' | 'weather' | 'files' | 'summary' };

function DeploymentForm({ record }: { record: Deployment | null }) {
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const desktop = useIsDesktop();
  const { user, role, seatExpired } = useAuth();
  const ownerId = record?.owner_user_id || user?.id || '';
  const readOnly = role !== 'handler' || ownerId !== user?.id || (seatExpired && role === 'handler');
  const dogs = useList('dog', (d) => d.owner_user_id === ownerId);
  const owner = useList('user').find((u) => u.id === ownerId) || null;
  const mgmt = useList('management_group', (g) => g.type === 'supervisor' && g.members.includes(ownerId));
  const hasSupervisor = mgmt.length > 0;
  const previous = useList('deployment', (d) => d.owner_user_id === ownerId && d.id !== record?.id).sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  const [recordId] = useState(() => record?.id || uuid());

  const defaultDog = dogs.find((d) => d.is_default && d.status === 'active') || dogs.find((d) => d.status === 'active') || dogs[0];
  const [prefilledFrom, setPrefilledFrom] = useState<Deployment | null>(() => (record ? null : lastWithRequestingUnit(previous)));
  const [draft, setDraft] = useState<DeploymentDraft>(() => {
    if (record) return draftFromRecord(record);
    const base = emptyDraft(defaultDog?.id || '');
    const prev = lastWithRequestingUnit(previous);
    return prev ? prefillFrom(prev, base) : base;
  });
  const [errors, setErrors] = useState<DraftErrors>({});
  const [errorList, setErrorList] = useState<string[]>([]);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingKind, setPendingKind] = useState<ExerciseKind | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(record?.updated_at || null);

  // The local store hydrates asynchronously, so `previous` / `dogs` can still be empty when the draft
  // state initialiser above runs. Apply the remembered values once the handler's earlier records
  // arrive, while the new form is still untouched (never overwrite something already typed).
  const prefillDone = useRef(false);
  const prevId = previous[0]?.id;
  useEffect(() => {
    if (record || prefillDone.current || dirty) return;
    const prev = lastWithRequestingUnit(previous);
    if (!prev && !defaultDog) return;
    prefillDone.current = true;
    if (prev) setPrefilledFrom(prev);
    setDraft((d) => {
      const next = { ...d };
      if (!next.requesting_unit && prev?.requesting_unit) next.requesting_unit = prev.requesting_unit;
      if (!next.dog_id && defaultDog) next.dog_id = defaultDog.id;
      return next;
    });
  }, [record, dirty, prevId, defaultDog]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Partial<DeploymentDraft>) => { setDraft((d) => ({ ...d, ...p })); setDirty(true); };
  const clearErr = (...keys: string[]) => { if (keys.some((k) => errors[k])) setErrors((e) => { const n = { ...e }; keys.forEach((k) => delete n[k]); return n; }); };
  const setSection = (type: string, sp: Record<string, unknown>) => { setDraft((d) => ({ ...d, sections: { ...d.sections, [type]: { ...(d.sections[type] || emptySection(type)), ...sp } } })); setDirty(true); };
  const setPatrolTypes = (types: string[]) => {
    const sections = { ...draft.sections };
    for (const t of types) if (!sections[t]) sections[t] = emptySection(t);
    patch({ patrol_types: types, sections });
    clearErr('patrol_types');
  };
  const dog = dogs.find((d) => d.id === draft.dog_id) || null;
  const activeDogs = dogsActiveOn(dogs, draft.occurred_at);
  const deployed = isDeployed(draft.request_fulfillment);
  const futureDate = !!draft.occurred_at && new Date(draft.occurred_at).getTime() > Date.now() + 60000;
  const detectionHasData = draft.detection.environments.length + draft.detection.indications.length + draft.detection.seizures.length > 0;
  const patrolHasData = draft.patrol_types.length > 0;
  const requestKind = (k: ExerciseKind) => {
    if (k === draft.kind) return;
    if ((k === 'patrol' && detectionHasData) || (k === 'detection' && patrolHasData)) setPendingKind(k);
    else patch({ kind: k });
  };

  // ordered section list — identical on phone and desktop
  const sections: SectionKey[] = useMemo(() => {
    const list: SectionKey[] = [{ key: 'general', title: 'GENERAL', kind: 'general' }];
    if (deployed) {
      if (draft.kind === 'patrol') {
        for (const p of draft.patrol_types) list.push({ key: `patrol-${p}`, title: p === 'Area Search for Humans' ? 'Human Search' : p, kind: 'patrol' });
        list.push({ key: 'people', title: 'People Found or Arrested', kind: 'people' });
      } else {
        list.push({ key: 'detection', title: 'Indications & Items', kind: 'detection' });
        list.push({ key: 'people', title: 'Dog-Assisted Arrests', kind: 'people' });
      }
      list.push({ key: 'weather', title: 'Weather', kind: 'weather' });
      list.push({ key: 'files', title: 'Supplemental Files', kind: 'files' });
    }
    list.push({ key: 'summary', title: 'Summary', kind: 'summary' });
    return list;
  }, [deployed, draft.kind, draft.patrol_types]);

  const sectionState = (s: SectionKey): 'done' | 'todo' | 'error' => {
    const has = (prefix: string) => Object.keys(errors).some((k) => k.startsWith(prefix));
    switch (s.kind) {
      case 'general': return errors.occurred_at || errors.dog_id || errors.request_fulfillment || errors.reason || errors.patrol_types ? 'error' : draft.occurred_at && draft.dog_id ? 'done' : 'todo';
      case 'patrol': { const p = s.key.slice(7); return has(`section-${p}-`) ? 'error' : Object.values(draft.sections[p] || {}).some((v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== '' && v !== false)) ? 'done' : 'todo'; }
      case 'detection': return has('env-') || has('ind-') || has('sz-') ? 'error' : detectionHasData ? 'done' : 'todo';
      case 'people': return errors.people_found || errors.arrests || has('arrest-') ? 'error' : draft.people_found != null || draft.arrests.length > 0 || draft.detection.dog_assisted_arrests != null ? 'done' : 'todo';
      case 'weather': return draft.weather?.conditions || draft.weather?.temp_c != null ? 'done' : 'todo';
      case 'files': return draft.files.length ? 'done' : 'todo';
      case 'summary': return errors.summary ? 'error' : draft.summary.trim() ? 'done' : 'todo';
    }
  };

  const save = async (mode: 'draft' | 'submit') => {
    const e = mode === 'draft' ? validateDraft(draft) : validateSubmit(draft);
    setErrors(e);
    const list = describeErrors(e);
    setErrorList(list);
    if (list.length) { toast.show(mode === 'draft' ? 'A required field is missing — see the list at the top.' : `${list.length} field${list.length > 1 ? 's' : ''} still needed before submitting.`, 'error'); return; }
    setSaving(mode);
    setSaveError(null);
    try {
      const row = toRecord(draft, { id: recordId, owner_user_id: ownerId, handler_id: ownerId }, mode, record);
      const label = deploymentTitle(row as Deployment);
      await repo.upsert('deployment', row, { label: mode === 'submit' && !record?.is_complete ? `${label} — SUBMITTED` : label });
      if (draft.location.address || draft.location.name) {
        const existing = repo.snapshot('location').find((l) => l.owner_user_id === ownerId && (l.address || '') === (draft.location.address || '') && l.name === draft.location.name);
        await repo.upsert('location', { ...(existing ? { id: existing.id, use_count: (existing.use_count || 0) + 1 } : { use_count: 1 }), ...draft.location, owner_user_id: ownerId, last_used_at: new Date().toISOString() }, { silent: true });
      }
      setDirty(false);
      setSavedAt(new Date().toISOString());
      toast.show(mode === 'submit' ? (hasSupervisor ? 'The deployment has been submitted for review' : 'The deployment has been submitted and marked complete') : 'Draft saved');
      if (!record) router.replace(`/records/deployment/${recordId}` as never);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveError(msg);
      toast.show(`Save failed — ${msg}`, 'error', { title: 'Retry', onPress: () => void save(mode) });
    } finally { setSaving(null); }
  };
  const remove = async () => {
    if (!record) return;
    setConfirmDelete(false);
    await repo.remove('deployment', record.id, { label: deploymentTitle(record) });
    toast.show('Deployment deleted — logged to History');
    router.replace('/records');
  };
  const clearPrefill = () => { setPrefilledFrom(null); setDraft(emptyDraft(defaultDog?.id || '')); setDirty(false); };

  const canSubmitLabel = 'SUBMITTED'; // exact label of the reference UI [INF]
  const status = record ? submissionStatus(record, hasSupervisor, draft.tz) : 'Not yet saved';

  const rail = (
    <View style={desktop ? { width: 300, marginRight: space.lg } : { marginBottom: space.md }}>
      <Card testID="card-deployment-summary" style={{ marginBottom: space.md }}>
        <Text variant="h3" testID="text-summary-case">Case: {draft.case_number.trim() || 'N/A'}</Text>
        <Muted>{draft.occurred_at ? fmtDateTime(draft.occurred_at, draft.tz) : 'No date yet'}</Muted>
        {draft.location.address || draft.location.name ? <Muted numberOfLines={2}>{[draft.location.name, draft.location.address].filter(Boolean).join(' — ')}</Muted> : null}
        <View style={{ marginTop: space.sm }}><ReviewPills record={record} isComplete={!!record?.is_complete} /></View>
        {record ? (
          <View style={{ marginTop: space.sm, gap: 2 }} testID="rows-deployment-view">
            <KV k="Requesting Agency" v={draft.requesting_unit || '—'} />
            <KV k="Tags" v={draft.tags.length ? draft.tags.join(', ') : '—'} />
            <KV k="Dog" v={dog?.name || '—'} />
            <KV k="Fulfillment State" v={REQUEST_FULFILLMENT_LABEL[draft.request_fulfillment]} />
            {deployed ? <KV k="Type" v={deploymentTypeLabel({ request_fulfillment: draft.request_fulfillment, kind: draft.kind, patrol_types: draft.patrol_types })} /> : null}
            <KV k="Report Complete" v={record.is_complete ? 'Yes' : 'No'} />
            <KV k="Report Reviewed" v={record.review === 'reviewed' ? 'Yes' : record.review === 'rejected' ? 'Rejected' : 'No'} />
            {deployed && draft.kind === 'patrol' && draft.reason ? <KV k="Reason For Deployment" v={draft.reason} /> : null}
          </View>
        ) : null}
      </Card>
      {desktop ? (
        <Card testID="list-deployment-sections" style={{ paddingVertical: space.sm }}>
          {sections.map((s, i) => {
            const st = sectionState(s);
            return (
              <View key={s.key} style={[styles.railItem, i < sections.length - 1 ? { borderBottomWidth: 1, borderBottomColor: c.border } : null]} testID={`rail-${s.key}`}>
                <Ionicons name={st === 'done' ? 'checkmark-circle' : st === 'error' ? 'alert-circle' : 'pencil-outline'} size={22} color={st === 'done' ? c.success : st === 'error' ? c.danger : c.muted} />
                <Text style={{ flex: 1 }}>{s.title}</Text>
              </View>
            );
          })}
        </Card>
      ) : null}
    </View>
  );

  const generalCard = (
    <SectionCard title="GENERAL" testID="section-general">
      {prefilledFrom && !record && draft.requesting_unit ? <Banner tone="info" testID="banner-prefilled" body={`Requesting Unit remembered from ${fmtDateTime(prefilledFrom.occurred_at, prefilledFrom.tz)}`} action={{ title: 'Clear', onPress: clearPrefill, testID: 'btn-clear-prefill' }} /> : null}
      <DateTimeField label="Date & Time" required value={{ at: draft.occurred_at, tz: draft.tz }} onChange={(v) => { patch({ occurred_at: v.at, tz: v.tz }); clearErr('occurred_at'); }} error={errors.occurred_at} testID="input-deployment-datetime" disabled={readOnly} showNow />
      {futureDate ? <Banner tone="warning" testID="banner-future-date" body="Warning: You've entered a FUTURE deployment date. Check your entry to confirm that this is what you want." /> : null}
      <LocationField value={draft.location} onChange={(v) => patch({ location: v })} disabled={readOnly} testID="deployment-location" />
      <TextField label="Case Number" value={draft.case_number} onChangeText={(v) => { patch({ case_number: v }); clearErr('case_number'); }} editable={!readOnly} testID="input-case-number" maxLength={CASE_NUMBER_MAX} error={errors.case_number} help="Generated by dispatch or your report software. With no case number, give a short deployment title or leave it blank." placeholder="e.g. SD-1493" />
      <VocabMultiSelect label="Tags" customType="deployment_tag" options={DEPLOYMENT_TAGS} values={draft.tags} onChange={(v) => patch({ tags: v })} disabled={readOnly} testID="select-tags" placeholder="Type to add a new tag" help="Tags are counted in the Deployment Summary report and can be filtered on the Records page." />
      <VocabSelect label="Requesting Unit/Agency" customType="requesting_unit" options={[]} value={draft.requesting_unit} onChange={(v) => patch({ requesting_unit: v })} disabled={readOnly} testID="select-requesting-unit" clearable placeholder="Select or type — e.g. School District #42, Self-Initiated" help="Remembered for next time; your supervisor can share department-standard values." />
      <Select label="Dog" required options={activeDogs.map((d) => ({ value: d.id, label: d.name + (d.is_default ? ' (default)' : '') }))} value={draft.dog_id} onChange={(v) => { patch({ dog_id: v }); clearErr('dog_id'); }} disabled={readOnly} testID="select-dog" allowCustom={false} error={errors.dog_id || (activeDogs.length === 0 ? "You don't have any active dogs configured for this deployment date" : undefined)} help={dogs.length > 1 ? 'Only relevant when you are assigned more than one dog.' : undefined} />
      <Select label="Request Fulfillment" required options={REQUEST_FULFILLMENT} value={draft.request_fulfillment} onChange={(v) => { patch({ request_fulfillment: v as RequestFulfillment }); clearErr('request_fulfillment'); }} disabled={readOnly} testID="select-request-fulfillment" allowCustom={false} error={errors.request_fulfillment} help="Deployments where the dog was not deployed at scene or the request was cancelled enroute keep only General and Summary; they do not contribute to the dog's deployment statistics but are counted at the top of the Deployment Summary report." />
      {!deployed ? <Banner tone="info" testID="banner-not-deployed" title={REQUEST_FULFILLMENT_LABEL[draft.request_fulfillment]} body="Patrol / detection sections are hidden for this record. It is saved and counted, but excluded from deployment statistics." /> : null}
      {deployed ? (
        <>
          <View style={{ marginBottom: space.md }}>
            <Text variant="label" style={{ marginBottom: 6 }}>Type <Text variant="label" color="accent">*</Text></Text>
            {readOnly ? <Text>{draft.kind === 'detection' ? 'Detection' : 'Patrol'}</Text> : <Segmented label="Type" options={DEPLOYMENT_KINDS} value={draft.kind} onChange={requestKind} testID="seg-type" />}
            <Muted style={{ marginTop: 4 }}>Detection = search by scent for explosives, illegal drugs, currency and people. Patrol = search, tracking and apprehension.</Muted>
          </View>
          {draft.kind === 'patrol' ? (
            <>
              <VocabSelect label="Reason For Deployment" required customType="deployment_reason" options={REASONS_FOR_DEPLOYMENT} value={draft.reason} onChange={(v) => { patch({ reason: v }); clearErr('reason'); }} disabled={readOnly} testID="select-reason" error={errors.reason} clearable maxLength={500} placeholder="Select or type — e.g. Business burglary alarm was activated" />
              <VocabMultiSelect label="Patrol Type" required customType="deployment_patrol_type" options={DEPLOYMENT_SECTION_TYPES.map((t) => ({ value: t, label: t, group: dog && dog.patrol_types.length && !dogSupports(dog.patrol_types, t) ? "Not in this dog's patrol types" : undefined }))} values={draft.patrol_types} onChange={setPatrolTypes} disabled={readOnly} testID="select-patrol-types" error={errors.patrol_types} allowCustom={false} placeholder="Please select a patrol type" help="Pick more than one for a scenario deployment — one section opens per type." />
            </>
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );

  return (
    <Screen
      title="Deployment"
      subtitle={record ? status : 'Only Date & Time, Dog and Request Fulfillment are needed to save a draft.'}
      testID={record ? 'screen-deployment' : 'screen-deployment-new'}
      maxWidth={1240}
      actions={(
        <Row wrap>
          <Button title="Close" variant="secondary" icon="close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/records'))} testID="btn-close-deployment" />
          {!readOnly ? <Button title={saving === 'draft' ? 'Saving…' : 'Save draft'} variant="secondary" onPress={() => void save('draft')} loading={saving === 'draft'} testID="btn-save-draft" /> : null}
          {!readOnly ? <Button title={canSubmitLabel} onPress={() => void save('submit')} loading={saving === 'submit'} testID="btn-submitted" accessibilityLabel="SUBMITTED — submit this record" /> : null}
        </Row>
      )}
    >
      {readOnly ? <Banner tone="info" testID="banner-readonly" body={role !== 'handler' ? "You are viewing a handler's deployment. Supervisors and trainers cannot edit handler data." : seatExpired ? 'Records are read-only until a subscription is active.' : 'You can only edit your own records.'} /> : null}
      {record ? <RejectionBanner record={record} /> : null}
      {record && record.review !== 'not_reviewed' && dirty && !readOnly ? <Banner tone="warning" testID="banner-rereview" body="This record was previously reviewed by your supervisor. If you save any changes the record will be set to Not Reviewed." /> : null}
      {saveError ? <Banner tone="danger" title="Save failed" body={saveError} action={{ title: 'Retry', onPress: () => void save(dirty ? 'draft' : 'submit') }} testID="banner-save-error" /> : null}
      {errorList.length ? (
        <Banner tone="danger" testID="banner-missing" title={errorList.length === 1 ? 'One field needs attention' : `${errorList.length} fields need attention`} body={<View>{errorList.map((m, i) => <Text key={i}>• {m}</Text>)}</View>} />
      ) : null}

      <View style={desktop ? { flexDirection: 'row', alignItems: 'flex-start' } : undefined}>
        {rail}
        <View style={{ flex: 1, minWidth: 0 }}>
          {generalCard}
          <TrackingMapSection trackId={record?.track_id} />
          {deployed && draft.kind === 'patrol' ? draft.patrol_types.map((p) => (
            <SectionCard key={p} title={p === 'Area Search for Humans' ? 'Human Search' : p} testID={`section-${p.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
              <PatrolSectionFields type={p} data={draft.sections[p] || emptySection(p)} onChange={(sp) => setSection(p, sp)} errors={errors} disabled={readOnly} />
            </SectionCard>
          )) : null}
          {deployed && draft.kind === 'detection' ? (
            <SectionCard title="Indications & Items" testID="section-indications">
              <DetectionSection data={draft.detection} onChange={(dp) => patch({ detection: { ...draft.detection, ...dp } })} errors={errors} disabled={readOnly} dogOdors={dog?.odor_types || []} ownerId={recordId} ownerUserId={ownerId} />
            </SectionCard>
          ) : null}
          {deployed ? (
            <SectionCard title={draft.kind === 'patrol' ? 'People Found or Arrested' : 'Dog-Assisted Arrests'} testID="section-people">
              <ArrestsBlock
                kind={draft.kind}
                occurredAt={draft.occurred_at}
                peopleFound={draft.people_found}
                peopleBitten={draft.people_unintentionally_bitten}
                dogAssistedArrests={draft.detection.dog_assisted_arrests}
                arrests={draft.arrests}
                onChange={(p) => { const { dog_assisted_arrests, ...rest } = p; patch({ ...rest, ...(dog_assisted_arrests !== undefined ? { detection: { ...draft.detection, dog_assisted_arrests } } : {}) }); clearErr('people_found', 'arrests'); }}
                errors={errors}
                disabled={readOnly}
                demographicsInReports={demographicsInReports(owner)}
              />
            </SectionCard>
          ) : null}
          {deployed ? (
            <SectionCard title="Weather" testID="section-weather">
              <WeatherBlock value={draft.weather} onChange={(w) => patch({ weather: w })} location={draft.location} occurredAt={draft.occurred_at} disabled={readOnly} autoFill={!record} />
            </SectionCard>
          ) : null}
          {deployed ? (
            <SectionCard title="Supplemental Files" testID="section-files">
              <AttachmentsField ownerType="deployment" ownerId={recordId} ownerUserId={ownerId} disabled={readOnly} files={draft.files} onFilesChange={(ids) => patch({ files: ids })} testID="deployment-files" label="" />
            </SectionCard>
          ) : null}
          <SectionCard title="Summary" testID="section-summary">
            <NarrativeField
              label="Notes"
              required
              value={draft.summary}
              onChange={(v) => { patch({ summary: v }); clearErr('summary'); }}
              error={errors.summary}
              help="Notes on the incident as a whole — the K9 team's successes, failures and final outcomes. Required to complete the record."
              testID="input-summary"
              disabled={readOnly}
              samples={DEPLOYMENT_NARRATIVE_SAMPLES}
              previous={previous.filter((p) => p.summary?.trim()).slice(0, 5).map((p) => ({ name: `${fmtDateTime(p.occurred_at, p.tz)} · ${p.case_number || 'N/A'}`, text: p.summary }))}
            />
          </SectionCard>

          {!readOnly ? (
            <Card testID="card-deployment-actions">
              <Row justify="space-between" wrap>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Muted testID="text-save-state">{dirty ? 'Unsaved changes' : savedAt ? `Saved ${fmtDateTime(savedAt)}` : 'Not yet saved'}</Muted>
                  <Muted>{hasSupervisor ? 'Submit this record for review once all form sections are saved.' : "Submit this record to complete it, even if you don't have a supervisor."}</Muted>
                </View>
                <Row wrap>
                  {record ? <Button title="Delete" variant="danger" icon="trash-outline" onPress={() => setConfirmDelete(true)} testID="btn-delete-deployment" /> : null}
                  <Button title={saving === 'draft' ? 'Saving…' : 'Save draft'} variant="secondary" onPress={() => void save('draft')} loading={saving === 'draft'} testID="btn-save-draft-bottom" />
                  <Button title={canSubmitLabel} onPress={() => void save('submit')} loading={saving === 'submit'} testID="btn-submitted-bottom" />
                </Row>
              </Row>
            </Card>
          ) : null}
          <TrainerComments recordType="deployment" recordId={record?.id || null} />
        </View>
      </View>

      <ConfirmDialog visible={confirmDelete} title="Delete this deployment record?" body="The record is removed from your list and the deletion is logged to History." onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} testID="dialog-delete-deployment" />
      <ConfirmDialog visible={!!pendingKind} title="Switch work mode?" body="Switching work mode and saving will clear any detection/patrol data you've already entered." confirmTitle="Switch" tone="primary" onCancel={() => setPendingKind(null)} onConfirm={() => { if (pendingKind) patch({ kind: pendingKind }); setPendingKind(null); }} testID="dialog-switch-kind" />
    </Screen>
  );
}

function dogSupports(dogTypes: string[], deploymentType: string): boolean {
  if (deploymentType === 'Non-Search') return true;
  if (deploymentType === 'Evidence Search') return dogTypes.includes('Area Search for Evidence') || dogTypes.includes('Evidence Search');
  return dogTypes.includes(deploymentType);
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <Muted style={{ width: 150 }}>{k}</Muted>
      <Text style={{ flex: 1 }}>{v}</Text>
    </View>
  );
}

export function SectionCard({ title, children, testID, right }: { title: string; children: React.ReactNode; testID?: string; right?: React.ReactNode }) {
  const c = useColors();
  return (
    <Card testID={testID} style={{ marginBottom: space.md, padding: 0, overflow: 'hidden' }}>
      <View style={[styles.sectionHead, { backgroundColor: c.primary }]}>
        <Text variant="h3" style={{ color: c.primaryText, flex: 1 }} accessibilityRole="header">{title}</Text>
        {right}
      </View>
      <View style={{ padding: space.md }}>{children}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  railItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 10, paddingHorizontal: space.xs, minHeight: 44 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 10, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
});
