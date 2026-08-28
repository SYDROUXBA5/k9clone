// DateTimeField (web): native DOM date + time inputs (keyboard-friendly on desktop, OS pickers on
// mobile browsers). Stores instant + IANA zone. Same props as the native file.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { unstable_createElement } from 'react-native-web';
import { deviceTimeZone } from '@/db/util';
import { fromInputs, toDateInput, toTimeInput, tzShort, type Instant } from './datetime';
import { FieldShell } from './Field';
import { Text } from './Text';
import { useColors } from './theme';
import { control, radius, space } from './tokens';
import type { DateTimeFieldProps } from './DateTimeField';

export type { DateTimeFieldProps };

export function DateTimeField({ label, value, onChange, required, error, help, testID, mode = 'datetime', containerStyle, readOnly, disabled, showNow }: DateTimeFieldProps) {
  const c = useColors();
  // U3 named the locked state `readOnly`, U4 named it `disabled`; both props are honoured (merge superset).
  const locked = !!readOnly || !!disabled;
  const tz = value.tz || deviceTimeZone();
  const date = toDateInput(value.at, tz);
  const time = toTimeInput(value.at, tz);
  const base = {
    minHeight: control.inputHeight,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: error ? c.danger : c.borderStrong,
    borderRadius: radius.md,
    paddingLeft: space.md,
    paddingRight: space.sm,
    fontSize: 16,
    lineHeight: '22px',
    color: locked ? c.muted : c.text,
    backgroundColor: locked ? c.surfaceAlt : c.surface,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  } as const;
  const setNow = () => { if (locked) return; const now = new Date().toISOString(); onChange({ at: now, tz }); };
  const commit = (d: string, t: string) => { if (locked) return; onChange({ at: fromInputs(d, mode === 'date' ? '00:00' : t || '00:00', tz), tz }); };
  // `readOnly` on a DOM date/time input is honoured by the keyboard but not by every browser's picker widget,
  // so read-only fields are also `disabled`; both DOM flags read true for assistive tech and tests.
  const lock = locked ? { readOnly: true, disabled: true, 'aria-readonly': true, 'aria-disabled': true } : { readOnly: false, disabled: false };
  return (
    <FieldShell label={label} required={required} error={error} help={help || `Time zone: ${tzShort(tz, value.at)}`} style={containerStyle}>
      <View style={styles.row}>
        {unstable_createElement('input', {
          type: 'date',
          value: date,
          ...lock,
          'aria-label': `${label} date`,
          'data-testid': testID ? `${testID}-date` : undefined,
          onChange: (e: { target: { value: string } }) => commit(e.target.value, time),
          style: { ...base, flex: 1, minWidth: 150 },
        })}
        {mode === 'datetime'
          ? unstable_createElement('input', {
            type: 'time',
            value: time,
            ...lock,
            'aria-label': `${label} time`,
            'data-testid': testID ? `${testID}-time` : undefined,
            onChange: (e: { target: { value: string } }) => commit(date || toDateInput(new Date().toISOString(), tz), e.target.value),
            style: { ...base, width: 118, paddingLeft: space.sm },
          })
          : null}
        {showNow && !locked ? (
          <Pressable accessibilityRole="button" accessibilityLabel={mode === 'date' ? 'Today' : 'Now'} testID={testID ? `${testID}-now` : undefined} onPress={setNow} style={[styles.now, { borderColor: c.borderStrong }]}>
            <Text style={{ color: c.primary, fontWeight: '600' }}>{mode === 'date' ? 'Today' : 'Now'}</Text>
          </Pressable>
        ) : null}
      </View>
    </FieldShell>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }, now: { minHeight: control.inputHeight, paddingHorizontal: space.sm, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' } });
