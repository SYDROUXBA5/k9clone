// HISTORY — every add / modify / delete for the current user (supervisors: managed handlers too),
// reverse-chronological, filterable by entity and action, with an expandable field diff.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useList } from '@/db/provider';
import { ENTITY_LABEL, type EntityName, type HistoryAction, type HistoryEvent } from '@/db/types';
import { useAuth, useVisibleUserIds } from '@/features/auth/AuthProvider';
import { Badge, Button, Card, EmptyState, Muted, Row, Screen, Select, Text, fmtDateTime, tzShort, useColors, useIsDesktop, radius, space } from '@/ui';

const ACTION_LABEL: Record<HistoryAction, string> = { add: 'Added', modify: 'Modified', delete: 'Deleted' };
const ENTITY_ROUTE: Partial<Record<EntityName, (id: string) => string>> = {
  dog: (id) => `/dogs/${id}`,
  completion: (id) => `/records/training/${id}`,
  exercise: (id) => `/records/training/${id}`,
  training_event: (id) => `/records/training/${id}`,
  deployment: (id) => `/records/deployment/${id}`,
  class_record: (id) => `/records/class/${id}`,
  vet_visit: (id) => `/records/vet/${id}`,
  custom_entry: () => '/custom-entries',
  training_group: () => '/groups',
  management_group: () => '/groups',
  narrative_template: () => '/profile',
};

export function HistoryScreen() {
  const { user, role } = useAuth();
  const visible = useVisibleUserIds();
  const router = useRouter();
  const desktop = useIsDesktop();
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [limit, setLimit] = useState(100);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const users = useList('user');
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name || (id === 'system' ? 'System' : id);
  const all = useList('history_event');
  const rows = useMemo(() => {
    const set = new Set(visible);
    return all
      .filter((h) => set.has(h.actor_id) || set.has(h.owner_user_id))
      .filter((h) => (!entity || h.entity === entity) && (!action || h.action === action))
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }, [all, visible, entity, action]);
  const entityOptions = useMemo(() => {
    const present = new Set(all.filter((h) => visible.includes(h.actor_id) || visible.includes(h.owner_user_id)).map((h) => h.entity));
    return [{ value: '', label: 'All entities' }, ...[...present].sort().map((e) => ({ value: e, label: ENTITY_LABEL[e] }))];
  }, [all, visible]);
  const shown = rows.slice(0, limit);
  return (
    <Screen
      title="History"
      subtitle={role === 'supervisor' ? 'Every change made by you and your managed handlers.' : 'Every add, modify and delete on your account.'}
      testID="screen-history"
    >
      <View style={[styles.filters, desktop ? { flexDirection: 'row' } : null]}>
        <Select label="Entity" options={entityOptions} value={entity} onChange={setEntity} testID="select-history-entity" allowCustom={false} containerStyle={desktop ? { flex: 1 } : undefined} />
        <Select label="Action" options={[{ value: '', label: 'All actions' }, { value: 'add', label: 'Added' }, { value: 'modify', label: 'Modified' }, { value: 'delete', label: 'Deleted' }]} value={action} onChange={setAction} testID="select-history-action" allowCustom={false} containerStyle={desktop ? { flex: 1 } : undefined} />
      </View>
      <Muted style={{ marginBottom: space.sm }} testID="text-history-count">Showing {shown.length} of {rows.length} events</Muted>
      {rows.length === 0 ? (
        <EmptyState icon="time-outline" title="No history yet" body="Changes appear here as soon as you save a record." testID="empty-history" />
      ) : (
        <View style={{ gap: space.sm }} testID="list-history">
          {shown.map((h) => (
            <HistoryRow key={h.id} h={h} actorName={nameOf(h.actor_id)} isSelf={h.actor_id === user?.id} expanded={!!expanded[h.id]} onToggle={() => setExpanded((e) => ({ ...e, [h.id]: !e[h.id] }))} onOpen={ENTITY_ROUTE[h.entity] && h.action !== 'delete' ? () => router.push(ENTITY_ROUTE[h.entity]!(h.entity_id) as never) : undefined} />
          ))}
          {rows.length > shown.length ? <Button title={`Show ${Math.min(100, rows.length - shown.length)} more`} variant="secondary" onPress={() => setLimit((l) => l + 100)} testID="btn-history-more" /> : null}
        </View>
      )}
    </Screen>
  );
}

function HistoryRow({ h, actorName, isSelf, expanded, onToggle, onOpen }: { h: HistoryEvent; actorName: string; isSelf: boolean; expanded: boolean; onToggle: () => void; onOpen?: () => void }) {
  const c = useColors();
  const tone = h.action === 'add' ? c.success : h.action === 'delete' ? c.danger : c.info;
  const icon = h.action === 'add' ? 'add-circle' : h.action === 'delete' ? 'trash' : 'create';
  const diffKeys = Object.keys(h.diff || {});
  return (
    <Card testID={`history-${h.id}`} style={{ padding: 0 }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={`${ACTION_LABEL[h.action]} ${ENTITY_LABEL[h.entity]} ${h.label}${expanded ? ', collapse' : ', expand'}`} accessibilityState={{ expanded }} style={styles.rowHead}>
        <View style={[styles.iconWrap, { backgroundColor: tone }]}><Ionicons name={icon} size={20} color="#fff" /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row wrap gap={6}>
            <Text variant="bodyStrong">{ACTION_LABEL[h.action]}</Text>
            <Badge>{ENTITY_LABEL[h.entity]}</Badge>
            <Text numberOfLines={1} style={{ flexShrink: 1 }}>{h.label}</Text>
          </Row>
          <Muted>{isSelf ? 'You' : actorName} · {fmtDateTime(h.at, h.tz)} {tzShort(h.tz, h.at)} · {h.action === 'delete' ? 'record removed' : `${diffKeys.length} field${diffKeys.length === 1 ? '' : 's'}`}</Muted>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={c.muted} />
      </Pressable>
      {expanded ? (
        <View style={[styles.diff, { borderTopColor: c.border }]}>
          {h.action === 'delete' ? (
            <Text testID={`text-deleted-${h.id}`}>{ENTITY_LABEL[h.entity]} “{h.label}” was deleted on {fmtDateTime(h.at, h.tz)} by {isSelf ? 'you' : actorName}. The record is kept for History and reports.</Text>
          ) : null}
          <Muted style={{ marginBottom: 4 }}>{h.action === 'delete' ? `Deleted ${ENTITY_LABEL[h.entity].toLowerCase()} id` : 'Record id'}: {h.entity_id}</Muted>
          {h.action === 'delete' ? null : diffKeys.length === 0 ? <Muted>No field changes recorded.</Muted> : diffKeys.map((k) => (
            <View key={k} style={styles.diffRow}>
              <Text variant="label" style={{ width: 160 }}>{k}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                {h.action !== 'add' ? <Text style={{ color: c.danger }}>− {fmtVal(h.diff[k].from)}</Text> : null}
                {h.action !== 'delete' ? <Text style={{ color: c.success }}>+ {fmtVal(h.diff[k].to)}</Text> : null}
              </View>
            </View>
          ))}
          {onOpen ? <Button title="Open record" variant="secondary" icon="open-outline" onPress={onOpen} testID={`btn-open-${h.id}`} style={{ alignSelf: 'flex-start', marginTop: space.sm }} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

function fmtVal(v: unknown): string {
  if (v === undefined || v === null || v === '') return '(empty)';
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') : '(empty)';
  const s = JSON.stringify(v);
  return s.length > 200 ? s.slice(0, 200) + '…' : s;
}

const styles = StyleSheet.create({
  filters: { gap: space.sm },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, minHeight: 56 },
  iconWrap: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  diff: { borderTopWidth: 1, padding: space.md, gap: 6 },
  diffRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, flexWrap: 'wrap' },
});
