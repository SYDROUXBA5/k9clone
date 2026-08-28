// One place that owns "what theme is this account on".
// Preference is stored twice on purpose:
//   • device prefs (PrefsProvider) — survives a reload before the session is restored, so the very
//     first paint after a refresh is already the right colour;
//   • the User row (`dark_mode`) — the reference stores the theme per account (bar §2.16 row 9),
//     so signing in on another device brings your choice with you.
import { useCallback } from 'react';
import { useRepo } from '@/db/provider';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePrefs } from '@/features/prefs/PrefsProvider';
import { useTheme, type ThemePreference } from '@/ui';

export function useThemeControl() {
  const { preference, scheme, setPreference: apply } = useTheme();
  const { update } = usePrefs();
  const { user } = useAuth();
  const repo = useRepo();

  const setPreference = useCallback((p: ThemePreference) => {
    apply(p);
    update({ themePref: p, scheme: p === 'dark' ? 'dark' : 'light' });
    if (user) void repo.upsert('user', { id: user.id, dark_mode: p === 'dark' }, { silent: true });
  }, [apply, update, user, repo]);

  return { preference, scheme, setPreference };
}
