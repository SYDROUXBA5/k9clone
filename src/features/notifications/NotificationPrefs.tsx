// Profile → Notifications table (bar §2.19 row 4 / §2.16 row 4): one row per type group with
// System Notifications (always on) · Email · Mobile App toggles. Opt-in rows (supervisor "ready for
// review", trainer "ready for comments") default OFF and their System toggle is editable.
// U7 mounts <NotificationPrefs/> in Profile; U5 shows it at the bottom of /notifications.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRepo } from '@/db/provider';
import { effectivePref, OPT_IN_TYPES } from '@/db/notify';
import type { NotificationType, Role, User } from '@/db/types';
import { NOTIFICATION_PREF_GROUPS } from '@/db/vocab';
import { useAuth } from '@/features/auth/AuthProvider';
import { Card, Checkbox, Muted, Text, useColors, useIsDesktop, useToast, space } from '@/ui';

export function NotificationPrefs({ compact }: { compact?: boolean }) {
  const { user, roles } = useAuth();
  const repo = useRepo();
  const toast = useToast();
  const c = useColors();
  const desktop = useIsDesktop();
  if (!user) return null;
  const rows = NOTIFICATION_PREF_GROUPS.filter((g) => (g.roles as readonly string[]).some((r) => roles.includes(r as Role)));
  const save = async (key: string, types: readonly string[], patch: Partial<{ in_app: boolean; email: boolean; mobile: boolean }>) => {
    const prefs: NonNullable<User['notification_prefs']> = { ...(user.notification_prefs || {}) };
    const primary = types[0] as NotificationType;
    const cur = effectivePref(user, primary);
    const next = { in_app: cur.in_app, email: cur.email, mobile: cur.mobile, ...patch };
    prefs[key as NotificationType] = next;
    for (const t of types) prefs[t as NotificationType] = next;
    try {
      await repo.upsert('user', { id: user.id, notification_prefs: prefs }, { silent: true });
      toast.show('Notification settings saved');
    } catch (err) {
      toast.show(`Save failed — ${err instanceof Error ? err.message : 'try again'}`, 'error');
    }
  };
  return (
    <Card testID="card-notification-prefs">
      {!compact ? (
        <View style={{ marginBottom: space.sm }}>
          <Text variant="h3">Notification settings</Text>
          <Muted>System notifications are always on. Choose which types also send an email or a mobile alert. Email notifications for billing are always sent.</Muted>
        </View>
      ) : null}
      {rows.map((g, i) => {
        const primary = g.types[0] as NotificationType;
        const pref = effectivePref(user, primary);
        const optIn = OPT_IN_TYPES.includes(primary);
        const billing = g.key === 'general_update';
        return (
          <View key={g.key} style={[styles.row, { borderBottomColor: c.border, borderBottomWidth: i === rows.length - 1 ? 0 : 1 }, desktop ? { flexDirection: 'row', alignItems: 'center' } : null]} testID={`pref-row-${g.key}`}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: space.sm }}>
              <Text variant="bodyStrong">{g.label}{optIn ? <Muted> · opt-in</Muted> : null}</Text>
              <Muted>{g.help}</Muted>
            </View>
            <View style={styles.cells}>
              <Checkbox label="System" value={pref.in_app} disabled={!optIn} onChange={(v) => void save(g.key, g.types, { in_app: v })} testID={`pref-${g.key}-system`} style={styles.cell} />
              <Checkbox label="Email" value={pref.email} disabled={billing} onChange={(v) => void save(g.key, g.types, { email: v })} testID={`pref-${g.key}-email`} style={styles.cell} />
              <Checkbox label="Mobile App" value={pref.mobile} onChange={(v) => void save(g.key, g.types, { mobile: v })} testID={`pref-${g.key}-mobile`} style={styles.cell} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.sm },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  cell: { minWidth: 130, minHeight: 40, paddingVertical: 0 },
});
