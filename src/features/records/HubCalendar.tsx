// Records calendar — desktop: three months side by side (‹ › page by three); phone: one larger month
// (‹ › by one). Markers: dot = training day, star = deployment day, outlined = an incomplete record
// that day, red + = vet visit, orange square = class. Filtered days are grey-highlighted.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Calendar, Muted, Text, type DayMarkers, space, useColors, useIsDesktop } from '@/ui';
import type { HubRecord } from './model';

export interface MonthCursor { year: number; month: number } // month 1-12

export function addMonths(cur: MonthCursor, n: number): MonthCursor {
  const d = new Date(cur.year, cur.month - 1 + n, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Marker map for every day that has a record (unfiltered), plus highlight for filtered days. */
export function buildMarkers(all: HubRecord[], filtered: HubRecord[] | null): Record<string, DayMarkers> {
  const out: Record<string, DayMarkers> = {};
  for (const r of all) {
    const m = (out[r.dayKey] ||= {});
    switch (r.kind) {
      case 'training': {
        const inc = r.isIncomplete && !r.isUpcoming;
        if (m.training === 'complete' && inc) m.training = 'partial';
        else if (m.training === 'incomplete' && !inc) m.training = 'partial';
        else if (!m.training) m.training = inc ? 'incomplete' : 'complete';
        break;
      }
      case 'deployment':
        if (m.deployment !== 'incomplete') m.deployment = r.isIncomplete ? 'incomplete' : 'complete';
        break;
      case 'vet': m.vet = true; break;
      case 'class': m.classRecord = true; break;
    }
  }
  if (filtered) {
    for (const r of filtered) (out[r.dayKey] ||= {}).highlight = true;
  }
  return out;
}

export function HubCalendar({ cursor, onCursor, markers, selected, onSelect }: {
  cursor: MonthCursor;
  onCursor: (c: MonthCursor) => void;
  markers: Record<string, DayMarkers>;
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const desktop = useIsDesktop();
  const c = useColors();
  const months = desktop ? [addMonths(cursor, -2), addMonths(cursor, -1), cursor] : [cursor];
  const step = desktop ? 3 : 1;
  const pick = (day: string) => onSelect(selected === day ? null : day);
  return (
    <View testID="hub-calendar" style={{ marginBottom: space.md }}>
      <View style={[styles.row, desktop ? { flexDirection: 'row', gap: space.sm } : null]}>
        {months.map((m, i) => (
          <View key={`${m.year}-${m.month}`} style={desktop ? { flex: 1, minWidth: 0 } : null} testID={`calendar-month-${i}`}>
            <Calendar
              year={m.year}
              month={m.month}
              markers={markers}
              selected={selected}
              onSelect={pick}
              onPrev={i === 0 ? () => onCursor(addMonths(cursor, -step)) : undefined}
              onNext={i === months.length - 1 ? () => onCursor(addMonths(cursor, step)) : undefined}
              compact={desktop}
            />
          </View>
        ))}
      </View>
      <View style={styles.legend} accessibilityLabel="Calendar legend">
        <View style={[styles.dot, { backgroundColor: c.primary, borderColor: c.primary }]} /><Muted>Training</Muted>
        <View style={[styles.dot, { backgroundColor: 'transparent', borderColor: c.primary }]} /><Muted>Incomplete</Muted>
        <Text style={{ color: c.accentInk, fontSize: 16, lineHeight: 18 }}>★</Text><Muted>Deployment</Muted>
        <Text style={{ color: c.danger, fontSize: 16, lineHeight: 18, fontWeight: '700' }}>+</Text><Muted>Vet</Muted>
        <View style={[styles.square, { backgroundColor: c.warning }]} /><Muted>Class</Muted>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {},
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, marginLeft: 8 },
  square: { width: 9, height: 9, borderRadius: 1, marginLeft: 8 },
});
