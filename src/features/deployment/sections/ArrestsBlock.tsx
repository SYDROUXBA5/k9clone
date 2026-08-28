// `People Found or Arrested` block (bar §2.6.3): People Found (incl arrests) · People Unintentionally
// Bitten · Arrest #n - Subject Information (Race/Ethnicity · Sex At Birth · Age · Subject Was Bitten) ·
// + ARREST. On detection deployments the same list sits under `Dog-Assisted Arrests`. No Charges field
// (parity: the reference arrest group has none — DECISIONS E10). Subject Was Bitten is tri-state: an
// unanswered arrest never prints as "No" (bar §2.6.6 row 3).
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Arrest } from '@/db/types';
import { RACE_ETHNICITY, SEX_AT_BIRTH } from '@/db/vocab';
import { Banner, Button, ConfirmDialog, Muted, Row, Segmented, Text, VocabSelect, useColors, useIsDesktop, radius, space } from '@/ui';
import { DEMOGRAPHICS_CUTOVER, MAX_ARRESTS, newArrest } from '../deploymentModel';
import { NumberField } from '../fields/NumberField';

export function ArrestsBlock({ kind, occurredAt, peopleFound, peopleBitten, dogAssistedArrests, arrests, onChange, errors, disabled, demographicsInReports }: {
  kind: 'patrol' | 'detection';
  occurredAt: string | null;
  peopleFound: number | null; peopleBitten: number | null; dogAssistedArrests: number | null;
  arrests: Arrest[];
  onChange: (patch: { people_found?: number | null; people_unintentionally_bitten?: number | null; dog_assisted_arrests?: number | null; arrests?: Arrest[] }) => void;
  errors: Record<string, string>; disabled?: boolean; demographicsInReports: boolean;
}) {
  const c = useColors();
  const desktop = useIsDesktop();
  const [removeId, setRemoveId] = useState<string | null>(null);
  const beforeCutover = !!occurredAt && occurredAt.slice(0, 10) < DEMOGRAPHICS_CUTOVER;
  const setArrest = (id: string, patch: Partial<Arrest>) => onChange({ arrests: arrests.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const setDemo = (id: string, patch: Partial<Arrest['demographics']>) => onChange({ arrests: arrests.map((a) => (a.id === id ? { ...a, demographics: { ...a.demographics, ...patch } } : a)) });
  const add = () => onChange({ arrests: [...arrests, newArrest(arrests.length + 1)] });
  const remove = () => { if (removeId) onChange({ arrests: arrests.filter((a) => a.id !== removeId).map((a, i) => ({ ...a, n: i + 1 })) }); setRemoveId(null); };
  const twoCol = desktop ? { flexDirection: 'row' as const, gap: space.md, flexWrap: 'wrap' as const } : undefined;
  const col = desktop ? { flex: 1, minWidth: 180 } : undefined;
  const bittenArrests = arrests.filter((a) => a.subject_bitten === true).length;
  const ratio = peopleFound && peopleFound > 0 ? Math.round((bittenArrests / peopleFound) * 100) : null;
  return (
    <View testID="block-arrests">
      {kind === 'patrol' ? (
        <>
          <Muted style={{ marginBottom: space.sm }}>Record the people found and arrested during this deployment. List each arrested person with ADD ARREST. Do not count the same person twice.</Muted>
          <View style={twoCol}>
            <NumberField label="People Found (incl arrests)" required integer value={peopleFound} onChange={(v) => onChange({ people_found: v })} editable={!disabled} testID="input-people-found" error={errors.people_found} containerStyle={col} />
            <NumberField label="People Unintentionally Bitten" integer value={peopleBitten} onChange={(v) => onChange({ people_unintentionally_bitten: v })} editable={!disabled} testID="input-people-bitten" containerStyle={col} />
          </View>
          {ratio != null && arrests.length > 0 ? <Muted style={{ marginBottom: space.sm }} testID="text-bite-ratio">Bite ratio (arrests with bites ÷ people found): {ratio}%{ratio > 35 ? ' — above 35% may raise reliability questions in court.' : ''}</Muted> : null}
        </>
      ) : (
        <NumberField label="Dog-Assisted Arrests" integer value={dogAssistedArrests} onChange={(v) => onChange({ dog_assisted_arrests: v })} editable={!disabled} testID="input-dog-assisted-arrests" help="How many arrests did your dog contribute to during this deployment?" error={errors.dog_assisted_arrests} />
      )}
      {beforeCutover ? (
        <Banner tone="info" body={`NOTE: This deployment occurs before demographic arrest data collection began on ${DEMOGRAPHICS_CUTOVER.slice(5, 7)}/${DEMOGRAPHICS_CUTOVER.slice(8, 10)}/${DEMOGRAPHICS_CUTOVER.slice(0, 4)}. Demographic arrest data is not supported for it.`} testID="banner-demographics-cutover" />
      ) : (
        <Muted style={{ marginBottom: space.sm }} testID="text-demographics-note">Demographic data (Race/Ethnicity, Sex At Birth, Age) is required for every arrest. It is {demographicsInReports ? 'included in' : 'hidden from'} printed reports — change this under Profile.</Muted>
      )}
      {arrests.map((a) => (
        <View key={a.id} style={[styles.card, { borderColor: c.border, backgroundColor: c.surfaceAlt }]} testID={`card-arrest-${a.n}`}>
          <Row justify="space-between" style={{ marginBottom: space.sm }}>
            <Text variant="h3" testID={`title-arrest-${a.n}`}>Arrest #{a.n} - Subject Information</Text>
            {!disabled ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete Arrest ${a.n}`} testID={`btn-delete-arrest-${a.n}`} onPress={() => setRemoveId(a.id)} hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trash-outline" size={22} color={c.danger} />
              </Pressable>
            ) : null}
          </Row>
          {!beforeCutover ? (
            <>
              <View style={twoCol}>
                <VocabSelect label="Race/Ethnicity" required customType="race_ethnicity" options={RACE_ETHNICITY} value={a.demographics.race} onChange={(v) => setDemo(a.id, { race: v })} disabled={disabled} testID={`select-arrest-${a.n}-race`} error={errors[`arrest-${a.id}-race`]} containerStyle={col} />
                <VocabSelect label="Sex At Birth" required customType="sex_at_birth" options={SEX_AT_BIRTH} value={a.demographics.sex} onChange={(v) => setDemo(a.id, { sex: v })} disabled={disabled} testID={`select-arrest-${a.n}-sex`} error={errors[`arrest-${a.id}-sex`]} containerStyle={col} />
                <NumberField label="Age" required integer value={a.demographics.age} onChange={(v) => setDemo(a.id, { age: v })} editable={!disabled} testID={`input-arrest-${a.n}-age`} error={errors[`arrest-${a.id}-age`]} help="1–254" containerStyle={desktop ? { width: 140 } : undefined} />
              </View>
            </>
          ) : null}
          <View style={{ marginBottom: space.xs }}>
            <Text variant="label" style={{ marginBottom: 6 }}>Subject Was Bitten</Text>
            <Row gap={space.sm} align="center" wrap>
              <Segmented label={`Arrest ${a.n} subject was bitten`} options={BITTEN} value={a.subject_bitten === true ? 'yes' : a.subject_bitten === false ? 'no' : null} onChange={(v) => setArrest(a.id, { subject_bitten: v === 'yes' })} disabled={disabled} testID={`seg-arrest-${a.n}-bitten`} />
              {a.subject_bitten == null ? <Muted testID={`text-arrest-${a.n}-bitten-unset`}>Not answered</Muted> : null}
            </Row>
          </View>
        </View>
      ))}
      {errors.arrests ? <Text color="danger" style={{ marginBottom: space.sm }}>{errors.arrests}</Text> : null}
      {!disabled ? <Button title="+ ARREST" variant="secondary" onPress={add} disabled={arrests.length >= MAX_ARRESTS} testID="btn-add-arrest" style={{ alignSelf: 'flex-start' }} /> : null}
      {arrests.length === 0 ? <Muted style={{ marginTop: space.sm }} testID="text-no-arrests">No arrests recorded.</Muted> : null}
      <ConfirmDialog visible={!!removeId} title="Delete this arrest?" body="The arrest card is removed from the record. Save to keep the change." confirmTitle="Delete Arrest" onCancel={() => setRemoveId(null)} onConfirm={remove} testID="dialog-delete-arrest" />
    </View>
  );
}

const BITTEN = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] as const;

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginBottom: space.md },
});
