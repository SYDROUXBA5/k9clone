import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from './Button';
import { useScrollBottomClearance } from './FieldHelp';
import { H1, H3, Muted, Text } from './Text';
import { useColors, useIsDesktop } from './theme';
import { radius, space } from './tokens';

/** Page container: title row + scrollable content, max width on desktop. */
export function Screen({ title, subtitle, actions, children, testID, scroll = true, maxWidth = 1100, padded = true }: {
  title?: string; subtitle?: string; actions?: React.ReactNode; children?: React.ReactNode; testID?: string; scroll?: boolean; maxWidth?: number; padded?: boolean;
}) {
  const c = useColors();
  const desktop = useIsDesktop();
  // Reserve the corner the floating support bubble occupies, so the last control on a long screen
  // can always be scrolled clear of it (DECISIONS E46). 0 where no bubble is rendered.
  const bottomClearance = useScrollBottomClearance();
  const inner = (
    <View style={[{ width: '100%', maxWidth, alignSelf: 'center' }, padded ? { padding: desktop ? space.lg : space.md } : null]}>
      {title ? (
        <View style={[styles.titleRow, { marginBottom: space.md }]}>
          <View style={{ flex: 1, minWidth: 0, flexBasis: 220 }}>
            <H1 accessibilityRole="header">{title}</H1>
            {subtitle ? <Muted style={{ marginTop: 2 }}>{subtitle}</Muted> : null}
          </View>
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
  if (!scroll) return <View testID={testID} style={{ flex: 1, backgroundColor: c.bg }}>{inner}</View>;
  return (
    <ScrollView testID={testID} style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomClearance }} keyboardShouldPersistTaps="handled">
      {inner}
    </ScrollView>
  );
}

export function Card({ children, style, testID, onPress }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string; onPress?: () => void }) {
  const c = useColors();
  const s = [styles.card, { backgroundColor: c.surface, borderColor: c.border }, style];
  return <View testID={testID} style={s}>{children}</View>;
}

export function Section({ title, description, children, actions, style }: { title?: string; description?: string; children?: React.ReactNode; actions?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginBottom: space.lg }, style]}>
      {title ? (
        <View style={[styles.titleRow, { marginBottom: space.sm }]}>
          <View style={{ flex: 1, minWidth: 0, flexBasis: 220 }}>
            <H3 accessibilityRole="header">{title}</H3>
            {description ? <Muted style={{ marginTop: 2 }}>{description}</Muted> : null}
          </View>
          {actions}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Row({ children, style, gap = space.sm, wrap, align = 'center', justify, testID }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number; wrap?: boolean; align?: ViewStyle['alignItems']; justify?: ViewStyle['justifyContent']; testID?: string }) {
  return <View testID={testID} style={[{ flexDirection: 'row', alignItems: align, gap, flexWrap: wrap ? 'wrap' : 'nowrap', justifyContent: justify }, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ height: 1, backgroundColor: c.border, alignSelf: 'stretch' }, style]} />;
}

export function EmptyState({ icon = 'file-tray-outline', title, body, action, testID }: { icon?: keyof typeof Ionicons.glyphMap; title: string; body?: string; action?: { title: string; onPress: () => void; testID?: string }; testID?: string }) {
  const c = useColors();
  return (
    <View testID={testID} style={[styles.empty, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
      <Ionicons name={icon} size={40} color={c.muted} />
      <Text variant="h3" align="center" style={{ marginTop: space.sm }}>{title}</Text>
      {body ? <Muted align="center" style={{ marginTop: space.xs, maxWidth: 420 }}>{body}</Muted> : null}
      {action ? <Button title={action.title} onPress={action.onPress} testID={action.testID} style={{ marginTop: space.md }} /> : null}
    </View>
  );
}

export type BannerTone = 'info' | 'warning' | 'danger' | 'success';
export function Banner({ tone = 'info', title, body, action, testID, style }: { tone?: BannerTone; title?: string; body?: string | React.ReactNode; action?: { title: string; onPress: () => void; testID?: string }; testID?: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const map = {
    info: { bg: c.infoSoft, fg: c.info, icon: 'information-circle' as const },
    warning: { bg: c.warningSoft, fg: c.warning, icon: 'warning' as const },
    danger: { bg: c.dangerSoft, fg: c.danger, icon: 'alert-circle' as const },
    success: { bg: c.successSoft, fg: c.success, icon: 'checkmark-circle' as const },
  }[tone];
  return (
    <View testID={testID} accessibilityRole="alert" style={[styles.banner, { backgroundColor: map.bg, borderColor: map.fg }, style]}>
      <Ionicons name={map.icon} size={22} color={map.fg} style={{ marginRight: space.sm, marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {title ? <Text variant="bodyStrong" style={{ color: map.fg }}>{title}</Text> : null}
        {typeof body === 'string' ? <Text style={{ color: c.text }}>{body}</Text> : body}
      </View>
      {action ? <Button title={action.title} variant="secondary" onPress={action.onPress} testID={action.testID} style={{ marginLeft: space.sm }} /> : null}
    </View>
  );
}

export type StatusKind = 'not_reviewed' | 'reviewed' | 'rejected' | 'outdated' | 'incomplete' | 'complete' | 'active' | 'retired' | 'neutral' | 'expired' | 'trial' | 'due';
export function StatusPill({ status, label, testID }: { status: StatusKind; label?: string; testID?: string }) {
  const c = useColors();
  const map: Record<StatusKind, { bg: string; fg: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
    not_reviewed: { bg: c.surfaceAlt, fg: c.muted, text: 'Not Reviewed', icon: 'shield-outline' },
    reviewed: { bg: c.successSoft, fg: c.success, text: 'Reviewed', icon: 'shield-checkmark' },
    rejected: { bg: c.dangerSoft, fg: c.danger, text: 'Rejected', icon: 'alert-circle' },
    outdated: { bg: c.warningSoft, fg: c.warning, text: 'Outdated', icon: 'time' },
    incomplete: { bg: c.surfaceAlt, fg: c.muted, text: 'Incomplete', icon: 'ellipse-outline' },
    complete: { bg: c.successSoft, fg: c.success, text: 'Complete', icon: 'checkmark-circle' },
    active: { bg: c.successSoft, fg: c.success, text: 'Active', icon: 'checkmark-circle' },
    retired: { bg: c.surfaceAlt, fg: c.muted, text: 'Retired', icon: 'moon' },
    neutral: { bg: c.surfaceAlt, fg: c.muted, text: '', icon: 'ellipse' },
    expired: { bg: c.dangerSoft, fg: c.danger, text: 'Expired', icon: 'alert-circle' },
    trial: { bg: c.infoSoft, fg: c.info, text: 'Trial', icon: 'hourglass' },
    due: { bg: c.warningSoft, fg: c.warning, text: 'Due', icon: 'alarm-outline' },
  };
  const m = map[status];
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: m.bg, borderColor: m.fg }]}>
      <Ionicons name={m.icon} size={16} color={m.fg} style={{ marginRight: 4 }} />
      <Text style={{ color: m.fg, fontSize: 16, lineHeight: 20, fontWeight: '600' }}>{label || m.text}</Text>
    </View>
  );
}

export function Badge({ children, tone = 'primary', testID }: { children: React.ReactNode; tone?: 'primary' | 'accent' | 'muted'; testID?: string }) {
  const c = useColors();
  const bg = tone === 'primary' ? c.primarySoft : tone === 'accent' ? c.accentSoft : c.surfaceAlt;
  const fg = tone === 'primary' ? c.primary : tone === 'accent' ? c.accentInk : c.muted;
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: bg, borderColor: bg, maxWidth: '100%', flexShrink: 1 }]}>
      <Text style={{ color: fg, fontSize: 16, lineHeight: 20, fontWeight: '600', flexShrink: 1 }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap', flexShrink: 1, maxWidth: '100%' },
  card: { borderRadius: radius.md, borderWidth: 1, padding: space.md },
  empty: { borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', padding: space.xl, alignItems: 'center' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: radius.md, borderLeftWidth: 4, padding: space.md, marginBottom: space.md },
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
});
