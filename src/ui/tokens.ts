// Design tokens — clean-room identity (docs/DECISIONS.md E4, revised E47). Light + dark palettes.
//
// The look is "glass on midnight": a deep navy ground with an ambient glow behind it, cards that are
// translucent rather than filled, hairline light borders, and a single cyan accent doing the work an
// orange used to. Dark is the primary expression; light is the same system inverted — frosted white
// over a cool blue-grey — so neither theme reads as an afterthought.
//
// Every foreground/background pair below clears WCAG AA (4.5:1) for 16 px text; the ratios were
// measured against the colour a translucent surface actually composites to, not against the raw rgba.
// `successSolid` / `dangerSolid` / `infoSolid` carry WHITE text in BOTH themes (toasts, chart bars),
// so they stay dark in dark mode for exactly that reason. `accentSolid` is the exception and does NOT:
// it is the cyan FILL for badges, the logo tile and the add button, and its ink is `accentText`
// (near-black in dark). Anything drawing on `accentSolid` must use `accentText`, never '#fff'.
//
// A note on cyan: it is a LIGHT hue, so every cyan fill carries DARK ink (`accentText`/`primaryText`
// are near-black in dark mode). That is the opposite of the orange it replaced, where fills carried
// white. Getting this backwards is the easiest way to ship an unreadable button.
export const palette = {
  light: {
    primary: '#0E7490',
    primaryText: '#FFFFFF',
    primarySoft: 'rgba(14,116,144,0.10)',
    accent: '#0E7490',
    accentText: '#FFFFFF',
    accentSoft: 'rgba(14,116,144,0.12)',
    // Deep enough to carry white at 16 px; `accentInk` is the shade that IS the text.
    accentSolid: '#0C6A82',
    accentInk: '#0A5568',
    bg: '#EDF1F8',
    // Frosted, not filled: these composite over the ambient glow rather than hiding it.
    surface: 'rgba(255,255,255,0.82)',
    surfaceAlt: 'rgba(255,255,255,0.58)',
    text: '#0F1729',
    muted: '#54617A',
    border: 'rgba(15,23,41,0.10)',
    borderStrong: 'rgba(15,23,41,0.22)',
    success: '#0F7A46',
    successSoft: 'rgba(15,122,70,0.12)',
    danger: '#C0243B',
    dangerSoft: 'rgba(192,36,59,0.12)',
    warning: '#8A5A00',
    warningSoft: 'rgba(138,90,0,0.14)',
    info: '#1F5F8B',
    infoSoft: 'rgba(31,95,139,0.12)',
    successSolid: '#0F7A46',
    dangerSolid: '#B32136',
    infoSolid: '#1F5F8B',
    navBg: '#0B1A2D',
    navText: '#C9D8EE',
    navActiveBg: 'rgba(45,212,232,0.18)',
    navActiveText: '#7FE9F7',
    overlay: 'rgba(9,15,28,0.42)',
    focus: '#0E7490',
    // --- glass system ---------------------------------------------------------------------------
    /** Hairline along the lit edge of a card — what sells "pane of glass" more than the blur does. */
    glassEdge: 'rgba(255,255,255,0.85)',
    /** The ambient glow painted behind everything (see GlowBackdrop). */
    glowA: '#8AD9EC',
    glowB: '#A9BEF6',
    glowOpacity: 0.75,
    shadow: 'rgba(15,23,41,0.16)',
  },
  dark: {
    primary: '#37E0F0',
    // Cyan is light: fills carry near-black ink, never white.
    primaryText: '#03151B',
    primarySoft: 'rgba(55,224,240,0.14)',
    accent: '#37E0F0',
    accentText: '#04141A',
    accentSoft: 'rgba(55,224,240,0.14)',
    accentSolid: '#2BC8DA',
    accentInk: '#5FE7F5',
    // A blue-violet ground, not near-black. Earlier passes sat at #080D1A and every translucent
    // surface composited to something barely lighter than the page, which is why the cards read as
    // flat panels no matter how much the glow was pushed.
    bg: '#101736',
    surface: 'rgba(255,255,255,0.12)',
    surfaceAlt: 'rgba(255,255,255,0.18)',
    text: '#EAF2FF',
    muted: '#94A6C4',
    border: 'rgba(255,255,255,0.18)',
    borderStrong: 'rgba(255,255,255,0.28)',
    success: '#5AE6A8',
    successSoft: 'rgba(90,230,168,0.13)',
    danger: '#FF8095',
    dangerSoft: 'rgba(255,128,149,0.14)',
    warning: '#FFC46B',
    warningSoft: 'rgba(255,196,107,0.13)',
    info: '#8CC6FF',
    infoSoft: 'rgba(140,198,255,0.13)',
    // Still dark: these carry WHITE text in both themes.
    successSolid: '#1E7F53',
    dangerSolid: '#B3283A',
    infoSolid: '#1F5F8B',
    navBg: 'rgba(9,15,29,0.34)',
    navText: '#C7D5EC',
    navActiveBg: 'rgba(55,224,240,0.16)',
    navActiveText: '#5FE7F5',
    overlay: 'rgba(3,7,18,0.74)',
    focus: '#37E0F0',
    // --- glass system ---------------------------------------------------------------------------
    glassEdge: 'rgba(255,255,255,0.24)',
    glowA: '#2F8FD4',
    glowB: '#7A4BE0',
    glowOpacity: 0.78,
    shadow: 'rgba(0,0,0,0.55)',
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

// Generous corners are half the glass look — a 10px radius reads as a box, a 20px one as a pane.
// `md` matters most: the hub's cards are bespoke components that reach for it directly rather than
// going through <Card/>, so this value — not the Card component — is what rounds most of the app.
export const radius = {
  sm: 10,
  md: 18,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

/** Backdrop blur strength, in px. Web-only (see `glassStyle`); native falls back to the tint alone. */
export const blur = { card: 20, chrome: 26 } as const;

// Type scale — nothing under 16px on capture screens; the whole app stays ≥16px.
export const type = {
  h1: { fontSize: 30, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.4 },
  h2: { fontSize: 23, lineHeight: 29, fontWeight: '700' as const, letterSpacing: -0.2 },
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
