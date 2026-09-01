// The two style pieces a colour token cannot carry: backdrop blur, and the lit top edge.
import { Platform, type ViewStyle } from 'react-native';
import { blur } from './tokens';

/**
 * Frosted backdrop. Web only — react-native has no backdrop blur without a native blur view, and
 * pulling one in for a look would cost a dependency on every platform to serve one. Native keeps the
 * translucent tint and the lit edge, which carry most of the effect on their own.
 *
 * Typed through `unknown` because backdropFilter is a real CSS property react-native-web forwards but
 * RN's ViewStyle has no name for.
 */
export function glassBlur(px: number = blur.card): ViewStyle {
  if (Platform.OS !== 'web') return {};
  return { backdropFilter: `blur(${px}px)`, WebkitBackdropFilter: `blur(${px}px)` } as unknown as ViewStyle;
}

/**
 * The hairline along a card's top edge. A pane of glass catches light on the edge facing it, and that
 * single line does more to sell the material than the blur behind it.
 */
export function glassEdge(color: string): ViewStyle {
  return { borderTopWidth: 1, borderTopColor: color };
}
