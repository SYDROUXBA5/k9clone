import React, { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { FieldShell } from './Field';
import { Muted } from './Text';
import { useColors } from './theme';
import { control, radius, space } from './tokens';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  required?: boolean;
  error?: string | null;
  help?: string;
  testID?: string;
  hideLabel?: boolean;
  right?: React.ReactNode;
  containerStyle?: object;
}

export function useInputStyle(focused: boolean, error?: string | null) {
  const c = useColors();
  return [
    styles.input,
    { backgroundColor: c.surface, borderColor: error ? c.danger : focused ? c.focus : c.borderStrong, color: c.text },
    Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
  ];
}

export function TextField({ label, required, error, help, testID, hideLabel, right, containerStyle, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const c = useColors();
  const style = useInputStyle(focused, error);
  return (
    <FieldShell label={hideLabel ? undefined : label} required={required} error={error} help={help} style={containerStyle} right={right}>
      <TextInput
        {...input}
        accessibilityLabel={label}
        testID={testID}
        placeholderTextColor={c.muted}
        onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
        style={style}
      />
    </FieldShell>
  );
}

export interface TextAreaProps extends TextFieldProps {
  maxLength?: number;
  minHeight?: number;
}
export function TextArea({ label, required, error, help, testID, maxLength, minHeight = 120, value, right, containerStyle, ...input }: TextAreaProps) {
  const [focused, setFocused] = useState(false);
  const c = useColors();
  const style = useInputStyle(focused, error);
  const len = (value || '').length;
  return (
    <FieldShell label={label} required={required} error={error} help={help} style={containerStyle} right={right}>
      <TextInput
        {...input}
        value={value}
        multiline
        maxLength={maxLength}
        accessibilityLabel={label}
        testID={testID}
        placeholderTextColor={c.muted}
        textAlignVertical="top"
        onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
        style={[style, { minHeight, paddingTop: 12 }]}
      />
      {maxLength ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Muted testID={testID ? `${testID}-count` : undefined}>{len.toLocaleString()} of {maxLength.toLocaleString()} characters</Muted>
        </View>
      ) : null}
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: control.inputHeight,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22,
  },
});
