import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFieldHelp } from './FieldHelp';
import { Muted, Text } from './Text';
import { useColors } from './theme';
import { space } from './tokens';

export interface FieldShellProps {
  label?: string;
  required?: boolean;
  error?: string | null;
  help?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  right?: React.ReactNode;
}

/** Label + control + help/error. Every input inside receives the label as its accessibilityLabel. */
export function FieldShell({ label, required, error, help, children, style, testID, right }: FieldShellProps) {
  const c = useColors();
  // React's onFocus/onBlur bubble, so this wrapper hears whichever descendant input gains focus and
  // feeds the bottom-left help panel (PT-UX-04) without every field having to opt in.
  const { setFocused, clearIf } = useFieldHelp();
  return (
    <View
      style={[styles.wrap, style]}
      testID={testID}
      onFocus={label ? () => setFocused({ label, help, required, error }) : undefined}
      onBlur={label ? () => clearIf(label) : undefined}
    >
      {label ? (
        <View style={styles.labelRow}>
          <Text variant="label">{label}{required ? <Text variant="label" color="accent"> *</Text> : null}</Text>
          {right}
        </View>
      ) : null}
      {children}
      {error ? <Text color="danger" style={{ marginTop: 4 }} accessibilityLiveRegion="polite">{error}</Text> : help ? <Muted style={{ marginTop: 4 }}>{help}</Muted> : null}
      <View style={{ height: 0, borderColor: c.border }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.md },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', rowGap: 4 },
});
