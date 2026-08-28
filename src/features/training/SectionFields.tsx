// Renders one patrol-type completion section from its SectionDef against a plain values object.
import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Checkbox, FieldShell, Muted, Row, Select, Text, TextField, VocabMultiSelect, space, useColors, radius, fromInputs, toTimeInput } from '@/ui';
import { mToMiles, mToYards } from '@/db/util';
import type { SectionDef, SectionField } from './patrolSections';

type Values = Record<string, unknown>;

export function SectionFields({ def, values, onChange, readOnly, scenario, testID, tz, dateISO }: {
  def: SectionDef; values: Values; onChange: (v: Values) => void; readOnly?: boolean; scenario?: boolean; testID: string; tz: string; dateISO: string | null;
}) {
  const c = useColors();
  const set = (k: string, v: unknown) => onChange({ ...values, [k]: v });
  return (
    <View testID={testID} style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surface, padding: space.md, marginBottom: space.md }}>
      <Text variant="h3" style={{ marginBottom: space.sm }} testID={`${testID}-header`}>{def.header}{scenario ? ' (Scenario)' : ' Training'}</Text>
      {!def.evidenced ? <Muted style={{ marginBottom: space.sm }}>Fields for this patrol type are our minimal set — the reference form was never published.</Muted> : null}
      {def.fields.map((f) => <FieldControl key={f.key} f={f} value={values[f.key]} onChange={(v) => set(f.key, v)} unit={typeof values[`${f.key}_unit`] === 'string' ? (values[`${f.key}_unit`] as string) : undefined} onUnit={(u) => set(`${f.key}_unit`, u)} readOnly={readOnly} testID={`${testID}-${f.key.replace(/_/g, '-')}`} tz={tz} dateISO={dateISO} />)}
    </View>
  );
}

function FieldControl({ f, value, onChange, unit: unitProp, onUnit, readOnly, testID, tz, dateISO }: { f: SectionField; value: unknown; onChange: (v: unknown) => void; unit?: string; onUnit: (u: string) => void; readOnly?: boolean; testID: string; tz: string; dateISO: string | null }) {
  const c = useColors();
  switch (f.kind) {
    case 'yesno': {
      const v = value === 'Yes' || value === true ? 'Yes' : value === 'No' || value === false ? 'No' : '';
      return (
        <FieldShell label={f.label} help={f.help}>
          <Row gap={space.sm} wrap>
            {['Yes', 'No'].map((o) => (
              <Button key={o} title={o} variant={v === o ? 'primary' : 'secondary'} onPress={() => !readOnly && onChange(v === o ? '' : o)} testID={`${testID}-${o.toLowerCase()}`} accessibilityLabel={`${f.label}: ${o}`} disabled={readOnly} />
            ))}
            {v ? null : <Muted>Not answered</Muted>}
          </Row>
        </FieldShell>
      );
    }
    case 'text':
      return <TextField label={f.label} value={typeof value === 'string' ? value : ''} onChangeText={onChange} testID={testID} editable={!readOnly} help={f.help} />;
    case 'number':
      return <TextField label={f.label} value={value == null || value === '' ? '' : String(value)} onChangeText={(t) => onChange(t.trim() === '' ? null : Number.isNaN(Number(t)) ? t : Number(t))} keyboardType="numeric" testID={testID} editable={!readOnly} help={f.help} />;
    case 'time': {
      const iso = typeof value === 'string' && value.includes('T') ? value : null;
      const shown = iso ? toTimeInput(iso, tz) : typeof value === 'string' ? value : '';
      return (
        <TextField
          label={f.label}
          value={shown}
          placeholder="HH:MM"
          onChangeText={(t) => {
            const day = dateISO ? dateISO.slice(0, 10) : new Date().toISOString().slice(0, 10);
            const parsed = /^\d{1,2}:\d{2}/.test(t.trim()) ? fromInputs(dateISO ? toDateInZone(dateISO, tz) : day, t.trim(), tz) : null;
            onChange(parsed || t);
          }}
          testID={testID}
          editable={!readOnly}
          help={f.help || 'Time on the day of the event (24-hour, e.g. 22:06).'}
        />
      );
    }
    case 'multi':
      return <VocabMultiSelect label={f.label} customType={f.customType || 'other'} options={(f.options || []) as readonly string[]} values={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} testID={testID} disabled={readOnly} help={f.help} />;
    case 'single':
      return <Select label={f.label} options={(f.options || []) as readonly { value: string; label: string; description?: string }[]} value={typeof value === 'string' ? value : ''} onChange={onChange} testID={testID} disabled={readOnly} clearable help={f.help} />;
    case 'checklist': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <FieldShell label={f.label} help={f.help}>
          <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: space.sm }}>
            {((f.options || []) as readonly string[]).map((o) => (
              <Checkbox key={o} label={o} value={arr.includes(o)} onChange={(v) => !readOnly && onChange(v ? [...arr, o] : arr.filter((x) => x !== o))} testID={`${testID}-${o.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} disabled={readOnly} />
            ))}
          </View>
        </FieldShell>
      );
    }
    case 'items': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <FieldShell label={f.label} help={f.help}>
          {arr.map((it, i) => (
            <Row key={i} align="flex-start" gap={space.sm}>
              <TextField label={`Item ${i + 1}`} value={it} onChangeText={(t) => onChange(arr.map((x, j) => (j === i ? t : x)))} testID={`${testID}-${i + 1}`} editable={!readOnly} containerStyle={{ flex: 1 }} />
              {!readOnly ? <Button title="Remove" variant="ghost" icon="trash-outline" onPress={() => onChange(arr.filter((_, j) => j !== i))} testID={`${testID}-remove-${i + 1}`} accessibilityLabel={`Remove item ${i + 1}`} style={{ marginTop: 26 }} /> : null}
            </Row>
          ))}
          {!readOnly ? <Button title={`+ Item ${arr.length + 1}`} variant="secondary" onPress={() => onChange([...arr, ''])} testID={`${testID}-add`} /> : arr.length ? null : <Muted>—</Muted>}
        </FieldShell>
      );
    }
    case 'number_unit':
      return <NumberUnitField f={f} value={value} onChange={onChange} unit={unitProp} onUnit={onUnit} readOnly={readOnly} testID={testID} />;
    default:
      return null;
  }
}

function toDateInZone(iso: string, tz: string): string {
  try {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    return f.format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** Number + display unit; stored metric (metres or square metres). Local text state so decimals type naturally. */
function NumberUnitField({ f, value, onChange, unit: unitProp, onUnit, readOnly, testID }: { f: SectionField; value: unknown; onChange: (v: unknown) => void; unit?: string; onUnit: (u: string) => void; readOnly?: boolean; testID: string }) {
  const units = (f.units || ['Miles']) as readonly string[];
  const isArea = f.key.includes('area');
  const stored = typeof value === 'number' ? value : null;
  const unit = unitProp && units.includes(unitProp) ? unitProp : units[0];
  const toShown = (m: number | null, u: string) => (m == null ? '' : String(isArea ? (u === 'Acres' ? Math.round((m / 4046.86) * 100) / 100 : Math.round(m * 1.19599)) : (u === 'Yards' ? mToYards(m) : mToMiles(m))));
  const [text, setText] = useState(toShown(stored, unit));
  const [seen, setSeen] = useState(`${stored}|${unit}`);
  const key = `${stored}|${unit}`;
  if (key !== seen) { setSeen(key); setText(toShown(stored, unit)); }
  return (
    <Row gap={space.sm} align="flex-start">
      <TextField
        label={f.label}
        value={text}
        keyboardType="numeric"
        onChangeText={(t) => {
          setText(t);
          if (t.trim() === '') { setSeen(`null|${unit}`); onChange(null); return; }
          const n = Number(t);
          if (Number.isNaN(n)) return;
          const metric = isArea ? (unit === 'Acres' ? n * 4046.86 : n / 1.19599) : (unit === 'Yards' ? n / 1.09361 : n * 1609.344);
          const rounded = Math.round(metric * 100) / 100;
          setSeen(`${rounded}|${unit}`);
          onChange(rounded);
        }}
        testID={testID}
        editable={!readOnly}
        containerStyle={{ flex: 1 }}
        help={f.help}
      />
      <Select label="Unit" options={units} value={unit} onChange={(u) => onUnit(u)} testID={`${testID}-unit`} allowCustom={false} disabled={readOnly} containerStyle={{ width: 150 }} />
    </Row>
  );
}
