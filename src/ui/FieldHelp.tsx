// Contextual field help (PT-UX-04) + the support bubble (PT-UX-02).
//
// Why a panel as well as inline help: on a capture screen a handler is usually looking at the FIELD,
// not at the grey line under it, and on a long form the line they need has often scrolled past. The
// reference parks a persistent panel bottom-left that echoes whatever field has focus, so the answer
// is always in the same place on the glass. We keep the inline line too — it is what a screen reader
// reads, and it is what survives printing — and the panel simply repeats it for the focused field.
//
// The panel is deliberately quiet: it only appears once something is focused, it never covers the
// field it is describing (bottom-left, narrow, and it steps aside on phones), and it is not
// focusable itself, so tabbing through a form never lands in it.
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBottomInset } from './BottomInset';
import { Muted, Text } from './Text';
import { useColors, useIsDesktop } from './theme';
import { radius, space } from './tokens';

export interface FocusedField {
  label: string;
  help?: string;
  required?: boolean;
  error?: string | null;
}

interface FieldHelpCtx {
  focused: FocusedField | null;
  setFocused: (f: FocusedField | null) => void;
  clearIf: (label: string) => void;
}
const Ctx = createContext<FieldHelpCtx>({ focused: null, setFocused: () => {}, clearIf: () => {} });

export function FieldHelpProvider({ children }: { children: React.ReactNode }) {
  const [focused, setFocusedState] = useState<FocusedField | null>(null);
  const current = useRef<string | null>(null);

  const setFocused = useCallback((f: FocusedField | null) => {
    current.current = f?.label ?? null;
    setFocusedState(f);
  }, []);

  // Blur fires before the next focus, so a naive clear-on-blur makes the panel flicker between
  // fields. Only clear when the field that is leaving is still the one being shown.
  const clearIf = useCallback((label: string) => {
    if (current.current === label) { current.current = null; setFocusedState(null); }
  }, []);

  const value = useMemo(() => ({ focused, setFocused, clearIf }), [focused, setFocused, clearIf]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFieldHelp() {
  return useContext(Ctx);
}

/** Bottom-left panel echoing the focused field. Rendered once, by the shell. */
export function FieldHelpPanel() {
  const { focused } = useFieldHelp();
  const c = useColors();
  const desktop = useIsDesktop();
  const bottomInset = useBottomInset();
  if (!focused) return null;
  const body = focused.error || focused.help;
  return (
    <View
      testID="panel-field-help"
      accessibilityLabel={`Help for ${focused.label}`}
      pointerEvents="none"
      style={{
        position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
        left: space.md,
        // Lift clear of any bar pinned to the bottom (the notification alert strip).
        bottom: space.md + bottomInset,
        maxWidth: desktop ? 340 : 260,
        padding: space.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: focused.error ? c.danger : c.border,
        backgroundColor: c.surface,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
        zIndex: 40,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={focused.error ? 'alert-circle' : 'information-circle-outline'} size={18} color={focused.error ? c.danger : c.muted} />
        <Text variant="label" numberOfLines={2} style={{ flexShrink: 1 }}>
          {focused.label}{focused.required ? ' (required)' : ''}
        </Text>
      </View>
      {body ? (
        <Text style={{ marginTop: 4, color: focused.error ? c.danger : c.text }}>{body}</Text>
      ) : (
        <Muted style={{ marginTop: 4 }}>No extra guidance for this field.</Muted>
      )}
    </View>
  );
}

/**
 * Support bubble, bottom-right (PT-UX-02). In the reference this is a live chat widget; v1 has no
 * chat vendor wired, so it opens the in-app Support screen instead of pretending someone is there.
 * Saying "we will reply" when nobody is listening is the kind of lie the read-only banner used to be.
 *
 * WHY IT DISAPPEARS BELOW 1024 px (DECISIONS E46). A position:fixed circle in the bottom-right corner
 * sits ON TOP of whatever the page put there, and it does not just hide it — it eats the tap. Measured
 * on the merged app: at 390 the bubble covered the centre of cal-day-2026-08-01 (the Saturday column of
 * the Records hub calendar, the home screen) and a real click at that point opened /support instead of
 * filtering the list; at 900 it did the same to cal-day-2026-08-22 and cal-day-2026-08-29. The overlap
 * is a function of where the centred content column happens to land, so it cannot be padded away at
 * every width. Below the width where the content column has room to spare, support is docked into the
 * chrome instead — the top bar icon and the drawer's SUPPORT row (PT-UX-05, which is how the reference's
 * own phone app reaches support). Above it the bubble floats as PT-UX-02 describes, and BUBBLE_LANE is
 * the clearance long scrollers reserve so the last row never ends up underneath it.
 */
export const BUBBLE_MIN_WIDTH = 1024;
/** Width × height of the corner the floating bubble occupies, including its margin. */
export const BUBBLE_LANE = 56 + space.md * 2;

/** True only where the floating support bubble is rendered; elsewhere support lives in the chrome. */
export function useSupportBubbleVisible(): boolean {
  const { width } = useWindowDimensions();
  return width >= BUBBLE_MIN_WIDTH;
}

/** Bottom clearance a scrolling screen should reserve so the bubble never covers its last control. */
export function useBubbleClearance(): number {
  return useSupportBubbleVisible() ? BUBBLE_LANE : 0;
}

/**
 * Vertical room a long scroller must leave at its end so the last row is reachable — the tallest of
 * whatever is pinned to the bottom right now. The support bubble is only one of those, and below
 * 1024px it is not there at all (it docks into the top bar), while the notification alert strip is
 * full width and at its tallest exactly on a phone. Taking the bubble lane alone left the final
 * record's row menu permanently under the strip at 390.
 */
export function useScrollBottomClearance(): number {
  const strip = useBottomInset();
  const bubble = useBubbleClearance();
  return Math.max(strip, bubble);
}

export function SupportBubble({ onPress, testID = 'btn-support-bubble' }: { onPress: () => void; testID?: string }) {
  const c = useColors();
  const [hover, setHover] = useState(false);
  const bottomInset = useBottomInset();
  const show = useSupportBubbleVisible();
  if (!show) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Support — questions, guides and how to reach us"
      testID={testID}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={{
        position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
        right: space.md,
        // Never park on top of the notification alert strip's own buttons — lift by its height.
        bottom: space.md + bottomInset,
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.primary,
        opacity: hover ? 1 : 0.94,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
        zIndex: 41,
      }}
    >
      <Ionicons name="chatbubble-ellipses" size={26} color={c.primaryText} />
    </Pressable>
  );
}
