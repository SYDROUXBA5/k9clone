// Notification preferences table (bar §2.16 row 4 / §2.19 / PT-PRO-03): one row per notification
// type, columns System Notifications / Email / Mobile App.
//
// Two vendor rules are reproduced verbatim in behaviour, not just in copy:
//   • system notifications are always on and cannot be switched off;
//   • billing emails are always sent.
// Stored on the User row as `notification_prefs` so the choice follows the account.
import React from 'react';
import { View } from 'react-native';
import { useRepo } from '@/db/provider';
import type { NotificationType } from '@/db/types';
import { NOTIFICATION_TYPES } from '@/db/vocab';
import { useAuth } from '@/features/auth/AuthProvider';
import { Card, Checkbox, Muted, Row, Text, useColors, useIsDesktop, space } from '@/ui';

const ALWAYS_EMAIL: NotificationType[] = ['billing'];

export function NotificationPrefs({ testID = 'section-notification-prefs' }: { testID?: string }) {
  const { user } = useAuth();
  const repo = useRepo();
  const c = useColors();
  const desktop = useIsDesktop();
  const prefs = user?.notification_prefs || {};

  const set = (type: NotificationType, key: 'email' | 'in_app', value: boolean) => {
    if (!user) return;
    const current = prefs[type] || { in_app: true, email: true };
    void repo.upsert('user', {
      id: user.id,
      notification_prefs: { ...prefs, [type]: { ...current, [key]: value } },
    }, { label: 'Notification preferences' });
  };

  return (
    <View testID={testID}>
      <Muted style={{ marginBottom: space.sm }}>
        System notifications are always on and can&apos;t be switched off. Email is configurable per type — except billing, where email is always sent.
      </Muted>
      {desktop ? (
        <Row style={{ paddingHorizontal: space.sm, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Text variant="label" color="muted" style={{ flex: 2 }}>Notification</Text>
          <Text variant="label" color="muted" style={{ width: 190 }}>System Notifications</Text>
          <Text variant="label" color="muted" style={{ width: 150 }}>Email</Text>
          <Text variant="label" color="muted" style={{ width: 150 }}>Mobile App</Text>
        </Row>
      ) : null}
      {NOTIFICATION_TYPES.map((t) => {
        const type = t.value as NotificationType;
        const p = prefs[type] || { in_app: true, email: true };
        const emailLocked = ALWAYS_EMAIL.includes(type);
        return (
          <View key={type} testID={`row-notif-${type}`} style={{ borderBottomWidth: 1, borderBottomColor: c.border, paddingVertical: desktop ? 2 : space.sm }}>
            {desktop ? (
              <Row style={{ paddingHorizontal: space.sm }}>
                <Text style={{ flex: 2 }}>{t.label}</Text>
                <View style={{ width: 190 }}><Checkbox hideLabel label={`${t.label} — system notification (always on)`} value onChange={() => {}} disabled testID={`check-system-${type}`} /></View>
                <View style={{ width: 150 }}>
                  <Checkbox hideLabel label={`${t.label} — email${emailLocked ? ' (always sent)' : ''}`} value={emailLocked ? true : p.email} onChange={(v) => set(type, 'email', v)} disabled={emailLocked} testID={`check-email-${type}`} />
                </View>
                <View style={{ width: 150 }}>
                  <Checkbox hideLabel label={`${t.label} — mobile app`} value={p.in_app} onChange={(v) => set(type, 'in_app', v)} testID={`check-mobile-${type}`} />
                </View>
              </Row>
            ) : (
              <View>
                <Text variant="bodyStrong">{t.label}</Text>
                <Checkbox label="System notification (always on)" value onChange={() => {}} disabled testID={`check-system-${type}`} />
                <Checkbox label={emailLocked ? 'Email (always sent for billing)' : 'Email'} value={emailLocked ? true : p.email} onChange={(v) => set(type, 'email', v)} disabled={emailLocked} testID={`check-email-${type}`} />
                <Checkbox label="Mobile App" value={p.in_app} onChange={(v) => set(type, 'in_app', v)} testID={`check-mobile-${type}`} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Card wrapper, for screens that want the section stand-alone. */
export function NotificationPrefsCard() {
  return <Card testID="card-notification-prefs"><NotificationPrefs /></Card>;
}
