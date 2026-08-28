// Visibility is grants, not tenancy (brief §4.9). One place decides who may SEE a record:
//   owner · their managers via ManagementGroup (supervisor → recursively through managed supervisors;
//   trainer → trainer group members) · TrainingGroup members for that event · explicit Shares.
// Records screens (U2), reports (U6) and the review queue (U5) all filter through canSee().
// Pure functions over repository snapshots — usable from hooks (re-run on entity change) and scripts.
import type { Repository } from './repository';
import type { EntityName, ManagementGroupType, Role, ShareRecordType, User, UUID } from './types';

export type RecordType = 'completion' | 'deployment' | 'class' | 'vet_visit' | 'training_event' | 'exercise' | 'track';
export const RECORD_ENTITY: Record<RecordType, EntityName> = {
  completion: 'completion',
  deployment: 'deployment',
  class: 'class_record',
  vet_visit: 'vet_visit',
  training_event: 'training_event',
  exercise: 'exercise',
  track: 'track',
};
export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  completion: 'Training', deployment: 'Deployment', class: 'Class', vet_visit: 'Vet Visit', training_event: 'Training Event', exercise: 'Exercise', track: 'Track',
};

/** Handler ids managed by `managerId` in groups of `type`; supervisors also inherit everyone their managed supervisors manage. */
export function managedUserIds(repo: Repository, managerId: UUID, type: ManagementGroupType, seen = new Set<UUID>()): UUID[] {
  if (seen.has(managerId)) return [];
  seen.add(managerId);
  const out = new Set<UUID>();
  for (const g of repo.snapshot('management_group')) {
    if (g.manager_id !== managerId || g.type !== type) continue;
    for (const m of g.members) {
      out.add(m);
      if (type === 'supervisor') {
        const u = repo.getSync('user', m);
        if (u?.roles.includes('supervisor')) for (const x of managedUserIds(repo, m, 'supervisor', seen)) out.add(x);
      }
    }
  }
  return [...out];
}

/** Direct members of the manager's own group(s) of `type` (no inheritance). */
export function directMembers(repo: Repository, managerId: UUID, type: ManagementGroupType): UUID[] {
  const out = new Set<UUID>();
  for (const g of repo.snapshot('management_group')) if (g.manager_id === managerId && g.type === type) g.members.forEach((m) => out.add(m));
  return [...out];
}

/** Managed supervisors = members of my supervisor group who hold the supervisor role. */
export function managedSupervisorIds(repo: Repository, supervisorId: UUID): UUID[] {
  return directMembers(repo, supervisorId, 'supervisor').filter((id) => repo.getSync('user', id)?.roles.includes('supervisor'));
}

/** Managers (supervisors / trainers) of a user — the Groups page "Managers" table. */
export function managersOf(repo: Repository, userId: UUID): Array<{ manager_id: UUID; type: ManagementGroupType; group_id: UUID; pending: boolean }> {
  const out: Array<{ manager_id: UUID; type: ManagementGroupType; group_id: UUID; pending: boolean }> = [];
  for (const g of repo.snapshot('management_group')) {
    if (g.members.includes(userId)) out.push({ manager_id: g.manager_id, type: g.type, group_id: g.id, pending: false });
    else if (g.pending.includes(userId)) out.push({ manager_id: g.manager_id, type: g.type, group_id: g.id, pending: true });
  }
  return out;
}

export const shareKey = (type: ShareRecordType | RecordType, id: UUID) => `${type}:${id}`;

/** Records explicitly shared TO this supervisor. */
export function sharedRecordKeys(repo: Repository, userId: UUID): Set<string> {
  const set = new Set<string>();
  for (const s of repo.snapshot('share')) if (s.to_supervisor === userId) set.add(shareKey(s.record_type, s.record_id));
  return set;
}

/** Ids of users whose data the (user, role) pair may read: self + managed. */
export function readableUserIds(repo: Repository, user: Pick<User, 'id'>, role: Role | null): Set<UUID> {
  const ids = new Set<UUID>([user.id]);
  if (role === 'supervisor') managedUserIds(repo, user.id, 'supervisor').forEach((m) => ids.add(m));
  if (role === 'trainer') managedUserIds(repo, user.id, 'trainer').forEach((m) => ids.add(m));
  return ids;
}

/** Training-group ids the user belongs to (member or leader). */
export function trainingGroupIdsOf(repo: Repository, userId: UUID): Set<UUID> {
  const set = new Set<UUID>();
  for (const g of repo.snapshot('training_group')) if (g.members.includes(userId) || g.leaders.includes(userId) || g.leader_id === userId) set.add(g.id);
  return set;
}

export interface VisibleRecordLike { id: UUID; owner_user_id: UUID; event_id?: UUID | null; handler_id?: UUID | null; group_id?: UUID | null; invitees?: { user_id: UUID }[] }

/** Precomputed context so list screens call canSee() per row cheaply. */
export interface AccessContext { userId: UUID; role: Role | null; readable: Set<UUID>; shared: Set<string>; groups: Set<UUID> }
export function accessContext(repo: Repository, user: Pick<User, 'id'>, role: Role | null): AccessContext {
  return { userId: user.id, role, readable: readableUserIds(repo, user, role), shared: role === 'supervisor' ? sharedRecordKeys(repo, user.id) : new Set(), groups: trainingGroupIdsOf(repo, user.id) };
}

/**
 * The visibility rule. `record` is any row with owner_user_id (+ optional event_id / handler_id / group_id / invitees).
 *   1. owner (or handler_id) is the user or a managed user → visible
 *   2. supervisor: an explicit Share to this supervisor → visible
 *   3. training events / exercises / completions of an event whose training group the user belongs to, or where the user is invited → visible
 */
export function canSee(repo: Repository, ctx: AccessContext, type: RecordType, record: VisibleRecordLike): boolean {
  if (ctx.readable.has(record.owner_user_id)) return true;
  if (record.handler_id && ctx.readable.has(record.handler_id)) return true;
  if (ctx.role === 'supervisor' && ctx.shared.has(shareKey(type, record.id))) return true;
  if (type === 'training_event' || type === 'exercise' || type === 'completion') {
    const ev = type === 'training_event' ? record : record.event_id ? repo.getSync('training_event', record.event_id) : undefined;
    if (ev) {
      const invitees = (ev.invitees || []) as { user_id: UUID; is_leader?: boolean }[];
      if (ev.group_id && ctx.groups.has(ev.group_id)) return true;
      if (invitees.some((i) => i.user_id === ctx.userId)) return true;
      // a trainer / group leader sees completions of events they created or lead
      if (type !== 'training_event' && (ev.owner_user_id === ctx.userId || invitees.some((i) => i.user_id === ctx.userId && i.is_leader))) return true;
    }
  }
  return false;
}

/** Convenience: user-level check without a prebuilt context. */
export function userCanSee(repo: Repository, user: Pick<User, 'id'>, role: Role | null, type: RecordType, record: VisibleRecordLike): boolean {
  return canSee(repo, accessContext(repo, user, role), type, record);
}
