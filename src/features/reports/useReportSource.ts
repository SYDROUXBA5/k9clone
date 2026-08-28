// One hook that hands the report layer everything it needs from the repository, plus the viewer's
// identity, agency name and Report Options. Every report screen uses it so they agree on scope.
import { useMemo } from 'react';
import { useList } from '@/db/provider';
import type { Role, User } from '@/db/types';
import { useAuth, useVisibleUserIds } from '@/features/auth/AuthProvider';
import { reportHeaderFor } from '@/features/profile/reportHeader';
import type { ReportScope, ReportSource } from './select';

export interface ReportContext {
  src: ReportSource;
  scope: ReportScope;
  viewer: User | null;
  role: Role | null;
  agency: string;
  /** Department Logo uploaded on Profile → Department; printed in the report masthead. */
  logoUri: string | null;
  /** Profile → Report Options → demographic arrest data in deployment reports. */
  showDemographics: boolean;
  /** Dogs the viewer may pick in the report dialog. */
  scopedDogs: { id: string; name: string; handlerName: string }[];
  scopedHandlers: { id: string; name: string }[];
}

export function useReportContext(): ReportContext {
  const { user, role } = useAuth();
  const visibleIds = useVisibleUserIds();
  const users = useList('user');
  const dogs = useList('dog');
  const events = useList('training_event');
  const exercises = useList('exercise');
  const completions = useList('completion');
  const deployments = useList('deployment');
  const classes = useList('class_record');
  const vets = useList('vet_visit');
  const vaccinations = useList('vaccination');
  const trainerComments = useList('trainer_comment');
  const tracks = useList('track');
  const agencies = useList('agency');

  const src = useMemo<ReportSource>(
    () => ({ users, dogs, events, exercises, completions, deployments, classes, vets, vaccinations, trainerComments, tracks }),
    [users, dogs, events, exercises, completions, deployments, classes, vets, vaccinations, trainerComments, tracks],
  );

  const scope = useMemo<ReportScope>(
    () => ({ userId: user?.id || '', role: role || 'handler', visibleIds: visibleIds.length ? visibleIds : user ? [user.id] : [] }),
    [user, role, visibleIds],
  );

  // PT-PRO-05 / DECISIONS E37 — the masthead comes from one place, reportHeaderFor(), so Profile and
  // the printed sheet can never disagree. The billed department name wins over the agency row; the
  // agency row is only the fallback when the user carries no department name of their own.
  const header = useMemo(() => reportHeaderFor(user), [user]);
  const agency = useMemo(
    () => header.departmentName || agencies.find((a) => a.id === user?.agency_id)?.name || '',
    [header.departmentName, agencies, user],
  );

  const scopedDogs = useMemo(() => {
    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    return dogs
      .filter((d) => scope.visibleIds.includes(d.owner_user_id))
      .map((d) => ({ id: d.id, name: d.name, handlerName: nameOf.get(d.owner_user_id) || '' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dogs, users, scope.visibleIds]);

  const scopedHandlers = useMemo(
    () => users.filter((u) => scope.visibleIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [users, scope.visibleIds],
  );

  return {
    src, scope, viewer: user, role, agency,
    logoUri: header.logoUri,
    showDemographics: header.includeDemographics,
    scopedDogs, scopedHandlers,
  };
}
