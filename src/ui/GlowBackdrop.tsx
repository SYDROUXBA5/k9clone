// The ambient light behind everything. Without it a translucent card has nothing to be translucent
// over and the whole screen reads as flat grey panels on a flat dark rectangle.
//
// Built with react-native-svg rather than a CSS gradient so it renders identically on the phone and
// in the browser, and without adding a gradient dependency for one effect.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useColors } from './theme';

/**
 * Two soft pools of colour — one cool, one violet — bled off opposite corners. They sit behind the
 * app content and never take a touch.
 */
export function GlowBackdrop({ testID = 'glow-backdrop' }: { testID?: string }) {
  const c = useColors();
  return (
    <View testID={testID} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 160">
        <Defs>
          <RadialGradient id="glowA" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={c.glowA} stopOpacity={c.glowOpacity} />
            <Stop offset="100%" stopColor={c.glowA} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowB" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={c.glowB} stopOpacity={c.glowOpacity} />
            <Stop offset="100%" stopColor={c.glowB} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* Upper left, cool. Centred BELOW the chrome on purpose: the first pass put it at cy=10,
            which hid the brightest part of the pool behind the top bar and left the content area
            looking unlit. */}
        <Ellipse cx="16" cy="30" rx="74" ry="62" fill="url(#glowA)" />
        {/* Lower right, violet — the shift between the two hues is what stops it reading as a vignette. */}
        <Ellipse cx="92" cy="128" rx="80" ry="68" fill="url(#glowB)" />
      </Svg>
    </View>
  );
}
