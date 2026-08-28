// Table — real columns on desktop; collapses to stacked cards on phone (label: value rows).
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card } from './Layout';
import { Muted, Text } from './Text';
import { useColors, useIsDesktop } from './theme';
import { space } from './tokens';

export interface Column<T> {
  key: string;
  title: string;
  render: (row: T) => React.ReactNode;
  width?: number; // fixed width on desktop
  flex?: number;
  hideOnPhone?: boolean;
  align?: 'left' | 'right' | 'center';
}

export function Table<T>({ columns, rows, keyOf, onRowPress, testID, emptyText = 'Nothing here yet.', rowTestID }: {
  columns: Column<T>[]; rows: T[]; keyOf: (r: T) => string; onRowPress?: (r: T) => void; testID?: string; emptyText?: string; rowTestID?: (r: T) => string;
}) {
  const c = useColors();
  const desktop = useIsDesktop();
  if (!rows.length) return <Muted testID={testID ? `${testID}-empty` : undefined} style={{ padding: space.md }}>{emptyText}</Muted>;
  if (!desktop) {
    return (
      <View testID={testID} style={{ gap: space.sm }}>
        {rows.map((r) => (
          <Pressable key={keyOf(r)} onPress={onRowPress ? () => onRowPress(r) : undefined} accessibilityRole={onRowPress ? 'button' : undefined} testID={rowTestID?.(r)}>
            <Card>
              {columns.filter((col) => !col.hideOnPhone).map((col) => (
                <View key={col.key} style={styles.cardRow}>
                  <Muted style={{ width: 120 }}>{col.title}</Muted>
                  <View style={{ flex: 1, minWidth: 0 }}>{typeof col.render(r) === 'string' ? <Text>{col.render(r)}</Text> : col.render(r)}</View>
                </View>
              ))}
            </Card>
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%' }}>
      <View testID={testID} style={[styles.table, { borderColor: c.border, backgroundColor: c.surface }]}>
        <View style={[styles.tr, styles.th, { borderBottomColor: c.border, backgroundColor: c.surfaceAlt }]}>
          {columns.map((col) => (
            <View key={col.key} style={[styles.td, col.width ? { width: col.width } : { flex: col.flex ?? 1 }]}>
              <Text variant="label" color="muted" style={{ textAlign: col.align }}>{col.title}</Text>
            </View>
          ))}
        </View>
        {rows.map((r, i) => (
          <Pressable
            key={keyOf(r)}
            onPress={onRowPress ? () => onRowPress(r) : undefined}
            accessibilityRole={onRowPress ? 'button' : undefined}
            testID={rowTestID?.(r)}
            style={({ hovered }: { hovered?: boolean }) => [styles.tr, { borderBottomColor: c.border, borderBottomWidth: i === rows.length - 1 ? 0 : 1, backgroundColor: hovered && onRowPress ? c.surfaceAlt : 'transparent' }]}
          >
            {columns.map((col) => (
              <View key={col.key} style={[styles.td, col.width ? { width: col.width } : { flex: col.flex ?? 1 }]}>
                {typeof col.render(r) === 'string' || typeof col.render(r) === 'number' ? <Text style={{ textAlign: col.align }}>{String(col.render(r))}</Text> : col.render(r)}
              </View>
            ))}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  table: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', minWidth: '100%' },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  th: { borderBottomWidth: 1 },
  td: { paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', minWidth: 80 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, gap: space.sm },
});
