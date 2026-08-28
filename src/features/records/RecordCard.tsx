// One hub record = header bar (event / deployment / class / vet visit) + child rows (exercises, or the
// record itself). Same content on phone and desktop; the phone stacks what the desktop puts in columns.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Muted, StatusPill, Text, radius, space, useColors, type StatusKind } from '@/ui';
import { fmtShortDateTime } from './format';
import { KIND_ICON, type HubRecord, type HubRow } from './model';

export interface MenuTarget { record: HubRecord; row?: HubRow }

export interface RecordCardProps {
  record: HubRecord;
  desktop: boolean;
  showHandler: boolean;
  selected: Set<string>;
  onToggleSelect: (rowId: string) => void;
  onOpen: (route: string) => void;
  onMenu: (t: MenuTarget) => void;
  onUndecided?: (record: HubRecord) => void;
}

function statusKind(row: HubRow): StatusKind {
  switch (row.status) {
    case 'incomplete': return 'incomplete';
    case 'rejected': return 'rejected';
    case 'outdated': return 'outdated';
    case 'reviewed': return 'reviewed';
    case 'not_reviewed': return 'not_reviewed';
    case 'upcoming': return 'neutral';
    case 'due': return 'due';
    default: return 'complete';
  }
}

export const RecordCard = React.memo(function RecordCard({ record: r, desktop, showHandler, selected, onToggleSelect, onOpen, onMenu, onUndecided }: RecordCardProps) {
  const c = useColors();
  const tone = {
    training: { bg: c.primarySoft, fg: c.primary },
    deployment: { bg: c.surfaceAlt, fg: c.text },
    class: { bg: c.infoSoft, fg: c.info },
    vet: { bg: c.dangerSoft, fg: c.danger },
  }[r.kind];
  const when = fmtShortDateTime(r.at, r.tz);
  const where = r.location || '—';
  const headLine = desktop ? `${where} - ${when}` : `${when} - ${where}`;
  const showDogsInHeader = r.kind === 'deployment' || r.kind === 'vet';
  return (
    <View testID={`record-${r.id}`} accessibilityLabel={`${r.title}, ${headLine}`} style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}>
      {/* Header bar */}
      <View style={[styles.head, { backgroundColor: tone.bg }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${r.title}`} testID={`record-open-${r.id}`} onPress={() => onOpen(r.routeView)} style={styles.headMain}>
          <Ionicons name={KIND_ICON[r.kind]} size={22} color={tone.fg} style={{ marginRight: space.sm }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={[styles.headTitleRow, desktop ? null : { flexDirection: 'column', alignItems: 'flex-start', gap: 0 }]}>
              <Text variant="bodyStrong" style={{ color: tone.fg }} numberOfLines={1} testID={`record-title-${r.id}`}>{r.title}</Text>
              <Text style={{ color: c.text, flexShrink: 1 }} numberOfLines={desktop ? 1 : 2} testID={`record-when-${r.id}`}>{headLine}</Text>
            </View>
            {(showDogsInHeader && r.dogNames.length) || (showHandler && r.handlerNames.length) ? (
              <Muted numberOfLines={1}>
                {showDogsInHeader && r.dogNames.length ? r.dogNames.join(', ') : ''}
                {showDogsInHeader && r.dogNames.length && showHandler && r.handlerNames.length ? ' · ' : ''}
                {showHandler && r.handlerNames.length ? `Handler: ${r.handlerNames.join(', ')}` : ''}
              </Muted>
            ) : null}
          </View>
        </Pressable>
        {r.attendance ? (
          r.attendance.undecided && onUndecided ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Undecided — answer the invitation" testID={`btn-undecided-${r.id}`} onPress={() => onUndecided(r)} style={[styles.chip, { backgroundColor: c.warningSoft, borderColor: c.warning }]}>
              <Text style={{ color: c.warning, fontWeight: '700' }}>Undecided</Text>
            </Pressable>
          ) : (
            <View testID={`chip-attendance-${r.id}`} style={[styles.chip, { backgroundColor: r.attendance.tone === 'success' ? c.successSoft : r.attendance.tone === 'danger' ? c.dangerSoft : c.surface, borderColor: r.attendance.tone === 'success' ? c.success : r.attendance.tone === 'danger' ? c.danger : c.border }]}>
              <Text style={{ color: r.attendance.tone === 'success' ? c.success : r.attendance.tone === 'danger' ? c.danger : c.muted, fontWeight: '600' }}>{r.attendance.label}</Text>
            </View>
          )
        ) : null}
        {r.kind === 'training' && r.canEdit && r.routeAddExercise && desktop ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Add exercise" testID={`btn-add-exercise-${r.id}`} onPress={() => onOpen(r.routeAddExercise!)} style={styles.inlineBtn}>
            <Ionicons name="add" size={20} color={c.primary} />
            <Text variant="bodyStrong" color="primary">EXERCISE</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`More actions for ${r.title}`} testID={`btn-record-menu-${r.id}`} onPress={() => onMenu({ record: r })} hitSlop={6} style={styles.dots}>
          <Ionicons name="ellipsis-horizontal" size={24} color={c.text} />
        </Pressable>
      </View>
      {/* Child rows */}
      {r.rows.map((row, i) => {
        const isSel = selected.has(row.id);
        return (
          <View key={row.id} testID={`row-${row.id}`} style={[styles.row, { borderTopColor: c.border, borderTopWidth: i === 0 ? 0 : 1 }, desktop ? null : styles.rowPhone]}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isSel }} {...({ 'aria-checked': isSel } as object)} accessibilityLabel={`Select ${row.title} for a report`} testID={`check-${row.id}`} onPress={() => onToggleSelect(row.id)} hitSlop={6} style={styles.check}>
              <Ionicons name={isSel ? 'checkbox' : 'square-outline'} size={24} color={isSel ? c.primary : c.muted} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${row.title}`} testID={`row-open-${row.id}`} onPress={() => onOpen(row.routeView)} style={[styles.rowMain, desktop ? { flexDirection: 'row', alignItems: 'center' } : null]}>
              <View style={[styles.rowTitleWrap, desktop ? { flex: 2 } : null]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={row.icon} size={20} color={c.primary} />
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{row.title}</Text>
                </View>
                {row.subtitle ? <Muted numberOfLines={desktop ? 1 : 2}>{row.subtitle}</Muted> : null}
              </View>
              {row.dogNames.length && !showDogsInHeader ? (
                <View style={[styles.cell, desktop ? { flex: 1 } : null]}>
                  <Text numberOfLines={1} testID={`row-dogs-${row.id}`}>{desktop ? '' : 'Dog: '}{row.dogNames.join(', ')}</Text>
                </View>
              ) : desktop && !showDogsInHeader ? <View style={[styles.cell, { flex: 1 }]} /> : null}
              {showHandler ? (
                <View style={[styles.cell, desktop ? { flex: 1 } : null]}>
                  <Text numberOfLines={1} testID={`row-handler-${row.id}`}>{desktop ? '' : 'Handler: '}{row.handlerName || '—'}</Text>
                </View>
              ) : null}
              <View style={[styles.statusCell, desktop ? { flex: 1.2, justifyContent: 'flex-end' } : null]}>
                {row.review ? (
                  <Ionicons
                    name={row.review === 'reviewed' ? 'shield-checkmark' : row.review === 'rejected' ? 'alert-circle' : 'shield-outline'}
                    size={20}
                    color={row.review === 'reviewed' ? c.success : row.review === 'rejected' ? c.danger : c.muted}
                    accessibilityLabel={row.review === 'reviewed' ? 'Reviewed' : row.review === 'rejected' ? 'Rejected' : 'Not reviewed'}
                    testID={`review-icon-${row.id}`}
                  />
                ) : null}
                {row.isOutdated && row.status !== 'outdated' ? <Ionicons name="time" size={20} color={c.warning} accessibilityLabel="Outdated" /> : null}
                <StatusPill status={statusKind(row)} label={row.statusLabel} testID={`pill-${row.id}`} />
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`More actions for ${row.title}`} testID={`btn-row-menu-${row.id}`} onPress={() => onMenu({ record: r, row })} hitSlop={6} style={styles.dots}>
              <Ionicons name="ellipsis-horizontal" size={24} color={c.text} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden', marginBottom: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.md, paddingRight: 4, minHeight: 52, gap: space.sm },
  headMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  headTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  chip: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  inlineBtn: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: space.sm, gap: 2 },
  dots: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 4, minHeight: 56 },
  rowPhone: { alignItems: 'flex-start', paddingVertical: 6 },
  check: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, minWidth: 0, gap: 4, paddingVertical: 6 },
  rowTitleWrap: { minWidth: 0 },
  cell: { minWidth: 0, paddingHorizontal: 4 },
  statusCell: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingHorizontal: 4 },
});
