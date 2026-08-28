// Design tokens — clean-room identity (docs/DECISIONS.md E4). Light + dark palettes (U7).
// Every foreground/background pair below clears WCAG AA (4.5:1) for 16 px text; the ratios were
// measured, not guessed. `*Solid` colours are the ones that carry WHITE text in BOTH themes
// (toasts, chart bars) — they stay dark in dark mode for exactly that reason.
export const palette = {
  light: {
    primary: '#14524A',
    primaryText: '#FFFFFF',
    primarySoft: '#E3EEEC',
    accent: '#E4572E',
    accentText: '#FFFFFF',
    accentSoft: '#FBE7E0',
    // Safety orange at full strength is a 3.7:1 partner for white and 3.7:1 as ink on paper — fine for
    // icons and rules (3:1), short of AA for 16 px words. `accentSolid` is the shade that carries WHITE
    // text (buttons, badges, the active nav pill); `accentInk` is the shade that IS the text.
    accentSolid: '#C24A27',
    accentInk: '#B64625',
    bg: '#F6F5F2',
    surface: '#FFFFFF',
    surfaceAlt: '#FBFAF8',
    text: '#1E1E1C',
    muted: '#676662',
    border: '#E3E1DB',
    borderStrong: '#C9C6BE',
    success: '#2B762F',
    successSoft: '#E5F2E6',
    danger: '#C62828',
    dangerSoft: '#FBE5E5',
    warning: '#995B00',
    warningSoft: '#FFF2DC',
    info: '#1F5F8B',
    infoSoft: '#E1EEF6',
    successSolid: '#2E7D32',
    dangerSolid: '#C62828',
    infoSolid: '#1F5F8B',
    navBg: '#14524A',
    navText: '#E8F0EE',
    navActiveBg: '#C24A27',
    navActiveText: '#FFFFFF',
    overlay: 'rgba(30,30,28,0.45)',
    focus: '#E4572E',
  },
  dark: {
    primary: '#5FB3A6',
    primaryText: '#0B211E',
    primarySoft: '#162B28',
    accent: '#F65E32',
    accentText: '#FFFFFF',
    accentSoft: '#2A1610',
    // Dark mode flips which direction is safe: white still needs the darker fill, but accent-as-text
    // has to go LIGHTER than the brand hue to clear 4.5:1 against #1E1F1E.
    accentSolid: '#C24A27',
    accentInk: '#F65E32',
    // NOTE: `accent` above is the LIGHTER orange in dark mode on purpose — every fill that carries
    // white moved to `accentSolid`, so `accent` only draws icons, borders and calendar marks now.
    bg: '#141514',
    surface: '#1E1F1E',
    surfaceAlt: '#262825',
    text: '#F1EFEA',
    muted: '#ADAAA2',
    border: '#35372F',
    borderStrong: '#55574E',
    success: '#7ACB7E',
    successSoft: '#172A19',
    danger: '#FF8A85',
    dangerSoft: '#33191A',
    warning: '#FFC46B',
    warningSoft: '#33260F',
    info: '#7CC0FA',
    infoSoft: '#12222F',
    successSolid: '#2E7D32',
    dangerSolid: '#B02121',
    infoSolid: '#1F5F8B',
    navBg: '#0F2724',
    navText: '#D8E5E2',
    navActiveBg: '#C24A27',
    navActiveText: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.66)',
    focus: '#FF9B78',
  },
};
export type Palette = typeof palette.light;
export type ColorScheme = 'light' | 'dark';

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

// Type scale — nothing under 16px on capture screens; the whole app stays ≥16px.
export const type = {
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  label: { fontSize: 16, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 16, lineHeight: 20, fontWeight: '400' as const },
  nav: { fontSize: 16, lineHeight: 20, fontWeight: '700' as const, letterSpacing: 0.6 },
};

export const control = {
  minHeight: 44,
  inputHeight: 48,
  desktopSidebar: 248,
  breakpoint: 900,
} as const;

export const fontFamily = undefined; // system UI font everywhere
