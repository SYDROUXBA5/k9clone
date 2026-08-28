// Training groups (code join, leaders, members) and management groups (supervisor / trainer members).
// Pure repository helpers; screens call these so every write lands in History with a readable label.
import { notify } from '@/db/notify';
import type { Repository } from '@/db/repository';
import type { ManagementGroupType, TrainingGroup, User, UUID } from '@/db/types';
import { GROUP_CODE_LENGTH } from '@/db/vocab';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — codes are read aloud at training

/** 7 letters/numbers shown as XXX-XXXX (e.g. ASH-7K2Q): the first three come from the group name when possible. */
export function generateGroupCode(name: string, taken: Set<string>): string {
  const prefix = (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[0OI1]/g, '').slice(0, 3);
  for (let attempt = 0; attempt < 50; attempt++) {
    let s = attempt < 10 ? prefix : '';
    while (s.length < GROUP_CODE_LENGTH) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    const code = s.slice(0, GROUP_CODE_LENGTH);
    if (!taken.has(code)) return code;
  }
  return Math.random().toString(36).slice(2, 2 + GROUP_CODE_LENGTH).toUpperCase();
}
export const fmtGroupCode = (code: string) => (code.length === 7 && !code.includes('-') ? `${code.slice(0, 3)}-${code.slice(3)}` : code);
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function isLeader(g: TrainingGroup, userId: UUID) { return g.leader_id === userId || (g.leaders || []).includes(userId); }
export function isMember(g: TrainingGroup, userId: UUID) { return (g.members || []).includes(userId) || isLeader(g, userId); }

export type Result = { ok: true; message?: string } | { ok: false; error: string };

export async function createTrainingGroup(repo: Repository, user: User, name: string, memberIds: UUID[] = []): Promise<Result & { id?: UUID; code?: string }> {
  const n = name.trim();
  if (!n) return { ok: false, error: 'Please enter a group name.' };
  if (n.length > 50) return { ok: false, error: 'Group name is limited to 50 characters.' };
  const taken = new Set(repo.snapshot('training_group').map((g) => g.code));
  const code = generateGroupCode(n, taken);
  const members = [...new Set([user.id, ...memberIds])];
  const row = await repo.upsert('training_group', { owner_user_id: user.id, name: n, code, leader_id: user.id, leaders: [user.id], members, pending: [] }, { label: n });
  return { ok: true, id: row.id, code, message: `Group “${n}” created — code ${fmtGroupCode(code)}` };
}

/** Join by code: sends a request the leaders see (pending) and notifies them; leaders join immediately. */
export async function joinByCode(repo: Repository, user: User, rawCode: string): Promise<Result> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: 'Enter the 7-character group code.' };
  if (code.length !== GROUP_CODE_LENGTH) return { ok: false, error: `A group code is ${GROUP_CODE_LENGTH} letters and numbers.` };
  const g = repo.snapshot('training_group').find((x) => x.code === code);
  if (!g) return { ok: false, error: 'No training group has that code. Check it with the group leader.' };
  if (isMember(g, user.id)) return { ok: false, error: `You are already a member of ${g.name}.` };
  if ((g.pending || []).includes(user.id)) return { ok: false, error: `Your request to join ${g.name} was sent and is waiting for a leader to accept it.` };
  await repo.upsert('training_group', { id: g.id, pending: [...(g.pending || []), user.id] }, { label: `${g.name} — join request` });
  for (const leader of new Set([g.leader_id, ...(g.leaders || [])])) {
    await notify(repo, { user_id: leader, type: 'group_request', title: 'Training group request', body: `${user.name} asked to join ${g.name} using the group code. Open Groups to accept.`, link: '/groups' });
  }
  return { ok: true, message: `Request sent to the leaders of ${g.name}. You will be a member once a leader accepts.` };
}

export async function acceptRequest(repo: Repository, g: TrainingGroup, userId: UUID, actor: User): Promise<Result> {
  if (!isLeader(g, actor.id)) return { ok: false, error: 'Only a group leader can accept requests.' };
  const u = repo.getSync('user', userId);
  await repo.upsert('training_group', { id: g.id, pending: (g.pending || []).filter((p) => p !== userId), members: [...new Set([...(g.members || []), userId])] }, { label: `${g.name} — accepted ${u?.name || 'member'}` });
  await notify(repo, { user_id: userId, type: 'group_request', title: 'Training group request accepted', body: `${actor.name} accepted your request to join ${g.name}.`, link: '/groups' });
  await ensureConnections(repo, g.id);
  return { ok: true, message: `${u?.name || 'Member'} added to ${g.name}` };
}
export async function declineRequest(repo: Repository, g: TrainingGroup, userId: UUID, actor: User): Promise<Result> {
  if (!isLeader(g, actor.id)) return { ok: false, error: 'Only a group leader can decline requests.' };
  await repo.upsert('training_group', { id: g.id, pending: (g.pending || []).filter((p) => p !== userId) }, { label: `${g.name} — request removed` });
  return { ok: true, message: 'Request removed' };
}

/** Add members directly (leaders only): connected handlers or any user by email (local mode stands in for the email invite). */
export async function addMembers(repo: Repository, g: TrainingGroup, userIds: UUID[], actor: User): Promise<Result> {
  if (!isLeader(g, actor.id)) return { ok: false, error: 'Only a group leader can add members.' };
  const add = userIds.filter((id) => !isMember(g, id));
  if (!add.length) return { ok: false, error: 'Those handlers are already members.' };
  await repo.upsert('training_group', { id: g.id, members: [...new Set([...(g.members || []), ...add])], pending: (g.pending || []).filter((p) => !add.includes(p)) }, { label: `${g.name} — added ${add.length} member${add.length > 1 ? 's' : ''}` });
  for (const id of add) await notify(repo, { user_id: id, type: 'invitation', title: 'Added to a training group', body: `${actor.name} added you to the training group ${g.name}.`, link: '/groups' });
  await ensureConnections(repo, g.id);
  return { ok: true, message: `${add.length} member${add.length > 1 ? 's' : ''} added` };
}

export async function removeMember(repo: Repository, g: TrainingGroup, userId: UUID, actor: User): Promise<Result> {
  if (!isLeader(g, actor.id)) return { ok: false, error: 'Only a group leader can remove members.' };
  if (userId === actor.id) return { ok: false, error: 'You cannot remove yourself. Use Leave group instead.' };
  const members = (g.members || []).filter((m) => m !== userId);
  const handlersLeft = members.filter((m) => repo.getSync('user', m)?.roles.includes('handler'));
  if (!handlersLeft.length) return { ok: false, error: 'You must have at least one handler in a group.' };
  const leaders = (g.leaders || []).filter((l) => l !== userId);
  const u = repo.getSync('user', userId);
  await repo.upsert('training_group', { id: g.id, members, leaders: leaders.length ? leaders : [g.leader_id], leader_id: g.leader_id === userId ? (leaders[0] || g.leader_id) : g.leader_id }, { label: `${g.name} — removed ${u?.name || 'member'}` });
  return { ok: true, message: `${u?.name || 'Member'} removed from ${g.name}` };
}

export async function setLeader(repo: Repository, g: TrainingGroup, userId: UUID, leader: boolean, actor: User): Promise<Result> {
  if (!isLeader(g, actor.id)) return { ok: false, error: 'Only a group leader can change editor access.' };
  const leaders = new Set(g.leaders || [g.leader_id]);
  if (leader) leaders.add(userId); else leaders.delete(userId);
  if (!leaders.size) return { ok: false, error: 'You must have at least one member with editor access.' };
  const u = repo.getSync('user', userId);
  await repo.upsert('training_group', { id: g.id, leaders: [...leaders], leader_id: leaders.has(g.leader_id) ? g.leader_id : [...leaders][0] }, { label: `${g.name} — ${u?.name || 'member'} ${leader ? 'is now a leader' : 'no longer a leader'}` });
  return { ok: true };
}

/** Leave: "If you press OK then you will no longer be a member of this group." — guards keep ≥1 handler and ≥1 leader. */
export async function leaveGroup(repo: Repository, g: TrainingGroup, user: User): Promise<Result> {
  const members = (g.members || []).filter((m) => m !== user.id);
  const leaders = (g.leaders || [g.leader_id]).filter((l) => l !== user.id);
  if (!members.length) {
    // last member out → the group is deleted (asks first in the UI; logged to History)
    await repo.remove('training_group', g.id, { label: g.name });
    return { ok: true, message: `You left ${g.name}; it had no other members and was deleted.` };
  }
  if (!leaders.length) return { ok: false, error: 'You must have at least one member with editor access. Make another member a leader before leaving.' };
  const handlersLeft = members.filter((m) => repo.getSync('user', m)?.roles.includes('handler'));
  if (!handlersLeft.length) return { ok: false, error: 'You must have at least one handler in a group.' };
  await repo.upsert('training_group', { id: g.id, members, leaders, leader_id: leaders.includes(g.leader_id) ? g.leader_id : leaders[0] }, { label: `${g.name} — ${user.name} left` });
  return { ok: true, message: `You left ${g.name}` };
}

/** Connections are automatic between members of the same training group. */
export async function ensureConnections(repo: Repository, groupId: UUID) {
  const g = repo.getSync('training_group', groupId);
  if (!g) return;
  const ids = [...new Set([...(g.members || []), ...(g.leaders || []), g.leader_id])];
  const existing = new Set(repo.snapshot('connection').map((c) => `${c.user_id}:${c.connected_user_id}`));
  for (const a of ids) for (const b of ids) {
    if (a === b || existing.has(`${a}:${b}`)) continue;
    await repo.upsert('connection', { owner_user_id: a, user_id: a, connected_user_id: b, via: 'training_group' }, { silent: true });
  }
}

/** Connected handlers = shared supervisor / trainer / training group (plus explicit rows). */
export function connectedHandlerIds(repo: Repository, userId: UUID): UUID[] {
  const out = new Set<UUID>();
  for (const c of repo.snapshot('connection')) if (c.user_id === userId) out.add(c.connected_user_id);
  for (const g of repo.snapshot('training_group')) if (isMember(g, userId)) [...(g.members || []), ...(g.leaders || []), g.leader_id].forEach((m) => out.add(m));
  for (const mg of repo.snapshot('management_group')) if (mg.members.includes(userId)) mg.members.forEach((m) => out.add(m));
  out.delete(userId);
  return [...out].filter((id) => repo.getSync('user', id)?.roles.includes('handler'));
}

// ---------- management groups (Manage page) ----------
export async function ensureManagementGroup(repo: Repository, managerId: UUID, type: ManagementGroupType) {
  const g = repo.snapshot('management_group').find((x) => x.manager_id === managerId && x.type === type);
  if (g) return g;
  const u = repo.getSync('user', managerId);
  return repo.upsert('management_group', { owner_user_id: managerId, manager_id: managerId, type, members: [], pending: [], name: `${u?.name || 'Manager'} — ${type === 'supervisor' ? 'supervised handlers' : 'trained handlers'}` }, { actor_id: managerId, label: 'Management group created' });
}

export async function addManagedMember(repo: Repository, manager: User, type: ManagementGroupType, userId: UUID): Promise<Result> {
  if (userId === manager.id) return { ok: false, error: 'You cannot add yourself.' };
  const target = repo.getSync('user', userId);
  if (!target) return { ok: false, error: 'No account with that email.' };
  const g = await ensureManagementGroup(repo, manager.id, type);
  if (g.members.includes(userId)) return { ok: false, error: `${target.name} is already a member.` };
  await repo.upsert('management_group', { id: g.id, members: [...g.members, userId], pending: g.pending.filter((p) => p !== userId) }, { actor_id: manager.id, label: `${g.name || 'Management group'} — added ${target.name}` });
  await notify(repo, { user_id: userId, type: 'invitation', title: type === 'supervisor' ? 'Management access granted' : 'Trainer access granted', body: `${manager.name} added you as a ${type === 'supervisor' ? 'supervised' : 'trained'} member. They can now view your records${type === 'supervisor' ? ' and review them' : ' and add trainer comments'}.`, link: '/groups' });
  return { ok: true, message: `${target.name} added` };
}

/** Invite by email (local mode: the account must exist; the row goes to pending until accepted from Groups). */
export async function inviteManagedMember(repo: Repository, manager: User, type: ManagementGroupType, email: string): Promise<Result> {
  const e = email.trim().toLowerCase();
  if (!e) return { ok: false, error: 'Enter an email address.' };
  const target = repo.snapshot('user').find((u) => u.email.toLowerCase() === e);
  if (!target) return { ok: false, error: 'Local mode: no account with that email yet. Use “Signup New Member” to create it, or ask them to sign up first.' };
  if (target.id === manager.id) return { ok: false, error: 'You cannot invite yourself.' };
  const g = await ensureManagementGroup(repo, manager.id, type);
  if (g.members.includes(target.id)) return { ok: false, error: `${target.name} is already a member.` };
  if (g.pending.includes(target.id)) return { ok: false, error: `${target.name} already has a pending invitation.` };
  await repo.upsert('management_group', { id: g.id, pending: [...g.pending, target.id] }, { actor_id: manager.id, label: `${g.name || 'Management group'} — invited ${target.name}` });
  await notify(repo, { user_id: target.id, type: 'invitation', title: 'Management request', body: `${manager.name} asked to ${type === 'supervisor' ? 'supervise' : 'train'} you. Accepting lets them view your records${type === 'supervisor' ? ' and review them' : ' and add comments'}. Open Groups to accept.`, link: '/groups' });
  return { ok: true, message: `Invitation sent to ${target.name}` };
}

export async function acceptManagement(repo: Repository, groupId: UUID, user: User): Promise<Result> {
  const g = repo.getSync('management_group', groupId);
  if (!g || !g.pending.includes(user.id)) return { ok: false, error: 'No pending request.' };
  await repo.upsert('management_group', { id: g.id, pending: g.pending.filter((p) => p !== user.id), members: [...new Set([...g.members, user.id])] }, { actor_id: user.id, label: `${g.name || 'Management group'} — ${user.name} accepted` });
  await notify(repo, { user_id: g.manager_id, type: 'invitation', title: 'Management request accepted', body: `${user.name} accepted your management request.`, link: '/manage' });
  return { ok: true, message: 'Management request accepted' };
}
export async function declineManagement(repo: Repository, groupId: UUID, user: User): Promise<Result> {
  const g = repo.getSync('management_group', groupId);
  if (!g) return { ok: false, error: 'No pending request.' };
  await repo.upsert('management_group', { id: g.id, pending: g.pending.filter((p) => p !== user.id) }, { actor_id: user.id, label: `${g.name || 'Management group'} — ${user.name} declined` });
  return { ok: true, message: 'Request declined' };
}

/**
 * The handler side of the same coin: revoke a manager's access to MY account (Groups → Managers → ⋯).
 * The manager loses read access to my records (and, for a supervisor, review + billing); nothing is deleted.
 */
export async function revokeManagement(repo: Repository, groupId: UUID, user: User): Promise<Result> {
  const g = repo.getSync('management_group', groupId);
  if (!g) return { ok: false, error: 'That manager group no longer exists.' };
  if (!g.members.includes(user.id) && !g.pending.includes(user.id)) return { ok: false, error: 'You are not a member of that manager group.' };
  const manager = repo.getSync('user', g.manager_id);
  await repo.upsert('management_group', { id: g.id, members: g.members.filter((m) => m !== user.id), pending: g.pending.filter((p) => p !== user.id) }, { actor_id: user.id, label: `${g.name || 'Management group'} — ${user.name} revoked access` });
  await notify(repo, {
    user_id: g.manager_id,
    type: 'general_update',
    title: g.type === 'supervisor' ? 'Management Access revoked' : 'Trainer access revoked',
    body: `${user.name} revoked your access to their records. Their records and History are unchanged — you simply no longer see them.`,
    link: '/manage',
  });
  return { ok: true, message: `${manager?.name || 'That manager'} no longer has access to your records` };
}

/** Remove a managed member — records and History are untouched (they belong to the handler). */
export async function removeManagedMember(repo: Repository, manager: User, type: ManagementGroupType, userId: UUID): Promise<Result> {
  if (userId === manager.id) return { ok: false, error: 'You cannot remove yourself.' };
  const g = repo.snapshot('management_group').find((x) => x.manager_id === manager.id && x.type === type);
  if (!g) return { ok: false, error: 'No management group.' };
  const target = repo.getSync('user', userId);
  // guard: a handler reachable through one of my managed supervisors cannot be removed here
  for (const sup of g.members) {
    const su = repo.getSync('user', sup);
    if (su?.roles.includes('supervisor') && sup !== userId) {
      const theirs = repo.snapshot('management_group').find((x) => x.manager_id === sup && x.type === 'supervisor');
      if (theirs?.members.includes(userId) && !g.members.includes(userId)) return { ok: false, error: "This handler can't be removed as they're associated with one of your managed supervisors." };
    }
  }
  if (!g.members.includes(userId) && !g.pending.includes(userId)) return { ok: false, error: 'Not a member.' };
  await repo.upsert('management_group', { id: g.id, members: g.members.filter((m) => m !== userId), pending: g.pending.filter((p) => p !== userId) }, { actor_id: manager.id, label: `${g.name || 'Management group'} — removed ${target?.name || 'member'}` });
  return { ok: true, message: `${target?.name || 'Member'} removed — their records and History are kept` };
}

/** Transfer a managed handler to another supervisor: removed from mine, added to theirs; records + History untouched. */
export async function transferManagedMember(repo: Repository, manager: User, userId: UUID, toSupervisorId: UUID): Promise<Result> {
  const to = repo.getSync('user', toSupervisorId);
  if (!to || !to.roles.includes('supervisor')) return { ok: false, error: 'Pick a supervisor to transfer to.' };
  const removed = await removeManagedMember(repo, manager, 'supervisor', userId);
  if (!removed.ok) return removed;
  const g = await ensureManagementGroup(repo, to.id, 'supervisor');
  const target = repo.getSync('user', userId);
  if (!g.members.includes(userId)) await repo.upsert('management_group', { id: g.id, members: [...g.members, userId] }, { actor_id: manager.id, label: `${g.name || 'Management group'} — ${target?.name || 'member'} transferred from ${manager.name}` });
  await notify(repo, { user_id: to.id, type: 'general_update', title: 'Handler transferred to you', body: `${manager.name} transferred ${target?.name || 'a handler'} to your management group.`, link: '/manage' });
  await notify(repo, { user_id: userId, type: 'general_update', title: 'Supervisor changed', body: `${manager.name} transferred you to ${to.name}. Your records and History are unchanged.`, link: '/groups' });
  return { ok: true, message: `${target?.name || 'Member'} transferred to ${to.name} — records and History kept` };
}

/** Local stand-in for “Signup New Member”: create a handler account (30-day trial) and add it to my group. */
export async function signupNewMember(repo: Repository, manager: User, type: ManagementGroupType, input: { first_name: string; last_name: string; email: string; department: string; password?: string; roles?: User['roles'] }): Promise<Result & { userId?: UUID }> {
  const email = input.email.trim().toLowerCase();
  if (!input.first_name.trim()) return { ok: false, error: 'First name is required.' };
  if (!input.last_name.trim()) return { ok: false, error: 'Last name is required.' };
  if (!email || !email.includes('@')) return { ok: false, error: 'A valid email is required.' };
  if (repo.snapshot('user').some((u) => u.email.toLowerCase() === email)) return { ok: false, error: 'An account with that email already exists — use “Add Handler …” instead.' };
  const now = new Date().toISOString();
  const roles = input.roles?.length ? input.roles : (['handler'] as User['roles']);
  const u = await repo.upsert('user', {
    email, first_name: input.first_name.trim(), last_name: input.last_name.trim(), name: `${input.first_name.trim()} ${input.last_name.trim()}`,
    agency_id: manager.agency_id, department: input.department.trim() || manager.department, roles, password: input.password?.trim() || 'demo',
    demographics_in_reports: true, dark_mode: false,
  }, { actor_id: manager.id, label: `Signup New Member: ${email}` });
  await repo.upsert('user', { id: u.id, owner_user_id: u.id }, { silent: true, actor_id: manager.id });
  for (const r of roles) await repo.upsert('role_assignment', { owner_user_id: u.id, user_id: u.id, role: r, granted_at: now }, { silent: true, actor_id: manager.id });
  if (roles.includes('handler')) await repo.upsert('seat', { owner_user_id: u.id, user_id: u.id, plan: 'trial', starts: now, ends: new Date(Date.now() + 30 * 86400000).toISOString(), paid_by: null, status: 'active' }, { silent: true, actor_id: manager.id });
  const added = await addManagedMember(repo, manager, type, u.id);
  if (!added.ok) return added;
  console.log(`EMAIL → ${u.name} <${u.email}> · Welcome — your account was created by ${manager.name}${input.password?.trim() ? '' : ' (set your own password from the link)'}`);
  return { ok: true, userId: u.id, message: `${u.name} was created and added — onboarding email logged (local mode; password ${input.password?.trim() ? 'as entered' : '“demo”'})` };
}
