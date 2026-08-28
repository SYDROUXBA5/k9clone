// Supervisor strip — `n LATE RECORDS` · `n NOT REVIEWED` · `n LIVE TRACKS`; each tap filters or links.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Muted, Text, radius, space, useColors, useIsDesktop } from '@/ui';
import type { SupervisorAlerts } from './supervisor';

export function SupervisorBanners({ alerts, onLate, onNotReviewed, onLiveTracks, activeKey }: {
  alerts: SupervisorAlerts;
  onLate: () => void;
  onNotReviewed: () => void;
  onLiveTracks: () => void;
  activeKey?: 'late' | 'not_reviewed' | null;
}) {
  const c = useColors();
  const desktop = useIsDesktop();
  const items = [
    { key: 'late', count: alerts.lateHandlers.length, title: 'LATE RECORDS', sub: alerts.windowLabel, hint: `${alerts.lateHandlers.length === 1 ? 'Handler' : 'Handlers'} with no training record in the last ${alerts.lateDays} days`, icon: 'time-outline' as const, tone: alerts.lateHandlers.length ? c.warning : c.muted, bg: alerts.lateHandlers.length ? c.warningSoft : c.surfaceAlt, onPress: onLate, testID: 'banner-late-records' },
    { key: 'not_reviewed', count: alerts.notReviewed, title: 'NOT REVIEWED', sub: alerts.windowLabel, hint: 'Saved records awaiting your review', icon: 'shield-outline' as const, tone: alerts.notReviewed ? c.info : c.muted, bg: alerts.notReviewed ? c.infoSoft : c.surfaceAlt, onPress: onNotReviewed, testID: 'banner-not-reviewed' },
    { key: 'live', count: alerts.liveTracks, title: 'LIVE TRACKS', sub: 'Last 3 Days', hint: 'Open the tracking map', icon: 'navigate-outline' as const, tone: alerts.liveTracks ? c.success : c.muted, bg: alerts.liveTracks ? c.successSoft : c.surfaceAlt, onPress: onLiveTracks, testID: 'banner-live-tracks' },
  ];
  return (
    <View testID="supervisor-banners" style={[styles.wrap, desktop ? { flexDirection: 'row' } : null]}>
      {items.map((it) => {
        const active = activeKey === it.key;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityLabel={`${it.count} ${it.title.toLowerCase()}, ${it.sub} — ${it.hint}`}
            accessibilityHint={it.hint}
            accessibilityState={{ selected: active }}
            testID={it.testID}
            onPress={it.onPress}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.banner,
              { backgroundColor: it.bg, borderColor: active ? it.tone : 'transparent', borderLeftColor: it.tone, opacity: pressed || hovered ? 0.9 : 1 },
              desktop ? { flex: 1 } : null,
            ]}
          >
            <Ionicons name={it.icon} size={26} color={it.tone} style={{ marginRight: space.sm }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={{ fontSize: 24, lineHeight: 28, fontWeight: '700', color: it.tone }} testID={`${it.testID}-count`}>{it.count}</Text>
                <Text variant="bodyStrong" style={{ color: it.tone }}>{it.title}</Text>
              </View>
              <Muted numberOfLines={2}>{it.sub}</Muted>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginBottom: space.md },
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderLeftWidth: 4, padding: space.sm, paddingRight: space.sm, minHeight: 64 },
});
