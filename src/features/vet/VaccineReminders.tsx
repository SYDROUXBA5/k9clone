// Raises the vaccination reminders wherever the app is open (bar §2.8: notification + email "two
// weeks before the due date" and "on the day it's due"). Renders nothing.
//
// Ids are deterministic — `vxn-<vaccinationId>-<milestone>` — and an existing row is never rewritten,
// so a milestone produces exactly one notification no matter how often this mounts.
import { useEffect } from 'react';
import { useList, useRepo } from '@/db/provider';
import { useAuth, useVisibleUserIds } from '@/features/auth/AuthProvider';
import { planVaccineNotifications } from './vetModel';

export function VaccineReminders() {
  const repo = useRepo();
  const { user } = useAuth();
  const visible = useVisibleUserIds();
  const vaccinations = useList('vaccination');
  const dogs = useList('dog');

  useEffect(() => {
    if (!user) return;
    const scope = new Set(visible);
    const myDogs = dogs.filter((d) => scope.has(d.owner_user_id));
    const myVax = vaccinations.filter((v) => scope.has(v.owner_user_id));
    for (const n of planVaccineNotifications(myVax, myDogs, Date.now())) {
      if (repo.getSync('notification', n.id)) continue;
      void repo.upsert('notification', {
        id: n.id, owner_user_id: n.user_id, user_id: n.user_id, type: 'vaccination_due',
        title: n.title, body: n.body, read: false, link: '/records',
      }, { silent: true });
    }
  }, [repo, user, visible, vaccinations, dogs]);

  return null;
}
