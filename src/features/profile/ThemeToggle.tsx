// Half-circle light/dark toggle for the title bar (bar §2.16 row 9 / PT-UX-02).
// Flipping it here writes the same account + device preference the Profile → Theme section writes.
import React from 'react';
import { IconButton, useTheme } from '@/ui';
import { useThemeControl } from './useThemeControl';

export function ThemeToggle({ color, testID = 'btn-theme-toggle' }: { color?: string; testID?: string }) {
  const { scheme } = useTheme();
  const { setPreference } = useThemeControl();
  const next = scheme === 'dark' ? 'light' : 'dark';
  return (
    <IconButton
      icon={scheme === 'dark' ? 'sunny-outline' : 'contrast-outline'}
      accessibilityLabel={`Switch to ${next} mode`}
      testID={testID}
      color={color}
      size={24}
      onPress={() => setPreference(next)}
    />
  );
}
