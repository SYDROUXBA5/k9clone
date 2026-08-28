// DateTimeField (native): date + time text inputs. Stores instant + IANA zone. Web has its own
// implementation (DateTimeField.web.tsx) using DOM date/time inputs.
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { deviceTimeZone } from '@/db/util';
import { fromInputs, toDateInput, toTimeInput, tzShort, type Instant } from './datetime';
import { FieldShell } from './Field';
import { Muted, Text } from './Text';
import { useInputStyle } from './TextField';
import { useColors } from './theme';
import { space } from './tokens';

export interface DateTimeFieldProps {
  label: string;
  value: Instant;
  onChange: (v: Instant) => void;
  required?: boolean;
  error?: string | null;
  help?: string;
  testID?: string;
  mode?: 'datetime' | 'date';
  containerStyle?: object;
  /** Read-only view (another handler's record, or a supervisor): the inputs cannot be typed into. */
  readOnly?: boolean;
  /** Read-only rendering (supervisors / other owners): inputs cannot be edited. Alias of readOnly. */
  disabled?: boolean;
  /** Show a "Now" (or "Today" in date mode) button that resets the value to the current instant. */
  showNow?: boolean;
}

export function DateTimeField({ label, value, onChange, required, error, help, testID, mode = 'datetime', containerStyle, readOnly, disabled, showNow }: DateTimeFieldProps) {
  const c = useColors();
  // U3 named the locked state `readOnly`, U4 named it `disabled`; both props are honoured (merge superset).
  const locked = !!readOnly || !!disabled;
  const tz = value.tz || deviceTimeZone();
  const [date, setDate] = useState(toDateInput(value.at, tz));
  const [time, setTime] = useState(toTimeInput(value.at, tz));
  const setNow = () => { const now = new Date().toISOString(); setDate(toDateInput(now, tz)); setTime(toTimeInput(now, tz)); onChange({ at: now, tz }); };
  const [f1, setF1] = useState(false);
  const [f2, setF2] = useState(false);
  const s1 = useInputStyle(f1, error);
  const s2 = useInputStyle(f2, error);
  const commit = (d: string, t: string) => onChange({ at: fromInputs(d, mode === 'date' ? '00:00' : t || '00:00', tz), tz });
  return (
    <FieldShell label={label} required={required} error={error} help={help || `Time zone: ${tzShort(tz, value.at)}`} style={containerStyle}>
      <View style={styles.row}>
        <TextInput
          value={date}
          onChangeText={(v) => { setDate(v); commit(v, time); }}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={c.muted}
          accessibilityLabel={`${label} date`}
          testID={testID ? `${testID}-date` : undefined}
          keyboardType="numbers-and-punctuation"
          editable={!locked}
          onFocus={() => setF1(true)}
          onBlur={() => setF1(false)}
          style={[s1, { flex: 1 }, locked ? { backgroundColor: c.surfaceAlt, color: c.muted } : null]}
        />
        {mode === 'datetime' ? (
          <TextInput
            value={time}
            onChangeText={(v) => { setTime(v); commit(date, v); }}
            placeholder="HH:MM"
            placeholderTextColor={c.muted}
            accessibilityLabel={`${label} time`}
            testID={testID ? `${testID}-time` : undefined}
            keyboardType="numbers-and-punctuation"
            editable={!locked}
            onFocus={() => setF2(true)}
            onBlur={() => setF2(false)}
            style={[s2, { width: 110 }, locked ? { backgroundColor: c.surfaceAlt, color: c.muted } : null]}
          />
        ) : null}
        {showNow && !locked ? (
          <Pressable accessibilityRole="button" accessibilityLabel={mode === 'date' ? 'Today' : 'Now'} testID={testID ? `${testID}-now` : undefined} onPress={setNow} style={[styles.now, { borderColor: c.borderStrong }]}>
            <Text style={{ color: c.primary, fontWeight: '600' }}>{mode === 'date' ? 'Today' : 'Now'}</Text>
          </Pressable>
        ) : null}
      </View>
      {!help ? null : <Muted>{`Time zone: ${tzShort(tz, value.at)}`}</Muted>}
    </FieldShell>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' }, now: { minHeight: 44, paddingHorizontal: space.md, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' } });
