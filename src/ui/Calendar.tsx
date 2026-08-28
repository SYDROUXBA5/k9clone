// Calendar month grid — reusable by the Records hub (U2). Markers per day: dot = training,
// star = deployment, outlined = incomplete; extra glyphs (vet '+', class) via `extra`.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton } from './Button';
import { Muted, Text } from './Text';
import { useColors } from './theme';
import { radius, space } from './tokens';

export interface DayMarkers {
  training?: 'complete' | 'incomplete' | 'partial';
  deployment?: 'complete' | 'incomplete';
  vet?: boolean;
  classRecord?: boolean;
  /** Day matches the active filter (grey-highlighted cell). */
  highlight?: boolean;
}
/** Human description of a day's markers — read by screen readers and by verification tools. */
export function describeMarkers(m?: DayMarkers): string {
  if (!m) return '';
  const parts: string[] = [];
  if (m.training) parts.push(m.training === 'incomplete' ? 'incomplete training' : m.training === 'partial' ? 'training (some incomplete)' : 'training');
  if (m.deployment) parts.push(m.deployment === 'incomplete' ? 'incomplete deployment' : 'deployment');
  if (m.vet) parts.push('vet visit');
  if (m.classRecord) parts.push('class');
  return parts.length ? `, has records: ${parts.join(', ')}` : '';
}
/** Compact glyph code for the DOM (`dot`, `dot-outline`, `star`, `star-outline`, `plus`, `square`). */
export function markerCode(m?: DayMarkers): string {
  if (!m) return '';
  const parts: string[] = [];
  if (m.training) parts.push(m.training === 'incomplete' ? 'dot-outline' : m.training === 'partial' ? 'dot-half' : 'dot');
  if (m.deployment) parts.push(m.deployment === 'incomplete' ? 'star-outline' : 'star');
  if (m.vet) parts.push('plus');
  if (m.classRecord) parts.push('square');
  return parts.join(' ');
}
export interface CalendarProps {
  year: number;
  month: number; // 1-12
  markers: Record<string, DayMarkers>; // key YYYY-MM-DD
  selected?: string | null;
  onSelect?: (date: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
  showNav?: boolean;
  testID?: string;
  compact?: boolean;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthKey(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function Calendar({ year, month, markers, selected, onSelect, onPrev, onNext, showNav = true, testID, compact }: CalendarProps) {
  const c = useColors();
  const first = new Date(year, month - 1, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = new Date();
  const todayKey = monthKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
  return (
    <View testID={testID} style={[styles.wrap, { borderColor: c.border, backgroundColor: c.surface }]}>
      <View style={styles.header}>
        {showNav && onPrev ? <IconButton icon="chevron-back" onPress={onPrev} accessibilityLabel="Previous month" testID="btn-cal-prev" /> : <View style={{ width: 44, height: 44 }} />}
        <Text variant="bodyStrong" style={{ flex: 1, textAlign: 'center' }}>{MONTHS[month - 1]} {year}</Text>
        {showNav && onNext ? <IconButton icon="chevron-forward" onPress={onNext} accessibilityLabel="Next month" testID="btn-cal-next" /> : <View style={{ width: 44, height: 44 }} />}
      </View>
      <View style={styles.row}>
        {WEEKDAYS.map((w, i) => <Muted key={i} style={styles.dow}>{w}</Muted>)}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, r) => (
        <View key={r} style={styles.row}>
          {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
            if (!d) return <View key={i} style={[styles.cell, compact ? styles.cellCompact : null]} />;
            const key = monthKey(year, month, d);
            const m = markers[key];
            const isSel = selected === key;
            const isToday = key === todayKey;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${MONTHS[month - 1]} ${d} ${year}${describeMarkers(m)}`}
                testID={`cal-day-${key}`}
                {...({ 'data-markers': markerCode(m) } as object)}
                onPress={() => onSelect?.(key)}
                accessibilityState={{ selected: isSel }}
                style={[styles.cell, compact ? styles.cellCompact : null, { borderRadius: radius.sm, backgroundColor: isSel ? c.primarySoft : m?.highlight ? c.border : 'transparent', borderColor: isToday ? c.accent : 'transparent', borderWidth: 1 }]}
              >
                <Text style={{ fontSize: 16, lineHeight: 20, color: isSel ? c.primary : c.text, fontWeight: isToday ? '700' : '400' }}>{d}</Text>
                <View style={styles.marks}>
                  {m?.training ? (
                    <View style={[styles.dot, { backgroundColor: m.training === 'incomplete' ? 'transparent' : m.training === 'partial' ? c.primarySoft : c.primary, borderColor: c.primary }]} />
                  ) : null}
                  {m?.deployment ? <Ionicons name={m.deployment === 'incomplete' ? 'star-outline' : 'star'} size={16} color={c.accentInk} style={{ lineHeight: 16 }} /> : null}
                  {m?.vet ? <Ionicons name="add" size={16} color={c.danger} style={{ lineHeight: 16 }} /> : null}
                  {m?.classRecord ? <View style={[styles.square, { backgroundColor: c.warning }]} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: radius.md, padding: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  row: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4 },
  cellCompact: { minHeight: 40 },
  marks: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 16, marginTop: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  square: { width: 7, height: 7, borderRadius: 1 },
});
