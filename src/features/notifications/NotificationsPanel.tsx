// The bell dropdown (bar §2.3): tapping the header bell opens a panel anchored under it — the most recent
// notifications, each with a check-mark that dismisses (marks read) that one message, "Mark all as read",
// and a link to the full /notifications page. Tapping a message opens its record. The panel and the page
// read the same rows, so the bell badge, the panel and the page can never disagree.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { Notification, NotificationType } from '@/db/types';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button, IconButton, Muted, Row, Text, fmtRelative, fmtDateTime, useColors, useIsDesktop, radius, space } from '@/ui';

const ICON: Partial<Record<NotificationType, keyof typeof Ionicons.glyphMap>> = {
  record_rejected: 'alert-circle', manager_feedback: 'chatbubble-ellipses', trainer_comment: 'chatbubbles', record_update: 'time', upcoming_event: 'calendar',
  exercise_ready_to_complete: 'clipboard', exercise_completion_past_due: 'hourglass', exercise_ready_for_comments: 'create', exercise_ready_for_supervisor_review: 'shield-half',
  deployment_ready_for_supervisor_review: 'shield-half', invitation: 'person-add', group_request: 'people', vaccination_due: 'medkit', general_update: 'information-circle', billing: 'card', record_shared: 'share-social',
};

const PANEL_MAX = 8;

export function NotificationsPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const repo = useRepo();
  const router = useRouter();
  const c = useColors();
  const desktop = useIsDesktop();
  const { height } = useWindowDimensions();
  const all = useList('notification', (n) => n.user_id === user?.id);
  const rows = [...all].sort((a, b) => (a.read === b.read ? (a.created_at < b.created_at ? 1 : -1) : a.read ? 1 : -1)).slice(0, PANEL_MAX);
  const unread = all.filter((n) => !n.read).length;

  const dismiss = async (n: Notification) => { await repo.upsert('notification', { id: n.id, read: true }, { silent: true }); };
  const markAll = async () => { for (const n of all) if (!n.read) await repo.upsert('notification', { id: n.id, read: true }, { silent: true }); };
  const open = async (n: Notification) => {
    if (!n.read) await dismiss(n);
    onClose();
    if (n.link) router.push(n.link as never);
  };
  const go = (href: string) => { onClose(); router.push(href as never); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close notifications" onPress={onClose} style={[styles.overlay, { backgroundColor: c.overlay, alignItems: desktop ? 'flex-end' : 'center' }]}>
        <Pressable
          accessibilityViewIsModal
          onPress={() => {}}
          testID="panel-notifications"
          style={[styles.panel, {
            backgroundColor: c.surface, borderColor: c.border,
            marginTop: desktop ? 64 : (Platform.OS === 'web' ? 60 : 96),
            marginRight: desktop ? space.md : 0,
            width: desktop ? 400 : '96%',
            maxHeight: height * 0.7,
          }]}
        >
          <Row justify="space-between" style={[styles.header, { borderBottomColor: c.border }]}>
            <Text variant="bodyStrong" style={{ flex: 1 }} testID="text-panel-title">Notifications{unread ? ` (${unread} unread)` : ''}</Text>
            <IconButton icon="close" accessibilityLabel="Close notifications" testID="btn-close-notifications-panel" onPress={onClose} />
          </Row>
          {rows.length === 0 ? (
            <View style={{ padding: space.md }}><Muted testID="panel-empty">No To Do items.</Muted></View>
          ) : (
            <ScrollView style={{ maxHeight: height * 0.5 }}>
              {rows.map((n, i) => (
                // The tappable body and the check-mark are SIBLINGS (a button must never nest a button).
                <View key={n.id} style={[styles.row, { borderBottomColor: c.border, borderBottomWidth: i === rows.length - 1 ? 0 : 1, backgroundColor: n.read ? 'transparent' : c.primarySoft }]} testID={`panel-notification-${n.id}`}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${n.read ? '' : 'Unread: '}${n.title}`}
                    testID={`panel-notification-open-${n.id}`}
                    onPress={() => void open(n)}
                    style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [styles.body, { backgroundColor: pressed || hovered ? c.surfaceAlt : 'transparent' }]}
                  >
                    <Ionicons name={ICON[n.type] || 'notifications-outline'} size={22} color={n.type === 'record_rejected' ? c.danger : c.primary} style={{ marginRight: space.sm, marginTop: 2 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant={n.read ? 'body' : 'bodyStrong'} numberOfLines={2}>{n.title}</Text>
                      <Text color={n.read ? 'muted' : 'text'} numberOfLines={2}>{n.body}</Text>
                      <Muted accessibilityLabel={fmtDateTime(n.created_at, n.tz)}>{fmtRelative(n.created_at)}</Muted>
                    </View>
                  </Pressable>
                  <IconButton
                    icon={n.read ? 'checkmark-circle' : 'checkmark-circle-outline'}
                    accessibilityLabel={n.read ? `${n.title} — already read` : `Dismiss ${n.title}`}
                    testID={`btn-panel-dismiss-${n.id}`}
                    onPress={() => void dismiss(n)}
                    color={n.read ? c.success : c.muted}
                  />
                </View>
              ))}
            </ScrollView>
          )}
          <Row justify="space-between" wrap style={[styles.footer, { borderTopColor: c.border }]}>
            <Button title="Mark all as read" variant="ghost" icon="checkmark-done-outline" disabled={!unread} onPress={() => void markAll()} testID="btn-panel-mark-all-read" />
            <Button title="See all" variant="secondary" icon="open-outline" onPress={() => go('/notifications')} testID="btn-panel-see-all" />
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  panel: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  header: { paddingLeft: space.md, paddingRight: space.xs, paddingVertical: space.xs, borderBottomWidth: 1, minHeight: 52 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingRight: 4, minHeight: 56 },
  body: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, paddingLeft: space.sm, paddingRight: space.xs, borderRadius: radius.sm },
  footer: { borderTopWidth: 1, paddingHorizontal: space.sm, paddingVertical: space.xs },
});
