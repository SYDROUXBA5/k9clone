// TO DO card — `n TO DO · LAST 90 DAYS` with one tappable row per alert type.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Muted, Text, radius, space, useColors, useIsDesktop } from '@/ui';
import { TODO_WINDOW_DAYS } from './constants';
import type { TodoItem } from './todo';

export function TodoCard({ items, total, onPick, active }: { items: TodoItem[]; total: number; onPick: (item: TodoItem) => void; active?: string | null }) {
  const c = useColors();
  const desktop = useIsDesktop();
  const toneColor = (t: TodoItem['tone']) => (t === 'danger' ? c.danger : t === 'warning' ? c.warning : t === 'info' ? c.info : c.muted);
  return (
    <View testID="card-todo" accessibilityLabel={`${total} to do, last ${TODO_WINDOW_DAYS} days`} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, desktop ? { flexDirection: 'row', alignItems: 'stretch' } : null]}>
      <View style={[styles.head, desktop ? { borderRightWidth: 1, borderRightColor: c.border, paddingRight: space.md, marginRight: space.md, minWidth: 190 } : { borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: space.sm, marginBottom: space.sm }]}>
        <View style={[styles.iconWrap, { backgroundColor: total ? c.accentSoft : c.surfaceAlt }]}>
          <Ionicons name="clipboard-outline" size={26} color={total ? c.accent : c.muted} />
          {total ? <View style={[styles.badge, { backgroundColor: c.accentSolid }]}><Text style={{ color: c.accentText, fontSize: 16, lineHeight: 18, fontWeight: '700' }} testID="text-todo-total">{total > 99 ? '99+' : total}</Text></View> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="h3" testID="text-todo-title">{total} TO DO</Text>
          <Muted>LAST {TODO_WINDOW_DAYS} DAYS</Muted>
        </View>
      </View>
      <View style={[styles.rows, desktop ? { flexDirection: 'row', flexWrap: 'wrap', flex: 1, alignItems: 'center' } : null]}>
        {items.map((it) => {
          const isActive = active === it.key;
          return (
            <Pressable
              key={it.key}
              accessibilityRole="button"
              accessibilityLabel={`${it.count} ${it.label}`}
              accessibilityState={{ selected: isActive }}
              testID={it.testID}
              onPress={() => onPick(it)}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.row,
                { backgroundColor: isActive ? c.primarySoft : pressed || hovered ? c.surfaceAlt : 'transparent', borderColor: isActive ? c.primary : 'transparent' },
                desktop ? { minWidth: 210, flexGrow: 1 } : null,
              ]}
            >
              <Text style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', color: it.count ? toneColor(it.tone) : c.muted, minWidth: 34, textAlign: 'right' }} testID={`${it.testID}-count`}>{it.count}</Text>
              <Text style={{ flex: 1, color: it.count ? c.text : c.muted, fontWeight: it.count ? '600' : '400' }}>{it.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={c.muted} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconWrap: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -6, right: -6, minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  rows: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.sm, borderWidth: 1 },
});
