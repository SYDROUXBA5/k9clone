// RoleGuard — screens that only some roles may open (Manage / Vaccines for supervisors & trainers).
// A handler who types the URL gets a friendly "not available in this role" screen, never a red screen.
import { useRouter } from 'expo-router';
import React from 'react';
import { ROLE_LABEL, type Role } from '@/db/types';
import { useAuth } from '@/features/auth/AuthProvider';
import { EmptyState, Screen } from '@/ui';

/**
 * Roles that may AUTHOR a record. A supervisor reviews handler work and never writes it, so every
 * `…/new` capture route is closed to it — otherwise the route renders a blank form whose only control
 * is Cancel, which is worse than a locked door because it looks like it should work.
 */
export const NEW_RECORD_ROLES: Role[] = ['handler', 'trainer'];

export function canAuthorRecords(role: Role | null | undefined): boolean {
  return !!role && NEW_RECORD_ROLES.includes(role);
}

/** The "not available in this role" screen on its own, for a route that is closed outright. */
export function RoleClosed({ title, allow = NEW_RECORD_ROLES }: { title: string; allow?: Role[] }) {
  return <RoleGuard allow={allow} title={title}>{null}</RoleGuard>;
}

export function RoleGuard({ allow, title, children }: { allow: Role[]; title: string; children: React.ReactNode }) {
  const { role, roles, setRole } = useAuth();
  const router = useRouter();
  if (role && allow.includes(role)) return <>{children}</>;
  const switchable = roles.find((r) => allow.includes(r));
  return (
    <Screen title={title} testID="screen-role-guard">
      <EmptyState
        icon="lock-closed-outline"
        title={`${title} is not available in the ${role ? ROLE_LABEL[role] : ''} role`}
        body={`This page is for ${allow.map((r) => ROLE_LABEL[r]).join(' and ')} roles.${switchable ? ` You hold the ${ROLE_LABEL[switchable]} role — switch to open it.` : ''}`}
        action={switchable
          ? { title: `Switch to ${ROLE_LABEL[switchable]}`, onPress: () => setRole(switchable), testID: 'btn-guard-switch-role' }
          : { title: 'Back to Records', onPress: () => router.replace('/records'), testID: 'btn-guard-back' }}
        testID="empty-role-guard"
      />
    </Screen>
  );
}
