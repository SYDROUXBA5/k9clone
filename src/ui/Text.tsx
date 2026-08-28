import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useColors } from './theme';
import { type } from './tokens';

export type TextVariant = keyof typeof type;
export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: 'text' | 'muted' | 'primary' | 'accent' | 'danger' | 'success' | 'inverse' | 'nav' | string;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
}

export function Text({ variant = 'body', color = 'text', align, weight, style, ...rest }: TextProps) {
  const c = useColors();
  const map: Record<string, string> = {
    text: c.text, muted: c.muted, primary: c.primary, accent: c.accentInk, danger: c.danger,
    success: c.success, inverse: c.primaryText, nav: c.navText,
  };
  const resolved = map[color] ?? color;
  return <RNText {...rest} style={[type[variant], { color: resolved }, align ? { textAlign: align } : null, weight ? { fontWeight: weight } : null, style]} />;
}

export const H1 = (p: TextProps) => <Text variant="h1" {...p} />;
export const H2 = (p: TextProps) => <Text variant="h2" {...p} />;
export const H3 = (p: TextProps) => <Text variant="h3" {...p} />;
export const Muted = (p: TextProps) => <Text color="muted" {...p} />;
export const Label = (p: TextProps) => <Text variant="label" {...p} />;
