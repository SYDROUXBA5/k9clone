import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Pressable, StyleSheet, Switch as RNSwitch, View, type StyleProp, type ViewStyle } from 'react-native';
import { Muted, Text } from './Text';
import { useColors } from './theme';
import { radius, space } from './tokens';

export function Switch({ label, value, onChange, help, testID, disabled, style }: { label: string; value: boolean; onChange: (v: boolean) => void; help?: string; testID?: string; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      {...(Platform.OS === 'web' ? ({ 'aria-checked': value } as object) : null)}
      testID={testID}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.row, style]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text>{label}</Text>
        {help ? <Muted>{help}</Muted> : null}
      </View>
      <RNSwitch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: c.primary, false: c.borderStrong }}
        thumbColor={c.surface}
        {...({ activeThumbColor: c.surface } as object)}
      />
    </Pressable>
  );
}

/** Checkbox — tri-state aware: value null renders as unset (never answered). */
export function Checkbox({ label, value, onChange, help, testID, disabled, style, hideLabel }: { label: string; value: boolean | null; onChange: (v: boolean) => void; help?: string; testID?: string; disabled?: boolean; style?: StyleProp<ViewStyle>; hideLabel?: boolean }) {
  const c = useColors();
  const icon = value === true ? 'checkbox' : value === false ? 'square-outline' : 'remove-circle-outline';
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value === null ? 'mixed' : value, disabled }}
      {...(Platform.OS === 'web' ? ({ 'aria-checked': value === null ? 'mixed' : value } as object) : null)}
      testID={testID}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.row, { justifyContent: 'flex-start', gap: space.sm }, style]}
    >
      <Ionicons name={icon} size={26} color={value ? c.primary : c.muted} />
      {hideLabel ? null : (
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text>{label}</Text>
          {help ? <Muted>{help}</Muted> : null}
        </View>
      )}
    </Pressable>
  );
}

/** Segmented control (e.g. Detection | Patrol, Handler | Trainer). `value` may be null (nothing chosen yet —
 *  tri-state questions never default to No); `disabled` renders read-only (aria-disabled, no press). */
export function Segmented<T extends string>({ options, value, onChange, label, testID, disabled }: { options: readonly { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; label: string; testID?: string; disabled?: boolean }) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} accessibilityState={{ disabled }} {...(Platform.OS === 'web' ? ({ 'aria-disabled': disabled ? true : undefined } as object) : null)} testID={testID} style={[styles.seg, { borderColor: c.borderStrong, backgroundColor: disabled ? c.surfaceAlt : c.surface, opacity: disabled ? 0.7 : 1 }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active, disabled }}
            {...(Platform.OS === 'web' ? ({ 'aria-checked': active, 'aria-disabled': disabled ? true : undefined } as object) : null)}
            accessibilityLabel={o.label}
            testID={testID ? `${testID}-${o.value}` : undefined}
            disabled={disabled}
            onPress={() => { if (!disabled) onChange(o.value); }}
            style={[styles.segItem, { backgroundColor: active ? c.primary : 'transparent' }]}
          >
            <Text style={{ color: active ? c.primaryText : c.text, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingVertical: 6, gap: space.md },
  seg: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderRadius: radius.md, padding: 3, alignSelf: 'flex-start' },
  segItem: { minHeight: 38, paddingHorizontal: space.md, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
