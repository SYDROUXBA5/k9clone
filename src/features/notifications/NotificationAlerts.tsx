// PT-NOT-05 — in-app alerts are "shown in the bottom of the interface" (bar §2.3 row 2, §4 row 1):
// a persistent alert strip pinned under the content on every screen while unread notifications exist
// and the bell panel / drawer is closed. It always names the NOTIFICATIONS menu item so the reader
// knows where the full list lives.
// On a phone-width viewport (< 700 px) a *new* notification arriving while that panel is closed also
// raises a toast that names the count of active notifications and points at the main menu (upper left)
// → NOTIFICATIONS "to review them later" (bar §2.3 row 7).
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useList } from '@/db/provider';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button, IconButton, Muted, Text, useColors, useReportBottomInset, useToast, radius, space } from '@/ui';

/** Below this width the alert also raises the mobile toast (the drawer replaces the sidebar at 900). */
export const ALERT_PHONE_WIDTH = 700;

const plural = (n: number) => (n === 1 ? 'notification' : 'notifications');

export function NotificationAlerts({ suppressed, onOpen }: { suppressed: boolean; onOpen: () => void }) {
  const { user } = useAuth();
  const c = useColors();
  const toast = useToast();
  const reportBottomInset = useReportBottomInset();
  const { width } = useWindowDimensions();
  const unread = useList('notification', (n) => n.user_id === user?.id && !n.read);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const seen = useRef<{ userId: string | null; ids: Set<string> } | null>(null);
  const phone = width < ALERT_PHONE_WIDTH;
  // Newest first — the strip shows the latest arrival and counts the rest.
  const rows = [...unread].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const key = rows.map((n) => n.id).join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    const uid = user?.id ?? null;
    // First render for this user is the baseline: notifications already sitting there did not "arrive".
    if (!seen.current || seen.current.userId !== uid) { seen.current = { userId: uid, ids: new Set(ids) }; return; }
    const fresh = ids.filter((id) => !seen.current!.ids.has(id));
    seen.current = { userId: uid, ids: new Set(ids) };
    if (!fresh.length || suppressed || !phone) return;
    toast.show(
      `${ids.length} active ${plural(ids.length)} — open the menu (upper left) → NOTIFICATIONS to review them later.`,
      'info',
      { title: 'NOTIFICATIONS', onPress: onOpen },
    );
  }, [key, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = rows.find((n) => !dismissed.includes(n.id));
  const visible = Boolean(user && top && !suppressed);
  // The support bubble and the field-help panel float over the bottom corners; tell them how tall
  // this strip is so they sit above it instead of on top of its NOTIFICATIONS / dismiss buttons.
  useEffect(() => { if (!visible) reportBottomInset('notification-alerts', 0); }, [visible, reportBottomInset]);
  useEffect(() => () => reportBottomInset('notification-alerts', 0), [reportBottomInset]);
  if (!user || !top || suppressed) return null;
  const others = rows.filter((n) => !dismissed.includes(n.id)).length - 1;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="banner-notification-alert"
      onLayout={(e) => reportBottomInset('notification-alerts', e.nativeEvent.layout.height)}
      style={[styles.strip, { backgroundColor: c.primarySoft, borderTopColor: c.primary }]}
    >
      <Ionicons name="notifications" size={22} color={c.primary} style={{ marginRight: space.sm, marginTop: 2 }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${top.title} — open Notifications`}
        testID="btn-alert-open"
        onPress={onOpen}
        style={styles.body}
      >
        <Text variant="bodyStrong" numberOfLines={1}>{top.title}{others > 0 ? ` (+${others} more)` : ''}</Text>
        <Text numberOfLines={2}>{top.body}</Text>
        <Muted testID="text-alert-pointer">
          {phone
            ? `${rows.length} active ${plural(rows.length)} — open the menu (upper left) → NOTIFICATIONS to review them later.`
            : `${rows.length} active ${plural(rows.length)} — NOTIFICATIONS in the menu lists them all.`}
        </Muted>
      </Pressable>
      <Button title="NOTIFICATIONS" variant="secondary" icon="notifications-outline" onPress={onOpen} testID="btn-alert-notifications" style={{ marginLeft: space.sm }} />
      <IconButton icon="close" accessibilityLabel={`Dismiss alert: ${top.title}`} testID="btn-alert-dismiss" onPress={() => setDismissed((d) => [...d, top.id])} color={c.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', borderTopWidth: 2, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 4 },
  body: { flex: 1, minWidth: 180, borderRadius: radius.sm, paddingVertical: 2 },
});
