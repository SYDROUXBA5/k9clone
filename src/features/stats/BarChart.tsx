// Accessible bar chart built from Views only — no chart library, no canvas, so every bar is a real
// DOM node a screen reader (and the critic's DOM dump) can read. Each bar carries its own
// accessibilityLabel ("Tracking: 4.5 hours") and the whole chart is a labelled list.
import React from 'react';
import { View } from 'react-native';
import { Muted, Text, useColors, radius, space } from '@/ui';
import type { Bar } from './statsModel';

export function BarChart({ title, bars, unit, testID, emptyText = 'Nothing in this range.', tone = 'primary' }: {
  title: string;
  bars: Bar[];
  /** Spoken unit, e.g. "hours" or "deployments". */
  unit: string;
  testID: string;
  emptyText?: string;
  tone?: 'primary' | 'accent';
}) {
  const c = useColors();
  const max = bars.reduce((m, b) => Math.max(m, b.value), 0);
  const fill = tone === 'accent' ? c.accent : c.primary;
  if (!bars.length || max <= 0) {
    return (
      <View testID={testID}>
        <Text variant="label" color="muted" style={{ marginBottom: space.sm }}>{title}</Text>
        <Muted testID={`${testID}-empty`}>{emptyText}</Muted>
      </View>
    );
  }
  return (
    <View testID={testID} accessibilityRole="list" accessibilityLabel={`${title} — ${bars.length} bar${bars.length === 1 ? '' : 's'}, largest ${max} ${unit}`}>
      <Text variant="label" color="muted" style={{ marginBottom: space.sm }}>{title}</Text>
      <View style={{ gap: space.sm }}>
        {bars.map((b) => {
          const pct = Math.max(2, Math.round((b.value / max) * 100));
          return (
            <View
              key={b.key}
              testID={`${testID}-bar-${slug(b.key)}`}
              accessibilityRole="text"
              accessibilityLabel={`${b.label}: ${b.value} ${unit}`}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
                <Text style={{ flex: 1, minWidth: 0 }} numberOfLines={2}>{b.label}</Text>
                <Text variant="bodyStrong" testID={`${testID}-value-${slug(b.key)}`}>{b.sub ?? String(b.value)}</Text>
              </View>
              <View style={{ height: 18, borderRadius: radius.sm, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, marginTop: 4, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: fill }} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Two-series stacked bar (Patrol vs Detection) — `Total Deployments` (PT-STA-02). */
export function StackedBar({ title, a, b, testID }: {
  title: string;
  a: { label: string; value: number };
  b: { label: string; value: number };
  testID: string;
}) {
  const c = useColors();
  const total = a.value + b.value;
  return (
    <View testID={testID} accessibilityRole="text" accessibilityLabel={`${title}: ${a.value} ${a.label}, ${b.value} ${b.label}, ${total} total`}>
      <Text variant="label" color="muted" style={{ marginBottom: space.sm }}>{title}</Text>
      {total === 0 ? <Muted testID={`${testID}-empty`}>No deployments in this range.</Muted> : (
        <>
          <View style={{ flexDirection: 'row', height: 22, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
            <View style={{ flex: Math.max(a.value, 0.001), backgroundColor: c.primary }} />
            <View style={{ flex: Math.max(b.value, 0.001), backgroundColor: c.accent }} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.sm, flexWrap: 'wrap' }}>
            <Legend color={c.primary} label={`${a.label} ${a.value}`} />
            <Legend color={c.accent} label={`${b.label} ${b.value}`} />
            <Muted testID={`${testID}-total`}>Total {total}</Muted>
          </View>
        </>
      )}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: color }} />
      <Text>{label}</Text>
    </View>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'x';
}
