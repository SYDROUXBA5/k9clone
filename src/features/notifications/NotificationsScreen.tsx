// NOTIFICATIONS — the bell list: unread bold, per-row check-mark "Mark as read", "Mark all as read",
// "Dismiss All Notifications", tap → the linked record; empty state "No To Do items".
// The shell's bell badge reads the same unread count. Per-type toggles (<NotificationPrefs/>) at the bottom.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { Notification, NotificationType } from '@/db/types';
import { NOTIFICATION_TYPES } from '@/db/vocab';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button, Card, ConfirmDialog, EmptyState, IconButton, Muted, Row, Screen, Segmented, Text, fmtRelative, fmtDateTime, useColors, useToast, radius, space } from '@/ui';
import { NotificationPrefs } from './NotificationPrefs';

const ICON: Partial<Record<NotificationType, keyof typeof import('@expo/vector-icons').Ionicons.glyphMap>> = {
  record_rejected: 'alert-circle', manager_feedback: 'chatbubble-ellipses', trainer_comment: 'chatbubbles', record_update: 'time', upcoming_event: 'calendar',
  exercise_ready_to_complete: 'clipboard', exercise_completion_past_due: 'hourglass', exercise_ready_for_comments: 'create', exercise_ready_for_supervisor_review: 'shield-half',
  deployment_ready_for_supervisor_review: 'shield-half', invitation: 'person-add', group_request: 'people', vaccination_due: 'medkit', general_update: 'information-circle', billing: 'card', record_shared: 'share-social',
};
const typeLabel = (t: NotificationType) => NOTIFICATION_TYPES.find((x) => x.value === t)?.label || t;

export function NotificationsScreen() {
  const { user } = useAuth();
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const all = useList('notification', (n) => n.user_id === user?.id);
  const rows = useMemo(() => [...all].filter((n) => filter === 'all' || !n.read).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)), [all, filter]);
  const unread = all.filter((n) => !n.read).length;

  const markRead = async (n: Notification, read = true) => {
    await repo.upsert('notification', { id: n.id, read }, { silent: true });
  };
  const markAll = async () => {
    for (const n of all) if (!n.read) await repo.upsert('notification', { id: n.id, read: true }, { silent: true });
    toast.show('All notifications marked as read');
  };
  const dismissAll = async () => {
    setConfirmDismiss(false);
    for (const n of all) await repo.remove('notification', n.id, { silent: true });
    toast.show('Notifications dismissed');
  };
  const open = async (n: Notification) => {
    if (!n.read) await markRead(n);
    if (n.link) router.push(n.link as never);
  };

  return (
    <Screen
      title="Notifications"
      subtitle={unread ? `${unread} unread` : 'You are all caught up.'}
      testID="screen-notifications"
      actions={(
        <>
          <Button title="Mark all as read" variant="secondary" icon="checkmark-done-outline" onPress={() => void markAll()} disabled={!unread} testID="btn-mark-all-read" />
          <Button title="Dismiss All Notifications" variant="ghost" icon="trash-outline" onPress={() => setConfirmDismiss(true)} disabled={!all.length} testID="btn-dismiss-all" />
        </>
      )}
    >
      <View style={{ marginBottom: space.md }}>
        <Segmented label="Show" options={[{ value: 'all', label: `All (${all.length})` }, { value: 'unread', label: `Unread (${unread})` }]} value={filter} onChange={setFilter} testID="seg-notifications-filter" />
      </View>
      {rows.length === 0 ? (
        <EmptyState icon="notifications-off-outline" title="No To Do items" body={filter === 'unread' ? 'Every notification has been read.' : 'Rejections, trainer comments, group requests and reminders will appear here.'} testID="empty-notifications" />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }} testID="list-notifications">
          {rows.map((n, i) => (
            // The tappable body and the check-mark are SIBLINGS (a button must never nest a button).
            <View key={n.id} style={[styles.row, { borderBottomColor: c.border, borderBottomWidth: i === rows.length - 1 ? 0 : 1, backgroundColor: n.read ? 'transparent' : c.primarySoft }]} testID={`notification-${n.id}`}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${n.read ? '' : 'Unread: '}${n.title}`}
                testID={`notification-open-${n.id}`}
                onPress={() => void open(n)}
                style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [styles.body, { backgroundColor: pressed || hovered ? c.surfaceAlt : 'transparent' }]}
              >
                <View style={[styles.dot, { backgroundColor: n.read ? 'transparent' : c.accent }]} />
                <Ionicons name={ICON[n.type] || 'notifications-outline'} size={24} color={n.type === 'record_rejected' ? c.danger : c.primary} style={{ marginRight: space.sm, marginTop: 2 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant={n.read ? 'body' : 'bodyStrong'} testID={`notification-title-${n.id}`}>{n.title}</Text>
                  <Text color={n.read ? 'muted' : 'text'} style={{ marginTop: 2 }}>{n.body}</Text>
                  <Row wrap gap={space.sm} style={{ marginTop: 4 }}>
                    <Muted>{typeLabel(n.type)}</Muted>
                    <Muted>·</Muted>
                    <Muted accessibilityLabel={fmtDateTime(n.created_at, n.tz)}>{fmtRelative(n.created_at)}</Muted>
                    {n.email_sent ? <Muted testID={`notification-email-${n.id}`}>· ✉ email sent to {n.email_to}</Muted> : null}
                    {n.link ? <Muted>· tap to open</Muted> : null}
                  </Row>
                </View>
              </Pressable>
              <IconButton
                icon={n.read ? 'checkmark-circle' : 'checkmark-circle-outline'}
                accessibilityLabel={n.read ? 'Mark as unread' : 'Mark as read'}
                testID={`btn-mark-read-${n.id}`}
                onPress={() => void markRead(n, !n.read)}
                color={n.read ? c.success : c.muted}
              />
            </View>
          ))}
        </Card>
      )}
      <View style={{ height: space.lg }} />
      <NotificationPrefs />
      <ConfirmDialog visible={confirmDismiss} title="Dismiss all notifications?" body={`This removes ${all.length} notification${all.length === 1 ? '' : 's'} from your list.`} confirmTitle="Dismiss all" onConfirm={() => void dismissAll()} onCancel={() => setConfirmDismiss(false)} testID="dialog-dismiss-all" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingRight: space.xs, minHeight: 56 },
  body: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingLeft: space.sm, paddingRight: space.sm, borderRadius: radius.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 9, marginRight: space.sm },
});
