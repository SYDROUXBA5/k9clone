// GROUPS (bar §2.10): Managers · Training Groups · Connected Handlers.
//   Managers — supervisors / trainers with access to my account (NAME · MANAGER TYPE · HANDLERS · ⋯), pending
//     management requests with Accept / Decline, gold "+ Manager ▾" (grant a supervisor / trainer access, local mode).
//   Training Groups — NAME · CREATED · GROUP CODE (7 chars + copy) · HANDLERS · ⋯; "+ Training Group ▾" → Create /
//     Join by code; editor (leaders only): members with LEADER checkbox, remove, Add Members (connected handlers) or
//     invite by email; leave-group confirm; pending join requests (mine + those waiting for me as a leader).
//   Connected Handlers — automatic via shared supervisor / trainer / training group; avatar grid + VIEW n HANDLERS.
//   Supervisor / Trainer roles see their management groups (managed handlers / supervisors) with a link to Manage.
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { directMembers, managedSupervisorIds, managersOf } from '@/db/access';
import { useList, useRepo } from '@/db/provider';
import type { ManagementGroupType, TrainingGroup, User } from '@/db/types';
import { ROLE_LABEL } from '@/db/types';
import { useAuth } from '@/features/auth/AuthProvider';
import { Badge, Button, Card, Checkbox, ConfirmDialog, IconButton, Muted, Row, Screen, Section, Select, Sheet, Table, Text, TextField, fmtDate, useColors, useIsDesktop, useToast, radius, space, type Column } from '@/ui';
import { acceptManagement, acceptRequest, addMembers, addManagedMember, connectedHandlerIds, createTrainingGroup, declineManagement, declineRequest, fmtGroupCode, isLeader, isMember, joinByCode, leaveGroup, removeMember, revokeManagement, setLeader } from './groupsLogic';

type MenuItem = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; danger?: boolean; testID: string };

function MenuSheet({ visible, onClose, title, items, testID }: { visible: boolean; onClose: () => void; title: string; items: MenuItem[]; testID: string }) {
  const c = useColors();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID} maxWidth={420}>
      {items.map((m) => (
        <Pressable key={m.key} accessibilityRole="menuitem" testID={m.testID} onPress={() => { onClose(); m.onPress(); }} style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
          <Ionicons name={m.icon} size={22} color={m.danger ? c.danger : c.primary} style={{ marginRight: space.sm }} />
          <Text style={{ flex: 1, color: m.danger ? c.danger : c.text }}>{m.label}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

function Avatar({ user, size = 44 }: { user: User; size?: number }) {
  const c = useColors();
  const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || user.name.slice(0, 2).toUpperCase();
  return (
    <View accessibilityLabel={user.name} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.primary, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
}

export function GroupsScreen() {
  const { user, role } = useAuth();
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const desktop = useIsDesktop();
  const users = useList('user');
  const trainingGroups = useList('training_group');
  useList('management_group'); // re-render when grants change
  useList('connection');
  const byId = new Map(users.map((u) => [u.id, u]));
  const nameOf = (id: string) => byId.get(id)?.name || '—';

  // ---- dialogs ----
  const [managerMenu, setManagerMenu] = useState(false);
  const [addManagerType, setAddManagerType] = useState<ManagementGroupType | null>(null);
  const [managerPick, setManagerPick] = useState('');
  const [managerError, setManagerError] = useState<string | null>(null);
  const [groupMenu, setGroupMenu] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMembers, setNewMembers] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<TrainingGroup | null>(null);
  const [editing, setEditing] = useState<TrainingGroup | null>(null);
  const [addPick, setAddPick] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<TrainingGroup | null>(null);
  const [removing, setRemoving] = useState<{ g: TrainingGroup; userId: string } | null>(null);
  const [handlersOpen, setHandlersOpen] = useState(false);
  const [managerRowMenu, setManagerRowMenu] = useState<{ manager_id: string; type: ManagementGroupType; group_id: string; pending: boolean } | null>(null);
  const [managerView, setManagerView] = useState<{ manager_id: string; type: ManagementGroupType } | null>(null);
  const [revoking, setRevoking] = useState<{ manager_id: string; type: ManagementGroupType; group_id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ name: string; code: string } | null>(null);

  if (!user) return null;
  const managers = managersOf(repo, user.id);
  const myGroups = trainingGroups.filter((g) => isMember(g, user.id)).sort((a, b) => a.name.localeCompare(b.name));
  const myPendingJoins = trainingGroups.filter((g) => (g.pending || []).includes(user.id));
  const requestsForMe = trainingGroups.filter((g) => isLeader(g, user.id) && (g.pending || []).length > 0);
  const connected = connectedHandlerIds(repo, user.id).map((id) => byId.get(id)).filter((u): u is User => !!u).sort((a, b) => a.name.localeCompare(b.name));
  const liveEditing = editing ? trainingGroups.find((g) => g.id === editing.id) || null : null;
  const handlerCountOf = (managerId: string, type: ManagementGroupType) => directMembers(repo, managerId, type).filter((m) => byId.get(m)?.roles.includes('handler')).length;

  const run = async (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, onError?: (e: string) => void) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) { if (res.message) toast.show(res.message); return true; }
      if (onError) onError(res.error || 'Something went wrong'); else toast.show(res.error || 'Something went wrong', 'error');
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed — try again';
      if (onError) onError(msg); else toast.show(msg, 'error');
      return false;
    } finally { setBusy(false); }
  };

  const copyCode = async (g: TrainingGroup) => {
    try {
      const ok = await Clipboard.setStringAsync(fmtGroupCode(g.code));
      toast.show(ok ? `Group code ${fmtGroupCode(g.code)} copied` : `Group code: ${fmtGroupCode(g.code)}`);
    } catch { toast.show(`Group code: ${fmtGroupCode(g.code)}`); }
  };

  const doCreate = async () => {
    setCreateError(null);
    const ok = await run(async () => {
      const res = await createTrainingGroup(repo, user, newName, newMembers);
      if (res.ok && res.code) setLastCreated({ name: newName.trim(), code: res.code });
      return res;
    }, setCreateError);
    if (ok) { setCreateOpen(false); setNewName(''); setNewMembers([]); }
  };
  const doJoin = async () => {
    setJoinError(null);
    const ok = await run(() => joinByCode(repo, user, joinCode), setJoinError);
    if (ok) { setJoinOpen(false); setJoinCode(''); }
  };
  const doAddManager = async () => {
    if (!addManagerType) return;
    setManagerError(null);
    if (!managerPick) { setManagerError(`Pick the ${addManagerType} to grant access to.`); return; }
    const manager = byId.get(managerPick);
    if (!manager) { setManagerError('No account selected.'); return; }
    // The handler grants access to their own records: they land directly in the manager's group.
    const ok = await run(() => addManagedMember(repo, manager, addManagerType, user.id).then((r) => (r.ok ? { ok: true, message: `${manager.name} now has ${addManagerType === 'supervisor' ? 'Management Access' : 'trainer access'} to your records` } : r)), setManagerError);
    if (ok) { setAddManagerType(null); setManagerPick(''); }
  };

  // ---- Managers table ----
  type ManagerRow = { manager_id: string; type: ManagementGroupType; group_id: string; pending: boolean };
  const managerColumns: Column<ManagerRow>[] = [
    { key: 'name', title: 'NAME', flex: 2, render: (r) => (
      <View>
        <Text variant="bodyStrong">{nameOf(r.manager_id)}</Text>
        <Muted>{byId.get(r.manager_id)?.department || ''}{r.pending ? ' · Management Request pending' : ''}</Muted>
      </View>
    ) },
    { key: 'type', title: 'MANAGER TYPE', width: 150, render: (r) => (r.type === 'trainer' ? 'Trainer' : 'Supervisor') },
    { key: 'handlers', title: 'HANDLERS', width: 110, align: 'right', render: (r) => String(handlerCountOf(r.manager_id, r.type)) },
    { key: 'access', title: 'ACCESS', flex: 1, render: (r) => r.pending ? (
      <Row wrap gap={space.xs}>
        <Button title="Accept" onPress={() => void run(() => acceptManagement(repo, r.group_id, user))} testID={`btn-accept-management-${r.manager_id}`} />
        <Button title="Decline" variant="ghost" onPress={() => void run(() => declineManagement(repo, r.group_id, user))} testID={`btn-decline-management-${r.manager_id}`} />
      </Row>
    ) : <Muted>{r.type === 'supervisor' ? 'Reviews your records' : 'Comments on your records'}</Muted> },
    { key: 'menu', title: '', width: 60, render: (r) => (
      <IconButton icon="ellipsis-horizontal" accessibilityLabel={`Actions for ${nameOf(r.manager_id)}`} testID={`btn-manager-menu-${r.manager_id}`} onPress={() => setManagerRowMenu(r)} />
    ) },
  ];

  // ---- Training groups table ----
  const groupColumns: Column<TrainingGroup>[] = [
    { key: 'name', title: 'NAME', flex: 2, render: (g) => (
      // The name is the row's link (the row itself is not pressable: it holds the copy / ⋯ buttons and a button must never nest a button).
      <Pressable accessibilityRole="link" accessibilityLabel={`Open ${g.name}`} testID={`row-group-${g.id}`} onPress={() => setEditing(g)}>
        <Row wrap gap={space.xs}><Text variant="bodyStrong" style={{ color: c.primary }}>{g.name}</Text>{isLeader(g, user.id) ? <Badge tone="primary">LEADER</Badge> : null}</Row>
        {(g.pending || []).length && isLeader(g, user.id) ? <Muted>{(g.pending || []).length} join request{(g.pending || []).length === 1 ? '' : 's'} waiting</Muted> : null}
      </Pressable>
    ) },
    { key: 'created', title: 'CREATED', width: 130, render: (g) => fmtDate(g.created_at) },
    { key: 'code', title: 'GROUP CODE', width: 190, render: (g) => (
      <Row gap={4}>
        <Text style={{ fontVariant: ['tabular-nums'], letterSpacing: 1 }} testID={`text-group-code-${g.id}`}>{fmtGroupCode(g.code)}</Text>
        <IconButton icon="copy-outline" size={20} accessibilityLabel={`Copy group code ${fmtGroupCode(g.code)}`} testID={`btn-copy-code-${g.id}`} onPress={() => void copyCode(g)} />
      </Row>
    ) },
    { key: 'handlers', title: 'HANDLERS', width: 110, align: 'right', render: (g) => String((g.members || []).filter((m) => byId.get(m)?.roles.includes('handler')).length) },
    { key: 'menu', title: '', width: 60, render: (g) => <IconButton icon="ellipsis-horizontal" accessibilityLabel={`Actions for ${g.name}`} testID={`btn-group-menu-${g.id}`} onPress={() => setRowMenu(g)} /> },
  ];

  const supervisorOptions = users.filter((u) => u.id !== user.id && u.roles.includes(addManagerType || 'supervisor')).map((u) => ({ value: u.id, label: `${u.name} — ${u.department || 'no department'}`, description: u.email }));
  const managedHandlers = role === 'supervisor' || role === 'trainer' ? directMembers(repo, user.id, role).filter((m) => byId.get(m)?.roles.includes('handler')) : [];
  const managedSupervisors = role === 'supervisor' ? managedSupervisorIds(repo, user.id) : [];

  const addManagerBtn = <Button title="+ Manager" iconRight="chevron-down" variant="accent" onPress={() => setManagerMenu(true)} testID="btn-add-manager" />;
  const addGroupBtn = <Button title="+ Training Group" iconRight="chevron-down" variant="accent" onPress={() => setGroupMenu(true)} testID="btn-add-training-group" />;
  const viewHandlersBtn = <Button title={`VIEW ${connected.length} HANDLER${connected.length === 1 ? '' : 'S'}`} variant="secondary" onPress={() => setHandlersOpen(true)} testID="btn-view-handlers" />;
  const openManageBtn = <Button title="Open Manage" variant="secondary" icon="people-outline" onPress={() => router.push('/manage')} testID="btn-open-manage" />;

  return (
    <Screen
      title="Groups"
      subtitle={role === 'handler' ? 'Who can see and work with your records: your managers, your training groups and the handlers you are connected to.' : `${ROLE_LABEL[role || 'handler']} view — your management group and the training groups you belong to.`}
      testID="screen-groups"
    >
      {lastCreated ? (
        <Card style={{ marginBottom: space.md, borderColor: c.success, borderWidth: 1 }} testID="card-group-created">
          <Text variant="bodyStrong">“{lastCreated.name}” created — share the code with your handlers</Text>
          <Row wrap gap={space.sm} style={{ marginTop: 4 }}>
            <Text variant="h2" style={{ letterSpacing: 2 }} testID="text-new-group-code">{fmtGroupCode(lastCreated.code)}</Text>
            <Button title="Copy code" variant="secondary" icon="copy-outline" onPress={() => void copyCode({ code: lastCreated.code } as TrainingGroup)} testID="btn-copy-new-code" />
            <Button title="Dismiss" variant="ghost" onPress={() => setLastCreated(null)} testID="btn-dismiss-created" />
          </Row>
        </Card>
      ) : null}

      {role === 'supervisor' || role === 'trainer' ? (
        <Card style={{ marginBottom: space.md }} testID="card-management-groups">
          <Section title={role === 'supervisor' ? 'Manager Group — Management Access' : 'Trainer Group'} description={role === 'supervisor' ? 'Handlers and supervisors you manage. Managing another supervisor grants access to everyone they supervise.' : 'Handlers you train — you can create events and exercises for them and add trainer comments.'} actions={desktop ? openManageBtn : null}>
            {!desktop ? <View style={{ marginBottom: space.sm, alignItems: 'flex-start' }}>{openManageBtn}</View> : null}
            <Row wrap gap={space.md}>
              <View style={{ minWidth: 220, flex: 1 }}>
                <Muted>Managed handlers ({managedHandlers.length})</Muted>
                {managedHandlers.length ? managedHandlers.map((id) => <Text key={id} testID={`managed-handler-${id}`}>{nameOf(id)}</Text>) : <Muted>None yet — add them from Manage.</Muted>}
              </View>
              {role === 'supervisor' ? (
                <View style={{ minWidth: 220, flex: 1 }}>
                  <Muted>Managed supervisors ({managedSupervisors.length})</Muted>
                  {managedSupervisors.length ? managedSupervisors.map((id) => <Text key={id} testID={`managed-supervisor-${id}`}>{nameOf(id)}</Text>) : <Muted>None.</Muted>}
                </View>
              ) : null}
            </Row>
          </Section>
        </Card>
      ) : null}

      <Card style={{ marginBottom: space.md }} testID="card-managers">
        <Section title="Managers" description="Managers are supervisors or trainers who have some access to your account: trainers create events and exercises and add training notes; supervisors approve or reject your records and administer billing." actions={role === 'handler' && desktop ? addManagerBtn : null}>
          {role === 'handler' && !desktop ? <View style={{ marginBottom: space.sm, alignItems: 'flex-start' }}>{addManagerBtn}</View> : null}
          <Table columns={managerColumns} rows={managers} keyOf={(r) => `${r.group_id}:${r.manager_id}`} testID="table-managers" emptyText="No managers yet. Use + Manager to grant a supervisor or trainer access to your records." rowTestID={(r) => `row-manager-${r.manager_id}`} />
        </Section>
      </Card>

      <Card style={{ marginBottom: space.md }} testID="card-training-groups">
        <Section title="Training Groups" description="A training group is a set of handlers you commonly train with. Joined groups are listed with any outstanding join requests." actions={desktop ? addGroupBtn : null}>
          {!desktop ? <View style={{ marginBottom: space.sm, alignItems: 'flex-start' }}>{addGroupBtn}</View> : null}
          {requestsForMe.length ? (
            <View style={{ marginBottom: space.sm, gap: space.xs }} testID="list-join-requests">
              {requestsForMe.flatMap((g) => (g.pending || []).map((p) => (
                <Row key={`${g.id}:${p}`} wrap justify="space-between" style={[styles.request, { backgroundColor: c.warningSoft, borderColor: c.warning }]} testID={`join-request-${g.id}-${p}`}>
                  <Text style={{ flex: 1, minWidth: 160 }}><Text variant="bodyStrong">{nameOf(p)}</Text> asked to join <Text variant="bodyStrong">{g.name}</Text> with the group code.</Text>
                  <Row gap={space.xs}>
                    <Button title="Accept" onPress={() => void run(() => acceptRequest(repo, g, p, user))} testID={`btn-accept-join-${g.id}-${p}`} />
                    <Button title="Remove Request" variant="ghost" onPress={() => void run(() => declineRequest(repo, g, p, user))} testID={`btn-decline-join-${g.id}-${p}`} />
                  </Row>
                </Row>
              )))}
            </View>
          ) : null}
          {myPendingJoins.map((g) => (
            <Row key={g.id} wrap style={[styles.request, { backgroundColor: c.infoSoft, borderColor: c.info, marginBottom: space.sm }]} testID={`pending-join-${g.id}`}>
              <Ionicons name="hourglass-outline" size={20} color={c.info} />
              <Text style={{ flex: 1 }}>Your request to join <Text variant="bodyStrong">{g.name}</Text> was sent with the group code and has not been accepted yet.</Text>
            </Row>
          ))}
          <Table columns={groupColumns} rows={myGroups} keyOf={(g) => g.id} testID="table-training-groups" emptyText="You are not in a training group yet. Create one or join with a 7-character code." />
        </Section>
      </Card>

      <Card testID="card-connected-handlers">
        <Section title="Connected Handlers" description="Connections are automatic between handlers who share a supervisor, a trainer or a training group — like a friends list. Connected handlers can be added to new training groups without an invite." actions={connected.length && desktop ? viewHandlersBtn : null}>
          {connected.length && !desktop ? <View style={{ marginBottom: space.sm, alignItems: 'flex-start' }}>{viewHandlersBtn}</View> : null}
          {connected.length === 0 ? <Muted testID="connected-empty">No connections yet.</Muted> : (
            <Row wrap gap={space.sm} testID="grid-connected-handlers">
              {connected.slice(0, desktop ? 24 : 12).map((u) => (
                <Pressable key={u.id} accessibilityRole="button" accessibilityLabel={u.name} testID={`avatar-${u.id}`} onPress={() => setHandlersOpen(true)} style={{ alignItems: 'center', width: 76 }}>
                  <Avatar user={u} />
                  <Text numberOfLines={1} style={{ marginTop: 4, textAlign: 'center' }}>{u.first_name || u.name.split(' ')[0]}</Text>
                </Pressable>
              ))}
            </Row>
          )}
        </Section>
      </Card>

      {/* + Manager ▾ */}
      <MenuSheet visible={managerMenu} onClose={() => setManagerMenu(false)} title="+ Manager" testID="sheet-manager-menu" items={[
        { key: 'sup', label: 'Add Supervisor … (Management Access)', icon: 'shield-checkmark-outline', testID: 'menu-add-supervisor', onPress: () => { setAddManagerType('supervisor'); setManagerPick(''); setManagerError(null); } },
        { key: 'tr', label: 'Add Trainer …', icon: 'school-outline', testID: 'menu-add-trainer', onPress: () => { setAddManagerType('trainer'); setManagerPick(''); setManagerError(null); } },
      ]} />
      <Sheet visible={!!addManagerType} onClose={() => setAddManagerType(null)} title={addManagerType === 'trainer' ? 'Add Trainer' : 'Add Supervisor'} testID="sheet-add-manager" footer={(
        <Row justify="flex-end">
          <Button title="Cancel" variant="secondary" onPress={() => setAddManagerType(null)} testID="btn-cancel-add-manager" />
          <Button title="Grant access" onPress={() => void doAddManager()} loading={busy} testID="btn-confirm-add-manager" />
        </Row>
      )}>
        <Muted style={{ marginBottom: space.sm }}>{addManagerType === 'trainer' ? 'A trainer you add can view your training records, create events and exercises for you and add trainer comments.' : 'A supervisor you add gets Management Access: they can view your records, review or reject them and manage your billing. They can never alter your data.'} Local mode: pick an existing account.</Muted>
        <Select label={addManagerType === 'trainer' ? 'Trainer' : 'Supervisor'} required options={supervisorOptions} value={managerPick} onChange={(v) => { setManagerPick(v); setManagerError(null); }} error={managerError} allowCustom={false} placeholder="Choose an account" testID="select-manager" />
      </Sheet>

      {/* Managers row ⋯ */}
      <MenuSheet visible={!!managerRowMenu} onClose={() => setManagerRowMenu(null)} title={managerRowMenu ? nameOf(managerRowMenu.manager_id) : 'Manager'} testID="sheet-manager-row-menu" items={managerRowMenu ? [
        { key: 'view', label: 'View manager', icon: 'person-circle-outline', testID: 'menu-manager-view', onPress: () => setManagerView({ manager_id: managerRowMenu.manager_id, type: managerRowMenu.type }) },
        { key: 'revoke', label: managerRowMenu.type === 'supervisor' ? 'Revoke Management Access' : 'Revoke trainer access', icon: 'close-circle-outline', danger: true, testID: 'menu-manager-revoke', onPress: () => setRevoking({ manager_id: managerRowMenu.manager_id, type: managerRowMenu.type, group_id: managerRowMenu.group_id }) },
      ] : []} />
      <Sheet visible={!!managerView} onClose={() => setManagerView(null)} title={managerView ? nameOf(managerView.manager_id) : 'Manager'} testID="sheet-manager-view" maxWidth={480} footer={(
        <Row justify="flex-end"><Button title="Close" onPress={() => setManagerView(null)} testID="btn-close-manager-view" /></Row>
      )}>
        {managerView ? (() => {
          const m = byId.get(managerView.manager_id);
          return (
            <View>
              <Row gap={space.sm} style={{ marginBottom: space.sm }}>
                {m ? <Avatar user={m} /> : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong">{m?.name || '—'}</Text>
                  <Muted>{m?.department || ''}{m?.email ? ` · ${m.email}` : ''}</Muted>
                </View>
              </Row>
              <Muted>Manager type</Muted>
              <Text style={{ marginBottom: space.sm }}>{managerView.type === 'supervisor' ? 'Supervisor — Management Access' : 'Trainer'}</Text>
              <Muted>Handlers they manage</Muted>
              <Text style={{ marginBottom: space.sm }}>{handlerCountOf(managerView.manager_id, managerView.type)}</Text>
              <Muted>What they can do with your account</Muted>
              <Text>{managerView.type === 'supervisor' ? 'View your records, mark them Reviewed or Rejected, share them with another supervisor and administer your billing. They can never alter your data.' : 'View your training records, create events and exercises for you and add trainer comments. They can never alter your data.'}</Text>
            </View>
          );
        })() : null}
      </Sheet>
      <ConfirmDialog
        visible={!!revoking}
        title={revoking?.type === 'supervisor' ? 'Revoke Management Access?' : 'Revoke trainer access?'}
        body={revoking ? `${nameOf(revoking.manager_id)} will lose ${revoking.type === 'supervisor' ? 'access to your records, the ability to mark them Reviewed or Rejected, and billing administration for your seat' : 'access to your training records, the ability to create events and exercises for you and to add trainer comments'}. Nothing is deleted — your records and History stay exactly as they are, and you can grant access again with + Manager.` : ''}
        confirmTitle="Revoke access"
        onConfirm={() => { const r = revoking; setRevoking(null); if (r) void run(() => revokeManagement(repo, r.group_id, user)); }}
        onCancel={() => setRevoking(null)}
        testID="dialog-revoke-manager"
      />

      {/* + Training Group ▾ */}
      <MenuSheet visible={groupMenu} onClose={() => setGroupMenu(false)} title="+ Training Group" testID="sheet-group-menu" items={[
        { key: 'create', label: 'Create Training Group …', icon: 'add-circle-outline', testID: 'menu-create-group', onPress: () => { setCreateOpen(true); setCreateError(null); } },
        { key: 'join', label: 'Join Training Group by code …', icon: 'key-outline', testID: 'menu-join-group', onPress: () => { setJoinOpen(true); setJoinError(null); } },
      ]} />
      <Sheet visible={createOpen} onClose={() => setCreateOpen(false)} title="Create Training Group" testID="sheet-create-group" footer={(
        <Row justify="flex-end">
          <Button title="Cancel" variant="secondary" onPress={() => setCreateOpen(false)} testID="btn-cancel-create-group" />
          <Button title="Create group" icon="add" onPress={() => void doCreate()} loading={busy} testID="btn-confirm-create-group" />
        </Row>
      )}>
        <TextField label="Group name" required value={newName} onChangeText={(v) => { setNewName(v); if (createError) setCreateError(null); }} error={createError} placeholder="e.g. Regional Detection Team" maxLength={50} testID="input-group-name" help="You become the group leader. A 7-character group code is generated — handlers join with it." autoFocus />
        {connected.length ? (
          <View>
            <Text variant="label" style={{ marginBottom: 6 }}>Add Members (connected handlers)</Text>
            {connected.map((u) => (
              <Checkbox key={u.id} label={u.name} value={newMembers.includes(u.id)} onChange={(v) => setNewMembers((m) => (v ? [...m, u.id] : m.filter((x) => x !== u.id)))} testID={`check-new-member-${u.id}`} />
            ))}
          </View>
        ) : null}
      </Sheet>
      <Sheet visible={joinOpen} onClose={() => setJoinOpen(false)} title="Join Training Group" testID="sheet-join-group" footer={(
        <Row justify="flex-end">
          <Button title="Cancel" variant="secondary" onPress={() => setJoinOpen(false)} testID="btn-cancel-join-group" />
          <Button title="Send request" icon="key-outline" onPress={() => void doJoin()} loading={busy} testID="btn-confirm-join-group" />
        </Row>
      )}>
        <Muted style={{ marginBottom: space.sm }}>A group code is 7 letters and numbers (e.g. ASH-7K9Q). Typing a known code sends a join request and notifies the group's leaders; you become a member once a leader accepts.</Muted>
        <TextField label="Group code" required value={joinCode} onChangeText={(v) => { setJoinCode(v.toUpperCase()); if (joinError) setJoinError(null); }} error={joinError} placeholder="XXX-XXXX" autoCapitalize="characters" maxLength={8} testID="input-join-code" autoFocus />
      </Sheet>

      {/* row ⋯ */}
      <MenuSheet visible={!!rowMenu} onClose={() => setRowMenu(null)} title={rowMenu?.name || 'Group'} testID="sheet-group-row-menu" items={rowMenu ? [
        { key: 'open', label: isLeader(rowMenu, user.id) ? 'Edit group / members' : 'View members', icon: 'people-outline', testID: 'menu-group-edit', onPress: () => setEditing(rowMenu) },
        { key: 'copy', label: `Copy group code ${fmtGroupCode(rowMenu.code)}`, icon: 'copy-outline', testID: 'menu-group-copy', onPress: () => void copyCode(rowMenu) },
        { key: 'leave', label: 'Leave group', icon: 'exit-outline', danger: true, testID: 'menu-group-leave', onPress: () => setLeaving(rowMenu) },
      ] : []} />

      {/* editor / members */}
      <Sheet visible={!!liveEditing} onClose={() => { setEditing(null); setEditError(null); setAddPick(''); setInviteEmail(''); }} title={liveEditing?.name || 'Group'} testID="sheet-group-editor" maxWidth={640} footer={liveEditing ? (
        <Row justify="space-between" wrap>
          <Button title="Leave group" variant="ghost" icon="exit-outline" onPress={() => setLeaving(liveEditing)} testID="btn-leave-group" />
          <Button title="Done" onPress={() => setEditing(null)} testID="btn-close-group-editor" />
        </Row>
      ) : null}>
        {liveEditing ? (() => {
          const g = liveEditing;
          const leader = isLeader(g, user.id);
          const memberIds = [...new Set([...(g.members || []), ...(g.leaders || []), g.leader_id])];
          const addable = connected.filter((u) => !isMember(g, u.id));
          return (
            <View>
              <Row wrap gap={space.sm} style={{ marginBottom: space.sm }}>
                <Muted>Group code</Muted>
                <Text variant="bodyStrong" style={{ letterSpacing: 1 }}>{fmtGroupCode(g.code)}</Text>
                <Button title="Copy" variant="ghost" icon="copy-outline" onPress={() => void copyCode(g)} testID="btn-copy-code-editor" />
                <Muted>· created {fmtDate(g.created_at)}</Muted>
              </Row>
              {!leader ? <Muted style={{ marginBottom: space.sm }}>Only a configured group leader may edit a group. A Leader edits training groups, creates events for the group and adds exercises.</Muted> : null}
              <Text variant="label" style={{ marginBottom: 4 }}>Members ({memberIds.length})</Text>
              {memberIds.map((id) => {
                const u = byId.get(id);
                if (!u) return null;
                return (
                  <Row key={id} wrap justify="space-between" style={[styles.memberRow, { borderBottomColor: c.border }]} testID={`member-row-${id}`}>
                    <Row gap={space.sm} style={{ flex: 1, minWidth: 180 }}>
                      <Avatar user={u} size={36} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="bodyStrong" numberOfLines={1}>{u.name}{id === user.id ? ' (you)' : ''}</Text>
                        <Muted numberOfLines={1}>{u.roles.map((r) => ROLE_LABEL[r]).join(' · ')}{u.department ? ` · ${u.department}` : ''}</Muted>
                      </View>
                    </Row>
                    <Row gap={space.xs}>
                      <Checkbox label="LEADER" value={isLeader(g, id)} disabled={!leader} onChange={(v) => void run(() => setLeader(repo, g, id, v, user))} testID={`check-leader-${id}`} style={{ paddingVertical: 0, minHeight: 40 }} />
                      {leader && id !== user.id ? <IconButton icon="person-remove-outline" accessibilityLabel={`Remove ${u.name} from the group`} testID={`btn-remove-member-${id}`} onPress={() => setRemoving({ g, userId: id })} color={c.danger} /> : null}
                    </Row>
                  </Row>
                );
              })}
              {leader ? (
                <View style={{ marginTop: space.md }}>
                  <Text variant="label" style={{ marginBottom: 6 }}>Add Members</Text>
                  {addable.length ? (
                    <Row wrap align="flex-end">
                      <View style={{ flex: 1, minWidth: 220 }}>
                        <Select label="Connected handler" options={addable.map((u) => ({ value: u.id, label: u.name, description: u.email }))} value={addPick} onChange={setAddPick} allowCustom={false} placeholder="Choose a connected handler" testID="select-add-member" />
                      </View>
                      <Button title="Add" icon="person-add-outline" disabled={!addPick} onPress={() => void run(() => addMembers(repo, g, [addPick], user)).then((ok) => { if (ok) setAddPick(''); })} testID="btn-add-member" style={{ marginBottom: space.md }} />
                    </Row>
                  ) : <Muted style={{ marginBottom: space.sm }}>Every connected handler is already a member.</Muted>}
                  <Row wrap align="flex-end">
                    <View style={{ flex: 1, minWidth: 220 }}>
                      <TextField label="INVITE A NEW GROUP MEMBER" value={inviteEmail} onChangeText={(v) => { setInviteEmail(v); if (editError) setEditError(null); }} error={editError} placeholder="email@agency.gov" autoCapitalize="none" keyboardType="email-address" testID="input-invite-email" help="Local mode: the account must already exist." />
                    </View>
                    <Button title="Invite" variant="secondary" icon="mail-outline" disabled={!inviteEmail.trim()} onPress={() => {
                      const target = users.find((u) => u.email.toLowerCase() === inviteEmail.trim().toLowerCase());
                      if (!target) { setEditError('No account with that email yet (local mode).'); return; }
                      void run(() => addMembers(repo, g, [target.id], user), setEditError).then((ok) => { if (ok) setInviteEmail(''); });
                    }} testID="btn-invite-member" style={{ marginBottom: space.md }} />
                  </Row>
                  <Muted>Constraints: you must have at least one handler in a group and at least one member with editor access; you cannot remove yourself.</Muted>
                </View>
              ) : null}
            </View>
          );
        })() : null}
      </Sheet>

      <Sheet visible={handlersOpen} onClose={() => setHandlersOpen(false)} title={`Connected Handlers (${connected.length})`} testID="sheet-connected-handlers">
        {connected.map((u) => (
          <Row key={u.id} gap={space.sm} style={[styles.memberRow, { borderBottomColor: c.border }]} testID={`connected-${u.id}`}>
            <Avatar user={u} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyStrong">{u.name}</Text>
              <Muted>{u.department || ''}{u.email ? ` · ${u.email}` : ''}</Muted>
            </View>
          </Row>
        ))}
      </Sheet>

      <ConfirmDialog visible={!!leaving} title={`Leave ${leaving?.name || 'this group'}?`} body="If you press OK then you will no longer be a member of this group." confirmTitle="OK" onConfirm={() => { const g = leaving; setLeaving(null); if (g) void run(() => leaveGroup(repo, g, user)).then((ok) => { if (ok) setEditing(null); }); }} onCancel={() => setLeaving(null)} testID="dialog-leave-group" />
      <ConfirmDialog visible={!!removing} title="Remove this member from the group?" body={removing ? `${nameOf(removing.userId)} will no longer be a member of ${removing.g.name}. Their records are untouched.` : ''} confirmTitle="Remove" onConfirm={() => { const r = removing; setRemoving(null); if (r) void run(() => removeMember(repo, r.g, r.userId, user)); }} onCancel={() => setRemoving(null)} testID="dialog-remove-member" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  menuItem: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: space.sm, borderRadius: radius.sm },
  request: { borderWidth: 1, borderRadius: radius.md, padding: space.sm, gap: space.sm },
  memberRow: { paddingVertical: space.xs, borderBottomWidth: 1, minHeight: 48 },
});
