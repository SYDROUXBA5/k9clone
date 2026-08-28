// Theme provider — light / dark / follow-the-system, persisted by the caller (PrefsProvider) and
// mirrored onto the signed-in account (Profile → Theme, bar §2.16 row 9).
// The component API of every primitive is unchanged: they all read `useColors()`.
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import { control, palette, type ColorScheme, type Palette } from './tokens';

/** What the user chose. `system` follows the OS setting and is the default. */
export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeCtx {
  /** The scheme actually in force (system resolved). */
  scheme: ColorScheme;
  colors: Palette;
  /** The stored preference (may be `system`). */
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Kept for the pre-U7 API: pins light/dark explicitly. */
  setScheme: (s: ColorScheme) => void;
  /** Title-bar half-circle toggle: light ⇄ dark, always landing on an explicit choice. */
  toggle: () => void;
}
const Ctx = createContext<ThemeCtx>({
  scheme: 'light', colors: palette.light, preference: 'system',
  setPreference: () => {}, setScheme: () => {}, toggle: () => {},
});

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Uncontrolled starting point (pre-U7 callers). */
  initial?: ColorScheme;
  /** Controlled preference — pass with `onPreferenceChange` to persist it. */
  preference?: ThemePreference;
  onPreferenceChange?: (p: ThemePreference) => void;
}

export function ThemeProvider({ children, initial, preference, onPreferenceChange }: ThemeProviderProps) {
  const system = useColorScheme();
  const [internal, setInternal] = useState<ThemePreference>(initial ?? 'system');
  const pref = preference ?? internal;
  const setPreference = useCallback((p: ThemePreference) => {
    setInternal(p);
    onPreferenceChange?.(p);
  }, [onPreferenceChange]);
  const scheme: ColorScheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const value = useMemo<ThemeCtx>(() => ({
    scheme,
    colors: palette[scheme],
    preference: pref,
    setPreference,
    setScheme: (s: ColorScheme) => setPreference(s),
    toggle: () => setPreference(scheme === 'dark' ? 'light' : 'dark'),
  }), [scheme, pref, setPreference]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
export function useColors(): Palette {
  return useContext(Ctx).colors;
}

/** ≥900px → desktop layout (sidebar). */
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return width >= control.breakpoint;
}
