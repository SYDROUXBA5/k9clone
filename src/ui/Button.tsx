import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { useColors } from './theme';
import { control, radius, space } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
  fullWidth?: boolean;
  /** Override the label/icon colour — for buttons drawn on a dark bar rather than on the page. */
  textColor?: string;
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, icon, iconRight, testID, accessibilityLabel, style, size = 'md', fullWidth, textColor }: ButtonProps) {
  const c = useColors();
  const bg = variant === 'primary' ? c.primary : variant === 'accent' ? c.accentSolid : variant === 'danger' ? c.dangerSolid : variant === 'secondary' ? c.surface : 'transparent';
  // A ghost button takes its colour from the surface behind it; on a dark bar that surface is not the
  // page, so the caller says which ink to use rather than disappearing into the background.
  const fg = textColor || (variant === 'primary' ? c.primaryText : variant === 'danger' ? '#FFFFFF' : variant === 'accent' ? c.accentText : c.primary);
  const border = variant === 'secondary' ? c.borderStrong : 'transparent';
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !!isDisabled }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.base,
        { backgroundColor: bg, borderColor: border, minHeight: size === 'lg' ? 52 : control.minHeight, opacity: isDisabled ? 0.55 : pressed ? 0.85 : hovered ? 0.92 : 1 },
        fullWidth ? { alignSelf: 'stretch' } : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={20} color={fg} style={{ marginRight: space.sm }} /> : null}
          <Text variant="bodyStrong" style={{ color: fg }}>{title}</Text>
          {iconRight ? <Ionicons name={iconRight} size={20} color={fg} style={{ marginLeft: space.sm }} /> : null}
        </View>
      )}
    </Pressable>
  );
}

export interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel: string;
  testID?: string;
  color?: string;
  size?: number;
  badge?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}
export function IconButton({ icon, onPress, accessibilityLabel, testID, color, size = 24, badge, style, disabled }: IconButtonProps) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : disabled ? 0.4 : 1 }, style]}
    >
      <Ionicons name={icon} size={size} color={color || c.text} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: c.accentSolid }]}>
          <Text style={{ color: c.accentText, fontSize: 16, lineHeight: 18, fontWeight: '700' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  badge: { position: 'absolute', top: 2, right: 0, minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
});
