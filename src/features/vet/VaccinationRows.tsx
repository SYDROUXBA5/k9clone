// The `Vaccinations` sub-table on a vet visit: repeating rows of Type (grouped CORE / NON-CORE,
// custom values accepted), Given, Next Vaccination (auto +3 yr core / +1 yr non-core, editable) and
// a trash button per row (bar §2.8 rows 6–7).
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';
import { Badge, Button, DateTimeField, Muted, Row, Text, VocabSelect, useColors, useIsDesktop, radius, space } from '@/ui';
import {
  VACCINE_OPTIONS, defaultNextDue, isCoreVaccine, newVaccinationRow, type VaccinationDraft, type VetErrors,
} from './vetModel';

export function VaccinationRows({ rows, onChange, visitDate, errors, disabled, testID = 'vaccinations' }: {
  rows: VaccinationDraft[];
  onChange: (rows: VaccinationDraft[]) => void;
  visitDate: string | null;
  errors: VetErrors;
  disabled?: boolean;
  testID?: string;
}) {
  const c = useColors();
  const desktop = useIsDesktop();

  const patch = (id: string, p: Partial<VaccinationDraft>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const setType = (id: string, type: string) => {
    const core = isCoreVaccine(type);
    const row = rows.find((r) => r.id === id);
    const given = row?.given_at ?? visitDate;
    onChange(rows.map((r) => (r.id === id
      ? { ...r, type, core, given_at: given, next_due_at: r.next_due_touched ? r.next_due_at : defaultNextDue(given, core) }
      : r)));
  };
  const setGiven = (id: string, given: string | null) => {
    onChange(rows.map((r) => (r.id === id
      ? { ...r, given_at: given, next_due_at: r.next_due_touched ? r.next_due_at : defaultNextDue(given, r.core) }
      : r)));
  };

  return (
    <View testID={testID}>
      <Muted style={{ marginBottom: space.sm }}>
        Every dog should receive the four core vaccines — plus rabies, usually — every three years.
        The next date is filled in for you (+3 years core, +1 year non-core) and stays editable.
      </Muted>

      {rows.length === 0 ? (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: space.lg, alignItems: 'center' }} testID={`${testID}-empty`}>
          <Ionicons name="medkit-outline" size={26} color={c.muted} />
          <Muted style={{ marginTop: 4 }}>{disabled ? 'No vaccinations recorded on this visit.' : 'No vaccinations on this visit yet.'}</Muted>
        </View>
      ) : null}

      {rows.map((r, i) => {
        const key = `vax.${r.id}`;
        // One shot of a given vaccine per visit: the types already on this visit are listed but
        // greyed out, so the mistake is visible before it is made rather than caught on Save.
        const usedElsewhere = rows.filter((x) => x.id !== r.id && x.type.trim()).map((x) => x.type);
        return (
          <View key={r.id} testID={`${testID}-row-${i}`} style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: space.md, marginBottom: space.sm }}>
            <Row justify="space-between" style={{ marginBottom: space.sm }}>
              <Row gap={space.sm}>
                <Text variant="label">Vaccination {i + 1}</Text>
                {r.type ? <Badge tone={r.core ? 'primary' : 'muted'}>{r.core ? 'CORE' : 'NON-CORE'}</Badge> : null}
              </Row>
              {!disabled ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove vaccination ${r.type || i + 1}`}
                  testID={`btn-remove-vaccination-${i}`}
                  onPress={() => onChange(rows.filter((x) => x.id !== r.id))}
                  hitSlop={8}
                  style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="trash-outline" size={22} color={c.danger} />
                </Pressable>
              ) : null}
            </Row>
            <View style={desktop ? { flexDirection: 'row', gap: space.md } : undefined}>
              <View style={desktop ? { flex: 1.2, minWidth: 0 } : undefined}>
                <VocabSelect
                  label="Type"
                  required
                  customType="vaccine_type"
                  options={VACCINE_OPTIONS}
                  value={r.type}
                  onChange={(v) => setType(r.id, v)}
                  disabled={disabled}
                  disabledValues={usedElsewhere}
                  disabledHint="Already on this visit"
                  testID={`select-vaccination-type-${i}`}
                  error={errors[`${key}.type`]}
                  placeholder="Select or type a vaccine"
                  maxLength={80}
                  help="Which vaccine was given. CORE vaccines are the four every dog should carry plus rabies; anything else is NON-CORE. Type a vaccine that isn't listed and it is remembered for next time. A vaccine can only appear once on a visit."
                />
              </View>
              <View style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
                <DateTimeField
                  label="Given"
                  required
                  mode="date"
                  value={{ at: r.given_at, tz: 'UTC' }}
                  onChange={(v) => setGiven(r.id, v.at)}
                  disabled={disabled}
                  testID={`input-vaccination-given-${i}`}
                  error={errors[`${key}.given_at`]}
                  help="The day the shot went in. It defaults to the visit date — change it when the vet gave it on a different day, and the next date moves with it."
                />
              </View>
              <View style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
                <DateTimeField
                  label="Next Vaccination"
                  required
                  mode="date"
                  value={{ at: r.next_due_at, tz: 'UTC' }}
                  onChange={(v) => patch(r.id, { next_due_at: v.at, next_due_touched: true })}
                  disabled={disabled}
                  testID={`input-vaccination-next-${i}`}
                  error={errors[`${key}.next_due`]}
                  help={r.next_due_touched ? 'You set this date.' : r.type ? `Auto: +${r.core ? 3 : 1} year${r.core ? 's' : ''} (${r.core ? 'core' : 'non-core'}). Edit it if your vet says otherwise.` : 'Filled in once you pick a type.'}
                />
              </View>
            </View>
            {r.next_due_touched && !disabled ? (
              <Button
                title="Use the standard interval again"
                variant="ghost"
                onPress={() => patch(r.id, { next_due_at: defaultNextDue(r.given_at, r.core), next_due_touched: false })}
                testID={`btn-vaccination-reset-due-${i}`}
                style={{ alignSelf: 'flex-start' }}
              />
            ) : null}
          </View>
        );
      })}

      {!disabled ? (
        <Button
          title="Add vaccination"
          variant="secondary"
          icon="add-circle-outline"
          onPress={() => onChange([...rows, newVaccinationRow(visitDate)])}
          testID="btn-add-vaccination"
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
    </View>
  );
}
