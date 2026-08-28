// Detection deployment `Indications & Items` (bar §2.6.4, labels evidenced from the bundle; layout [INF]):
// ADD ENVIRONMENT (type + total number searched) → ADD INDICATION (name, description, vehicle details)
// → ADD SEIZURE INCIDENT (odor, type, amount + unit, packaging, concealed location, description, photo).
// Then the currency-not-indicated question and the alerts-without-seizure justification.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import { AMOUNT_UNITS, ENVIRONMENT_TYPES, ODOR_CATEGORIES, ODOR_TYPES, PACKAGING_DEFAULTS } from '@/db/vocab';
import { Banner, Button, ConfirmDialog, Muted, Row, Segmented, Select, Text, TextArea, TextField, VocabSelect, useColors, useIsDesktop, useToast, radius, space } from '@/ui';
import { CURRENCY_TYPES, VEHICLE_TYPES, newEnvironment, newIndication, newSeizure, type DetectionData, type DetectionEnvironment, type DetectionIndication, type SeizureIncident } from '../deploymentModel';
import { NumberField } from '../fields/NumberField';

const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] as const;
type YesNo = 'yes' | 'no';
const toYN = (b: boolean | null): YesNo | null => (b === true ? 'yes' : b === false ? 'no' : null);

export function DetectionSection({ data, onChange, errors, disabled, dogOdors, ownerId, ownerUserId }: { data: DetectionData; onChange: (patch: Partial<DetectionData>) => void; errors: Record<string, string>; disabled?: boolean; dogOdors: string[]; ownerId: string; ownerUserId: string }) {
  const c = useColors();
  const desktop = useIsDesktop();
  const [remove, setRemove] = useState<{ kind: 'env' | 'ind' | 'sz'; id: string } | null>(null);
  const twoCol = desktop ? { flexDirection: 'row' as const, gap: space.md, flexWrap: 'wrap' as const } : undefined;
  const col = desktop ? { flex: 1, minWidth: 180 } : undefined;

  const setEnv = (id: string, patch: Partial<DetectionEnvironment>) => onChange({ environments: data.environments.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const setInd = (id: string, patch: Partial<DetectionIndication>) => onChange({ indications: data.indications.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const setSz = (id: string, patch: Partial<SeizureIncident>) => onChange({ seizures: data.seizures.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const doRemove = () => {
    if (!remove) return;
    if (remove.kind === 'env') onChange({ environments: data.environments.filter((e) => e.id !== remove.id), indications: data.indications.map((i) => (i.environment_id === remove.id ? { ...i, environment_id: '' } : i)) });
    if (remove.kind === 'ind') onChange({ indications: data.indications.filter((e) => e.id !== remove.id), seizures: data.seizures.map((s) => (s.indication_id === remove.id ? { ...s, indication_id: '' } : s)) });
    if (remove.kind === 'sz') onChange({ seizures: data.seizures.filter((e) => e.id !== remove.id) });
    setRemove(null);
  };
  const envOptions = data.environments.map((e, i) => ({ value: e.id, label: `${e.env_type || 'Environment'} #${i + 1}` }));
  const indOptions = data.indications.map((e, i) => ({ value: e.id, label: e.name || `Indication #${i + 1}` }));
  const indicationsWithoutSeizure = data.indications.filter((i) => !data.seizures.some((s) => s.indication_id === i.id));
  const isDrugDog = dogOdors.includes('Drugs') || dogOdors.includes('Currency');
  const trash = (label: string, onPress: () => void, testID: string) => (!disabled ? (
    <Pressable accessibilityRole="button" accessibilityLabel={label} testID={testID} onPress={onPress} hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="trash-outline" size={22} color={c.danger} />
    </Pressable>
  ) : null);
  const totalSearched = data.environments.reduce((a, e) => a + (e.count || 0), 0);

  return (
    <View testID="section-detection">
      <Muted style={{ marginBottom: space.md }}>Add every environment searched (with and without indications), then each indication the K9 gave, then the seizure incidents for the items found.</Muted>

      {/* Environments */}
      <Row justify="space-between" style={{ marginBottom: space.sm }}>
        <Text variant="h3">Environments searched</Text>
        <Muted testID="text-env-total">{totalSearched} total</Muted>
      </Row>
      {data.environments.map((e, i) => (
        <View key={e.id} style={[styles.card, { borderColor: c.border, backgroundColor: c.surfaceAlt }]} testID={`card-env-${i + 1}`}>
          <Row justify="space-between"><Text variant="bodyStrong">Environment #{i + 1}</Text>{trash(`Delete environment ${i + 1}`, () => setRemove({ kind: 'env', id: e.id }), `btn-delete-env-${i + 1}`)}</Row>
          <View style={twoCol}>
            <VocabSelect label="Environment Type" required customType="environment_type" options={ENVIRONMENT_TYPES} value={e.env_type} onChange={(v) => setEnv(e.id, { env_type: v })} disabled={disabled} testID={`select-env-${i + 1}-type`} error={errors[`env-${e.id}-type`]} containerStyle={col} />
            <NumberField label="Total Number of This Type" required integer value={e.count} onChange={(v) => setEnv(e.id, { count: v })} editable={!disabled} testID={`input-env-${i + 1}-count`} error={errors[`env-${e.id}-count`]} help="Include all environments with and without indications" containerStyle={col} />
          </View>
        </View>
      ))}
      {!disabled ? <Button title="ADD ENVIRONMENT" variant="secondary" onPress={() => onChange({ environments: [...data.environments, newEnvironment()] })} testID="btn-add-environment" style={{ alignSelf: 'flex-start', marginBottom: space.lg }} /> : null}

      {/* Indications */}
      <Text variant="h3" style={{ marginBottom: space.sm }}>Alerts / Indications</Text>
      {data.indications.map((ind, i) => (
        <View key={ind.id} style={[styles.card, { borderColor: c.border, backgroundColor: c.surfaceAlt }]} testID={`card-indication-${i + 1}`}>
          <Row justify="space-between"><Text variant="bodyStrong">Indication #{i + 1}</Text>{trash(`Delete indication ${i + 1}`, () => setRemove({ kind: 'ind', id: ind.id }), `btn-delete-indication-${i + 1}`)}</Row>
          <TextField label="Name" required value={ind.name} onChangeText={(v) => setInd(ind.id, { name: v })} editable={!disabled} testID={`input-indication-${i + 1}-name`} maxLength={500} error={errors[`ind-${ind.id}-name`]} placeholder="e.g. Kitchen, Grey Samsonite carry-on, Locker #454" />
          <View style={twoCol}>
            <Select label="Environment" options={envOptions} value={ind.environment_id} onChange={(v) => { const env = data.environments.find((x) => x.id === v); setInd(ind.id, { environment_id: v, is_vehicle: env?.env_type === 'Vehicle' || ind.is_vehicle }); }} disabled={disabled || envOptions.length === 0} testID={`select-indication-${i + 1}-env`} allowCustom={false} clearable placeholder={envOptions.length ? 'Select…' : 'Add an environment first'} containerStyle={col} />
            <View style={[col, { justifyContent: 'center', minHeight: 48 }]}>
              <Segmented label="Vehicle indication" options={[{ value: 'yes', label: 'Vehicle' }, { value: 'no', label: 'Not a vehicle' }]} value={ind.is_vehicle ? 'yes' : 'no'} onChange={(v) => setInd(ind.id, { is_vehicle: v === 'yes' })} disabled={disabled} testID={`seg-indication-${i + 1}-vehicle`} />
            </View>
          </View>
          {ind.is_vehicle ? (
            <View style={twoCol}>
              <VocabSelect label="Vehicle Type" customType="vehicle_type" options={VEHICLE_TYPES} value={ind.vehicle.type} onChange={(v) => setInd(ind.id, { vehicle: { ...ind.vehicle, type: v } })} disabled={disabled} testID={`select-indication-${i + 1}-vehicle-type`} clearable containerStyle={col} />
              <TextField label="Vehicle Color" value={ind.vehicle.color} onChangeText={(v) => setInd(ind.id, { vehicle: { ...ind.vehicle, color: v } })} editable={!disabled} testID={`input-indication-${i + 1}-vehicle-color`} containerStyle={col} />
              <TextField label="Vehicle Make" required value={ind.vehicle.make} onChangeText={(v) => setInd(ind.id, { vehicle: { ...ind.vehicle, make: v } })} editable={!disabled} testID={`input-indication-${i + 1}-vehicle-make`} maxLength={50} error={errors[`ind-${ind.id}-vehicle`]} containerStyle={col} />
              <TextField label="Vehicle Model" required value={ind.vehicle.model} onChangeText={(v) => setInd(ind.id, { vehicle: { ...ind.vehicle, model: v } })} editable={!disabled} testID={`input-indication-${i + 1}-vehicle-model`} maxLength={50} containerStyle={col} />
              <TextField label="License Plate" value={ind.vehicle.plate} onChangeText={(v) => setInd(ind.id, { vehicle: { ...ind.vehicle, plate: v } })} editable={!disabled} testID={`input-indication-${i + 1}-vehicle-plate`} maxLength={20} autoCapitalize="characters" containerStyle={col} />
            </View>
          ) : null}
          <TextArea label="Description" value={ind.description} onChangeText={(v) => setInd(ind.id, { description: v })} editable={!disabled} testID={`input-indication-${i + 1}-description`} minHeight={72} placeholder="Environment Description (optional)" />
        </View>
      ))}
      {!disabled ? <Button title="ADD INDICATION" variant="secondary" onPress={() => onChange({ indications: [...data.indications, newIndication()] })} testID="btn-add-indication" style={{ alignSelf: 'flex-start', marginBottom: space.lg }} /> : null}

      {/* Seizure incidents */}
      <Text variant="h3" style={{ marginBottom: space.sm }}>Seizure Incidents (items seized)</Text>
      {data.seizures.map((sz, i) => {
        const types = ODOR_TYPES[sz.odor_category] || [];
        return (
          <View key={sz.id} style={[styles.card, { borderColor: c.border, backgroundColor: c.surfaceAlt }]} testID={`card-seizure-${i + 1}`}>
            <Row justify="space-between"><Text variant="bodyStrong">Seizure Incident #{i + 1}</Text>{trash(`Delete seizure incident ${i + 1}`, () => setRemove({ kind: 'sz', id: sz.id }), `btn-delete-seizure-${i + 1}`)}</Row>
            <Select label="For indication" options={indOptions} value={sz.indication_id} onChange={(v) => setSz(sz.id, { indication_id: v })} disabled={disabled || indOptions.length === 0} testID={`select-seizure-${i + 1}-indication`} allowCustom={false} clearable placeholder={indOptions.length ? 'Select…' : 'Add an indication first'} />
            <View style={twoCol}>
              <VocabSelect label="Odor" customType="odor_category" options={ODOR_CATEGORIES} value={sz.odor_category} onChange={(v) => setSz(sz.id, { odor_category: v, odor_type: '' })} disabled={disabled} testID={`select-seizure-${i + 1}-odor`} containerStyle={col} />
              <VocabSelect label="Type" required customType="odor_type" options={types} value={sz.odor_type} onChange={(v) => setSz(sz.id, { odor_type: v })} disabled={disabled} testID={`select-seizure-${i + 1}-type`} maxLength={45} error={errors[`sz-${sz.id}-type`]} placeholder="Select or type an odor type" containerStyle={col} />
            </View>
            <View style={twoCol}>
              <NumberField label="Amount" required value={sz.amount} onChange={(v) => setSz(sz.id, { amount: v })} editable={!disabled} testID={`input-seizure-${i + 1}-amount`} error={errors[`sz-${sz.id}-amount`]} containerStyle={col} />
              <Select label="Amount unit" required options={AMOUNT_UNITS} value={sz.unit} onChange={(v) => setSz(sz.id, { unit: v })} disabled={disabled} testID={`select-seizure-${i + 1}-unit`} error={errors[`sz-${sz.id}-unit`]} containerStyle={col} />
              <VocabSelect label="Packaging" required customType="packaging" options={[...PACKAGING_DEFAULTS, 'None']} value={sz.packaging} onChange={(v) => setSz(sz.id, { packaging: v })} disabled={disabled} testID={`select-seizure-${i + 1}-packaging`} maxLength={1000} error={errors[`sz-${sz.id}-packaging`]} containerStyle={col} />
            </View>
            <TextField label="Concealed Location" required value={sz.concealed_location} onChangeText={(v) => setSz(sz.id, { concealed_location: v })} editable={!disabled} testID={`input-seizure-${i + 1}-concealed`} maxLength={500} error={errors[`sz-${sz.id}-concealed`]} placeholder="e.g. Taped under the front passenger seat" />
            <TextArea label="Description" value={sz.description} onChangeText={(v) => setSz(sz.id, { description: v })} editable={!disabled} testID={`input-seizure-${i + 1}-description`} minHeight={72} />
            <SeizurePhoto seizure={sz} onChange={(photo_id) => setSz(sz.id, { photo_id })} disabled={disabled} index={i + 1} ownerId={ownerId} ownerUserId={ownerUserId} />
          </View>
        );
      })}
      {!disabled ? <Button title="ADD SEIZURE INCIDENT" variant="secondary" onPress={() => onChange({ seizures: [...data.seizures, { ...newSeizure(), indication_id: indicationsWithoutSeizure[0]?.id || '', odor_category: dogOdors[0] || '' }] })} testID="btn-add-seizure" style={{ alignSelf: 'flex-start', marginBottom: space.lg }} /> : null}

      {/* Currency + justification */}
      {isDrugDog ? (
        <View style={{ marginBottom: space.md }}>
          <Text variant="label" style={{ marginBottom: 6 }}>Was there currency present that your dog did not indicate to? (Drug detection dogs only.)</Text>
          <Segmented label="Currency present that the dog did not indicate to" options={YES_NO} value={toYN(data.currency_not_indicated)} onChange={(v) => onChange({ currency_not_indicated: v === 'yes' })} disabled={disabled} testID="seg-currency-not-indicated" />
          {data.currency_not_indicated ? (
            <View style={[twoCol, { marginTop: space.sm }]}>
              <NumberField label="Approximate Amount" value={data.currency_amount} onChange={(v) => onChange({ currency_amount: v })} editable={!disabled} testID="input-currency-amount" containerStyle={col} />
              <Select label="Currency type" options={CURRENCY_TYPES} value={data.currency_type} onChange={(v) => onChange({ currency_type: v })} disabled={disabled} testID="select-currency-type" containerStyle={col} />
            </View>
          ) : null}
        </View>
      ) : null}
      {indicationsWithoutSeizure.length > 0 ? (
        <Banner tone="warning" testID="banner-alerts-without-seizure" title="Alerts Without Items Seized" body={(
          <View>
            <Text style={{ marginBottom: space.sm }}>You recorded that an indication was made but no items were seized for that particular indication ({indicationsWithoutSeizure.map((i) => i.name || 'unnamed').join(', ')}). Do you have independent information that a target odor is present?</Text>
            <Segmented label="Independent information that a target odor is present" options={YES_NO} value={toYN(data.independent_information)} onChange={(v) => onChange({ independent_information: v === 'yes' })} disabled={disabled} testID="seg-independent-information" />
          </View>
        )} />
      ) : null}
      <ConfirmDialog visible={!!remove} title="Delete this item?" body="It is removed from the record. Save to keep the change." confirmTitle="Delete" onCancel={() => setRemove(null)} onConfirm={doRemove} testID="dialog-delete-detection-item" />
    </View>
  );
}

/** Seized Item Photo — one image Document per seizure incident (owner = the deployment, category "Seized Item Photo"). */
function SeizurePhoto({ seizure, onChange, disabled, index, ownerId, ownerUserId }: { seizure: SeizureIncident; onChange: (photoId: string | null) => void; disabled?: boolean; index: number; ownerId: string; ownerUserId: string }) {
  const c = useColors();
  const repo = useRepo();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const photo = useList('document', (d) => d.id === seizure.photo_id)[0] || null;
  const pick = async () => {
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: false, type: 'image/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      const doc = await repo.upsert('document', { owner_type: 'deployment', owner_id: ownerId, owner_user_id: ownerUserId, category: 'Seized Item Photo', kind: 'photo', name: a.name, uri: a.uri, mime: a.mimeType || undefined, size_bytes: a.size ?? undefined }, { label: `Seized item photo: ${a.name}` });
      onChange(doc.id);
      toast.show('Photo attached to the seizure incident');
    } catch (err) {
      toast.show(`Could not attach photo — ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    } finally { setBusy(false); }
  };
  const clear = async () => {
    if (photo) await repo.remove('document', photo.id, { label: `Seized item photo: ${photo.name}` });
    onChange(null);
  };
  return (
    <View style={{ marginTop: space.xs }} testID={`seizure-${index}-photo`}>
      <Text variant="label" style={{ marginBottom: 6 }}>Seized Item Photo</Text>
      <Row gap={space.sm} align="center" wrap>
        {photo ? (
          Platform.OS === 'web' && photo.uri ? <Image source={{ uri: photo.uri }} accessibilityLabel={`Seized item photo ${photo.name}`} style={{ width: 72, height: 72, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border }} /> : <Ionicons name="image-outline" size={28} color={c.primary} />
        ) : null}
        <Text style={{ flex: 1, minWidth: 120 }} numberOfLines={1}>{photo ? photo.name : 'No photo attached'}</Text>
        {!disabled ? <Button title={busy ? 'Opening…' : photo ? 'Replace photo' : 'Add photo'} variant="secondary" icon="camera-outline" onPress={() => void pick()} loading={busy} testID={`btn-seizure-${index}-photo`} /> : null}
        {!disabled && photo ? <Button title="Remove" variant="ghost" onPress={() => void clear()} testID={`btn-seizure-${index}-photo-remove`} /> : null}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginBottom: space.md },
});
