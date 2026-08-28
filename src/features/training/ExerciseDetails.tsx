// Exercise Details editor (shared tab): Detection | Patrol toggle, Name, Monitor, Exercise Goal (+ USE TEMPLATE),
// Patrol-type rows (≥2 = Scenario), Detection builder (+ Environment → + <Env> with Odor → + Odor; Blank / Controlled
// Negative), computed "Applies to n / m dogs" footer. Read view lists the same facts as text.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';
import type { Dog, ExerciseEnvironment, OdorPlacement, User } from '@/db/types';
import { AMOUNT_UNITS, ENVIRONMENT_TYPES, ODOR_CATEGORIES, ODOR_TYPES, PACKAGING_DEFAULTS, PATROL_TYPES } from '@/db/vocab';
import { Badge, Button, Checkbox, Muted, Row, Segmented, Select, Text, TextArea, TextField, VocabSelect, space, useColors, radius } from '@/ui';
import { environmentSummary, exerciseAppliesToDog, isScenario, newEnvironment, newOdor, newUnit, odorCategoryForDog, type ExerciseDraft, type ExerciseErrors } from './logic';
import { TemplatePicker, UseTemplateLink } from './TemplatePicker';

const ODOR_CATEGORY_OPTIONS = [...ODOR_CATEGORIES, 'Proofing'];

export function ExerciseDetails({ draft, onChange, readOnly, dogs, allDogsAtEvent, dogOwners, monitors, errors, testID = 'details' }: {
  draft: ExerciseDraft; onChange: (d: ExerciseDraft) => void; readOnly?: boolean; dogs: Dog[];
  /** Every dog at the event (the `m` of "Applies to n / m dogs"); `dogs` is already filtered to the tab strip. */
  allDogsAtEvent?: Dog[]; dogOwners: Record<string, User | undefined>; monitors: string[]; errors: ExerciseErrors; testID?: string;
}) {
  const c = useColors();
  const [tplOpen, setTplOpen] = useState(false);
  const set = <K extends keyof ExerciseDraft>(k: K, v: ExerciseDraft[K]) => onChange({ ...draft, [k]: v });
  const atEvent = allDogsAtEvent && allDogsAtEvent.length ? allDogsAtEvent : dogs;
  const applies = atEvent.filter((d) => exerciseAppliesToDog(draft, d));
  const scenario = isScenario(draft);

  const setEnv = (id: string, patch: Partial<ExerciseEnvironment>) => set('environments', draft.environments.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeEnv = (id: string) => set('environments', draft.environments.filter((e) => e.id !== id));
  const addEnv = () => {
    const env = newEnvironment('Vehicle');
    env.units = [{ ...newUnit(''), odors: [newOdor('Drugs')] }];
    set('environments', [...draft.environments, env]);
  };
  const addUnit = (envId: string) => setEnv(envId, { units: [...(draft.environments.find((e) => e.id === envId)?.units || []), { ...newUnit(''), odors: [newOdor('Drugs')] }] });
  const setUnit = (envId: string, unitId: string, patch: Partial<ExerciseEnvironment['units'][number]>) => {
    const env = draft.environments.find((e) => e.id === envId)!;
    setEnv(envId, { units: env.units.map((u) => (u.id === unitId ? { ...u, ...patch } : u)) });
  };
  const removeUnit = (envId: string, unitId: string) => { const env = draft.environments.find((e) => e.id === envId)!; setEnv(envId, { units: env.units.filter((u) => u.id !== unitId) }); };
  const setOdor = (envId: string, unitId: string, odorId: string, patch: Partial<OdorPlacement>) => {
    const env = draft.environments.find((e) => e.id === envId)!;
    const unit = env.units.find((u) => u.id === unitId)!;
    setUnit(envId, unitId, { odors: unit.odors.map((o) => (o.id === odorId ? { ...o, ...patch } : o)) });
  };

  if (readOnly) return <DetailsReadView draft={draft} dogs={atEvent} dogOwners={dogOwners} testID={testID} />;

  return (
    <View testID={testID}>
      <Segmented label="Exercise type" options={[{ value: 'detection', label: 'Detection' }, { value: 'patrol', label: 'Patrol' }]} value={draft.kind} onChange={(v) => set('kind', v)} testID={`${testID}-kind`} />
      {errors.kind ? <Text color="danger" style={{ marginTop: 4 }}>{errors.kind}</Text> : null}
      <View style={{ height: space.md }} />
      <TextField label="Name" value={draft.name} onChangeText={(v) => set('name', v)} placeholder={draft.kind === 'detection' ? 'Detection Exercise (auto-named if blank)' : 'e.g. Patrol Scenario Exercise'} testID={`${testID}-name`} help="Left blank, the exercise is named by its type." />
      <Select label="Monitor" options={monitors} value={draft.monitor} onChange={(v) => set('monitor', v)} testID={`${testID}-monitor`} clearable placeholder="Who monitored the exercise (pick a member or type a name)" />
      <TextArea label="Exercise Goal" value={draft.goal} onChangeText={(v) => set('goal', v)} testID={`${testID}-goal`} minHeight={90} right={<UseTemplateLink onPress={() => setTplOpen(true)} testID={`${testID}-goal-template`} />} help="What will be done in this exercise. Shared with every handler at the event." />
      <TemplatePicker visible={tplOpen} onClose={() => setTplOpen(false)} scope="goal" currentText={draft.goal} onInsert={(t) => set('goal', draft.goal ? `${draft.goal}\n${t}` : t)} testID={`${testID}-goal-templates`} />

      {draft.kind === 'patrol' ? (
        <View style={{ marginBottom: space.md }}>
          <Row justify="space-between" wrap style={{ marginBottom: space.sm }}>
            <Text variant="h3">Patrol Types</Text>
            {scenario ? <Badge tone="accent" testID={`${testID}-scenario-badge`}>Scenario</Badge> : null}
          </Row>
          {draft.patrol_types.map((t, i) => (
            <Row key={i} align="flex-start" gap={space.sm}>
              <View style={{ flex: 1 }}>
                <VocabSelect label={`Patrol Type${scenario ? ' (Scenario)' : ''}`} customType="patrol_type" options={PATROL_TYPES} value={t} onChange={(v) => set('patrol_types', draft.patrol_types.map((x, j) => (j === i ? v : x)))} testID={`${testID}-patrol-type-${i + 1}`} required={i === 0} error={i === 0 ? errors.patrol_types : undefined} />
              </View>
              <Button title="Remove" variant="ghost" icon="trash-outline" onPress={() => set('patrol_types', draft.patrol_types.filter((_, j) => j !== i))} testID={`${testID}-patrol-type-remove-${i + 1}`} accessibilityLabel={`Remove patrol type ${i + 1}`} style={{ marginTop: 26 }} />
            </Row>
          ))}
          {draft.patrol_types.length === 0 && errors.patrol_types ? <Text color="danger" style={{ marginBottom: space.sm }}>{errors.patrol_types}</Text> : null}
          <Button title="+ Patrol Type" variant="secondary" onPress={() => set('patrol_types', [...draft.patrol_types, ''])} testID={`${testID}-add-patrol-type`} />
          {scenario ? <Muted style={{ marginTop: space.sm }}>These {draft.patrol_types.length} patrol types define a scenario exercise — the completion has one section per type and a single narrative.</Muted> : null}
        </View>
      ) : (
        <View style={{ marginBottom: space.md }}>
          <Text variant="h3" style={{ marginBottom: space.sm }}>Detection setup</Text>
          <Checkbox label="Blank / Controlled Negative" help="Tick for a sniff with no odor placed, or for a proofing-only exercise, so every detection dog completes it." value={draft.blank_controlled_negative} onChange={(v) => set('blank_controlled_negative', v)} testID={`${testID}-controlled-negative`} />
          {errors.environments ? <Text color="danger" style={{ marginBottom: space.sm }}>{errors.environments}</Text> : null}
          {draft.environments.map((env, ei) => (
            <View key={env.id} testID={`${testID}-env-${ei + 1}`} style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surfaceAlt, padding: space.md, marginBottom: space.sm }}>
              <Row justify="space-between" style={{ marginBottom: space.sm }}>
                <Text variant="bodyStrong">Environment {ei + 1}</Text>
                <Button title="Remove" variant="ghost" icon="trash-outline" onPress={() => removeEnv(env.id)} testID={`${testID}-env-${ei + 1}-remove`} accessibilityLabel={`Remove environment ${ei + 1}`} />
              </Row>
              <Row gap={space.sm} align="flex-start" wrap>
                <VocabSelect label="Environment type" required customType="environment_type" options={ENVIRONMENT_TYPES} value={env.env_type} onChange={(v) => setEnv(env.id, { env_type: v })} testID={`${testID}-env-${ei + 1}-type`} containerStyle={{ flex: 2, minWidth: 180 }} />
                <TextField label="Count" required value={env.count ? String(env.count) : ''} onChangeText={(v) => setEnv(env.id, { count: Math.max(0, parseInt(v || '0', 10) || 0) })} keyboardType="number-pad" testID={`${testID}-env-${ei + 1}-count`} containerStyle={{ width: 150 }} help="Total of this type" />
              </Row>
              <TextField label="Description" value={env.description || ''} onChangeText={(v) => setEnv(env.id, { description: v })} testID={`${testID}-env-${ei + 1}-description`} placeholder="Optional — e.g. north parking row" />
              {env.units.map((u, ui) => (
                <View key={u.id} testID={`${testID}-env-${ei + 1}-unit-${ui + 1}`} style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surface, padding: space.md, marginBottom: space.sm }}>
                  <Row align="flex-start" gap={space.sm}>
                    <TextField label={`${env.env_type || 'Unit'} with odor`} value={u.name} onChangeText={(v) => setUnit(env.id, u.id, { name: v })} placeholder={env.env_type === 'Vehicle' ? 'e.g. Ford Mustang' : env.env_type === 'Locker' ? 'e.g. Locker #23' : 'e.g. Pavilion area'} testID={`${testID}-env-${ei + 1}-unit-${ui + 1}-name`} containerStyle={{ flex: 1 }} />
                    <Button title="Remove" variant="ghost" icon="trash-outline" onPress={() => removeUnit(env.id, u.id)} testID={`${testID}-env-${ei + 1}-unit-${ui + 1}-remove`} accessibilityLabel={`Remove ${env.env_type} ${ui + 1}`} style={{ marginTop: 26 }} />
                  </Row>
                  {u.odors.map((o, oi) => (
                    <OdorRow key={o.id} odor={o} index={oi} dogs={dogs} error={errors.odors?.[o.id]} onChange={(patch) => setOdor(env.id, u.id, o.id, patch)} onRemove={() => setUnit(env.id, u.id, { odors: u.odors.filter((x) => x.id !== o.id) })} testID={`${testID}-env-${ei + 1}-unit-${ui + 1}-odor-${oi + 1}`} />
                  ))}
                  <Button title="+ Add Odor" variant="secondary" onPress={() => { const last = u.odors[u.odors.length - 1]; setUnit(env.id, u.id, { odors: [...u.odors, { ...newOdor(last?.category || 'Drugs'), unit: last?.unit || 'Grams', packaging: last?.packaging || '' }] }); }} testID={`${testID}-env-${ei + 1}-unit-${ui + 1}-add-odor`} />
                </View>
              ))}
              <Button title={`+ Add ${env.env_type || 'unit'} with odor`} variant="secondary" onPress={() => addUnit(env.id)} testID={`${testID}-env-${ei + 1}-add-unit`} />
              <Muted style={{ marginTop: space.sm }} testID={`${testID}-env-${ei + 1}-summary`}>{environmentSummary(env)}</Muted>
            </View>
          ))}
          <Button title="+ Add Environment" onPress={addEnv} testID={`${testID}-add-environment`} icon="add" variant={draft.environments.length ? 'secondary' : 'primary'} />
        </View>
      )}

      <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.sm }} testID={`${testID}-applies`}>
        <Text variant="bodyStrong">Applies to {applies.length} / {atEvent.length} dogs at this event:</Text>
        <Muted>{applies.length ? applies.map((d) => `${d.name}${dogOwners[d.owner_user_id] ? ` (${dogOwners[d.owner_user_id]!.name})` : ''}`).join(' · ') : 'no dog at this event matches this exercise yet'}</Muted>
        {atEvent.length > applies.length ? <Muted>Dogs whose patrol / detection odor types do not match are hidden from this exercise automatically.</Muted> : null}
      </View>
    </View>
  );
}

function OdorRow({ odor, index, dogs, error, onChange, onRemove, testID }: { odor: OdorPlacement; index: number; dogs: Dog[]; error?: string; onChange: (p: Partial<OdorPlacement>) => void; onRemove: () => void; testID: string }) {
  const c = useColors();
  const targetFor = dogs.filter((d) => odorCategoryForDog(odor, d) === 'Target').map((d) => d.name);
  const proofFor = dogs.filter((d) => odorCategoryForDog(odor, d) === 'Proofing').map((d) => d.name);
  const typeOptions = ODOR_TYPES[odor.category] || [];
  return (
    <View testID={testID} style={{ borderLeftWidth: 3, borderLeftColor: c.primarySoft, paddingLeft: space.sm, marginBottom: space.sm }}>
      <Row justify="space-between">
        <Text variant="label">Odor {index + 1}</Text>
        <Button title="Remove" variant="ghost" icon="trash-outline" onPress={onRemove} testID={`${testID}-remove`} accessibilityLabel={`Remove odor ${index + 1}`} />
      </Row>
      {error ? <Text color="danger" style={{ marginBottom: 4 }}>{error}</Text> : null}
      <Row gap={space.sm} align="flex-start" wrap>
        <VocabSelect label="Category" required customType="odor_category" options={ODOR_CATEGORY_OPTIONS} value={odor.category} onChange={(v) => onChange({ category: v })} testID={`${testID}-category`} containerStyle={{ flex: 1, minWidth: 160 }} />
        <VocabSelect label="Type" required customType="odor_type" options={typeOptions} value={odor.type} onChange={(v) => onChange({ type: v })} testID={`${testID}-type`} containerStyle={{ flex: 1, minWidth: 160 }} placeholder="Select or type an odor" />
      </Row>
      <Row gap={space.sm} align="flex-start" wrap>
        <TextField label="Amount" required value={odor.amount == null ? '' : String(odor.amount)} onChangeText={(v) => onChange({ amount: v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v) })} keyboardType="decimal-pad" testID={`${testID}-amount`} containerStyle={{ flex: 1, minWidth: 120 }} />
        <Select label="Unit" options={AMOUNT_UNITS} value={odor.unit} onChange={(v) => onChange({ unit: v })} testID={`${testID}-unit`} containerStyle={{ width: 130 }} />
        <VocabSelect label="Packaging" required customType="packaging" options={[...PACKAGING_DEFAULTS, 'None']} value={odor.packaging} onChange={(v) => onChange({ packaging: v })} testID={`${testID}-packaging`} containerStyle={{ flex: 1, minWidth: 160 }} clearable placeholder="Choose None for unpackaged" />
      </Row>
      <TextField label="Concealed location" required value={odor.concealed} onChangeText={(v) => onChange({ concealed: v })} placeholder="e.g. grill of the Ford Mustang" testID={`${testID}-concealed`} />
      {dogs.length ? (
        <Row gap={6} wrap style={{ marginBottom: 4 }}>
          <Ionicons name="pricetag-outline" size={16} color={c.muted} />
          <Muted testID={`${testID}-categorisation`}>{targetFor.length ? `Target odor for ${targetFor.join(', ')}` : 'Target odor for no dog here'}{proofFor.length ? ` · Proofing odor for ${proofFor.join(', ')}` : ''}</Muted>
        </Row>
      ) : null}
    </View>
  );
}

/** Details read view — `Type:` · `Monitor:` · `Controlled Negative:` · per-environment `Sniff of n …` + odor lines · Goal. */
export function DetailsReadView({ draft, dogs, dogOwners, testID }: { draft: ExerciseDraft; dogs: Dog[]; dogOwners: Record<string, User | undefined>; testID: string }) {
  const c = useColors();
  const applies = dogs.filter((d) => exerciseAppliesToDog(draft, d));
  const lines = detailsLines(draft);
  return (
    <View testID={`${testID}-readview`}>
      {lines.map((l, i) => (
        <Text key={i} style={{ marginBottom: 2, paddingLeft: l.startsWith('  ') ? space.md : 0, fontWeight: l.startsWith('# ') ? '600' : '400' }}>{l.replace(/^# /, '').trimStart()}</Text>
      ))}
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.sm, marginTop: space.sm }}>
        <Text variant="bodyStrong">Applies to {applies.length} / {dogs.length} dogs at this event:</Text>
        <Muted>{applies.length ? applies.map((d) => `${d.name}${dogOwners[d.owner_user_id] ? ` (${dogOwners[d.owner_user_id]!.name})` : ''}`).join(' · ') : '—'}</Muted>
      </View>
    </View>
  );
}

/** Text lines for the read view and for the outdated red/green diff (U5). */
export function detailsLines(x: Pick<ExerciseDraft, 'kind' | 'monitor' | 'goal' | 'patrol_types' | 'environments' | 'blank_controlled_negative'>): string[] {
  const out: string[] = [];
  out.push(`Type: ${x.kind === 'detection' ? 'Detection' : isScenario(x) ? 'Patrol Scenario' : 'Patrol'}`);
  if (x.monitor) out.push(`Monitor: ${x.monitor}`);
  if (x.kind === 'patrol') out.push(`Patrol Types: ${(x.patrol_types || []).filter(Boolean).join(', ') || '—'}`);
  else {
    out.push(`Controlled Negative: ${x.blank_controlled_negative ? 'Yes' : 'No'}`);
    for (const env of x.environments || []) {
      out.push(`# ${environmentSummary(env)}${env.description ? ` — ${env.description}` : ''}`);
      for (const u of env.units || []) {
        out.push(`  ${u.name || `${env.env_type} (unnamed)`}`);
        for (const o of u.odors || []) {
          out.push(`  ${o.category} odor: ${o.type || '—'}${o.amount != null ? `, ${o.amount} ${o.unit}` : ''}`);
          if (o.concealed) out.push(`    Concealed: ${o.concealed}`);
          if (o.packaging) out.push(`    Packaging: ${o.packaging}`);
        }
      }
    }
    if (!(x.environments || []).length) out.push('No environments — sniff with no odor placed.');
  }
  if (x.goal) out.push(`Goal: ${x.goal}`);
  return out;
}

export function odorSummaryLines(x: Pick<ExerciseDraft, 'environments'>, dog: Dog): string[] {
  const out: string[] = [];
  for (const env of x.environments || []) for (const u of env.units || []) for (const o of u.odors || []) {
    out.push(`${o.category}${o.type ? ` (${o.type})` : ''} odor in ${u.name || env.env_type}${o.amount != null ? `, ${o.amount} ${o.unit}` : ''}. Category: ${odorCategoryForDog(o, dog)} Odor`);
  }
  return out;
}
