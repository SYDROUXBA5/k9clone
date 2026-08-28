// MANAGE (bar §2.13) — supervisor (and trainer) page.
//   "+ Member ▾": Add Handler … · Add Supervisor … · Invite Supervisor … · Invite Trainer … · Signup New Member ·
//     Add Handler to Subscription (billing, U7). Local mode: pick an existing account by email.
//   Managed Supervisors table: Name (+ agency) · Handlers · Supervisors · ⋯
//   Handlers table: All (n) ▾ / Show Inactive; sortable Name (+ agency, dogs) · Last 3 Months → Late Records ·
//     Training Hours · Total Deploys · Training By Month (12 bars, GREEN ≥ 16 h) · Deployments By Month · ⋯
//     (History · Profile · Dogs · Records · Remove · Transfer). Removing / transferring keeps records + History —
//     the confirm dialog shows the counts before, the toast after.
//   Phone: cards "<Agency> / <Name>", "Last 3 Months: n Late Records · n Training Hours · n Total Deploys", mini charts.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { directMembers, managedSupervisorIds, managedUserIds } from '@/db/access';
import { useList, useRepo } from '@/db/provider';
import { LATE_RULE_TEXT } from '@/db/review';
import type { ManagementGroupType, User } from '@/db/types';
import { ROLE_LABEL } from '@/db/types';
import { TRAINING_HOURS_GREEN } from '@/db/vocab';
import { useAuth } from '@/features/auth/AuthProvider';
import { Badge, Button, Card, Checkbox, ConfirmDialog, Muted, Row, Screen, Section, Select, Sheet, Text, TextField, fmtDate, useColors, useIsDesktop, useToast, radius, space } from '@/ui';
import { addManagedMember, inviteManagedMember, removeManagedMember, signupNewMember, transferManagedMember } from './groupsLogic';
import { handlerRecordCounts, handlerStats, type HandlerStats, type MonthBucket } from './manageStats';

type SortKey = 'name' | 'late' | 'hours' | 'deploys' | 'last';
type MenuItem = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; danger?: boolean; testID: string; caption?: string };

function MenuSheet({ visible, onClose, title, items, testID }: { visible: boolean; onClose: () => void; title: string; items: MenuItem[]; testID: string }) {
  const c = useColors();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID} maxWidth={440}>
      {items.map((m) => (
        <Pressable key={m.key} accessibilityRole="menuitem" testID={m.testID} onPress={() => { onClose(); m.onPress(); }} style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
          <Ionicons name={m.icon} size={22} color={m.danger ? c.danger : c.primary} style={{ marginRight: space.sm }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: m.danger ? c.danger : c.text }}>{m.label}</Text>
            {m.caption ? <Muted>{m.caption}</Muted> : null}
          </View>
        </Pressable>
      ))}
    </Sheet>
  );
}

/** 12 mini bars; training bars turn green at ≥ 16 h in that month. */
export function MonthBars({ months, kind, testID }: { months: MonthBucket[]; kind: 'hours' | 'deploys'; testID?: string }) {
  const c = useColors();
  const max = Math.max(kind === 'hours' ? TRAINING_HOURS_GREEN * 1.5 : 4, ...months.map((m) => (kind === 'hours' ? m.hours : m.deploys)));
  return (
    <View testID={testID} accessibilityLabel={months.map((m) => `${m.label}: ${kind === 'hours' ? `${m.hours} h` : `${m.deploys}`}`).join(', ')} style={styles.bars}>
      {months.map((m) => {
        const v = kind === 'hours' ? m.hours : m.deploys;
        const h = Math.max(v > 0 ? 3 : 1, Math.round((v / max) * 28));
        const green = kind === 'hours' && m.green;
        return (
          <View key={m.key} style={styles.barCol} testID={testID ? `${testID}-${m.key}` : undefined} accessibilityLabel={`${m.label} ${kind === 'hours' ? `${m.hours} hours${green ? ' (16 or more)' : ''}` : `${m.deploys} deployments`}`}>
            <View style={[styles.bar, { height: h, backgroundColor: green ? c.success : v > 0 ? c.borderStrong : c.border }]} />
          </View>
        );
      })}
    </View>
  );
}

const hoursLabel = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1));
/** "1 class" / "3 classes" — every count in the remove / transfer confirms goes through this. */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function ManageScreen() {
  const { user, role } = useAuth();
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const desktop = useIsDesktop();
  const users = useList('user');
  const mgmt = useList('management_group');
  const completions = useList('completion'); const deployments = useList('deployment'); const classes = useList('class_record'); const vet = useList('vet_visit'); const dogsList = useList('dog'); const seats = useList('seat'); const events = useList('training_event');
  const type: ManagementGroupType = role === 'trainer' ? 'trainer' : 'supervisor';
  const [showInactive, setShowInactive] = useState(false);
  // "All (n) ▾" is a real filter: All (respects Show Inactive) · Active only · Inactive only.
  const [listFilter, setListFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [listFilterMenu, setListFilterMenu] = useState(false);
  const [sort, setSort] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [memberMenu, setMemberMenu] = useState(false);
  const [addKind, setAddKind] = useState<'handler' | 'supervisor' | 'invite_supervisor' | 'invite_trainer' | 'signup' | null>(null);
  const [pick, setPick] = useState('');
  const [email, setEmail] = useState('');
  const [signup, setSignup] = useState({ first_name: '', last_name: '', email: '', department: '', password: '' });
  const [formError, setFormError] = useState<string | null>(null);
  // MAN-06: the signup sheet keeps one error PER FIELD so the message and the red box land on the
  // field that is actually empty (a single shared string used to pin everything on Email).
  const [signupErrors, setSignupErrors] = useState<{ first_name?: string; last_name?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  const [rowMenu, setRowMenu] = useState<HandlerStats | null>(null);
  const [supMenu, setSupMenu] = useState<User | null>(null);
  const [removing, setRemoving] = useState<{ user: User; counts: ReturnType<typeof handlerRecordCounts> } | null>(null);
  const [transferring, setTransferring] = useState<{ user: User; counts: ReturnType<typeof handlerRecordCounts> } | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const memberIds = user ? directMembers(repo, user.id, type) : [];
  const handlerIds = memberIds.filter((id) => byId.get(id)?.roles.includes('handler'));
  const inheritedIds = user && role === 'supervisor' ? managedUserIds(repo, user.id, 'supervisor').filter((id) => !memberIds.includes(id) && byId.get(id)?.roles.includes('handler')) : [];
  const supervisorIds = user && role === 'supervisor' ? managedSupervisorIds(repo, user.id) : [];
  const stats = useMemo(() => [...handlerIds, ...inheritedIds].map((id) => handlerStats(repo, id)).filter((s): s is HandlerStats => !!s), [repo, handlerIds.join(','), inheritedIds.join(','), mgmt, users, completions, deployments, classes, vet, dogsList, seats, events]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return null;

  const visible = stats.filter((s) => (listFilter === 'active' ? !s.inactive : listFilter === 'inactive' ? s.inactive : showInactive || !s.inactive)).sort((a, b) => {
    const v = (s: HandlerStats) => sort === 'name' ? s.user.name : sort === 'late' ? s.late3m : sort === 'hours' ? s.hours3m : sort === 'deploys' ? s.deploys3m : (s.lastRecordAt || '');
    const x = v(a), y = v(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sortDir;
  });
  const inactiveCount = stats.filter((s) => s.inactive).length;
  const toggleSort = (k: SortKey) => { if (sort === k) setSortDir((d) => (d === 1 ? -1 : 1)); else { setSort(k); setSortDir(k === 'name' ? 1 : -1); } };

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
  const closeAdd = () => { setAddKind(null); setPick(''); setEmail(''); setFormError(null); setSignupErrors({}); setSignup({ first_name: '', last_name: '', email: '', department: '', password: '' }); };
  /** Route a signupNewMember error string back to the field it is about. */
  const signupFieldFor = (msg: string): 'first_name' | 'last_name' | 'email' =>
    /^first name/i.test(msg) ? 'first_name' : /^last name/i.test(msg) ? 'last_name' : 'email';
  const submitAdd = async () => {
    setFormError(null);
    let ok = false;
    if (addKind === 'handler' || addKind === 'supervisor') {
      if (!pick) { setFormError(`Pick the ${addKind} to add.`); return; }
      ok = await run(() => addManagedMember(repo, user, type, pick), setFormError);
    } else if (addKind === 'invite_supervisor' || addKind === 'invite_trainer') {
      ok = await run(() => inviteManagedMember(repo, user, addKind === 'invite_trainer' ? 'trainer' : type, email), setFormError);
    } else if (addKind === 'signup') {
      // Name every missing field at once — a blank form must say what is missing, on the field itself.
      const errs: typeof signupErrors = {};
      if (!signup.first_name.trim()) errs.first_name = 'First name is required.';
      if (!signup.last_name.trim()) errs.last_name = 'Last name is required.';
      if (!signup.email.trim() || !signup.email.includes('@')) errs.email = 'A valid email is required.';
      setSignupErrors(errs);
      if (Object.keys(errs).length) return;
      ok = await run(() => signupNewMember(repo, user, type, signup), (e) => setSignupErrors({ [signupFieldFor(e)]: e }));
    }
    if (ok) closeAdd();
  };
  const openRemove = (u: User) => { setRowMenu(null); setSupMenu(null); setRemoving({ user: u, counts: handlerRecordCounts(repo, u.id) }); };
  const openTransfer = (u: User) => { setRowMenu(null); setTransferTo(''); setTransferError(null); setTransferring({ user: u, counts: handlerRecordCounts(repo, u.id) }); };
  const doRemove = async () => {
    const r = removing;
    setRemoving(null);
    if (!r) return;
    const before = r.counts;
    const ok = await run(() => removeManagedMember(repo, user, type, r.user.id).then((res) => (res.ok ? { ok: true } : res)));
    if (ok) {
      const after = handlerRecordCounts(repo, r.user.id);
      toast.show(`${r.user.name} removed — records ${before.records} → ${after.records}, History ${before.history} → ${after.history} (kept)`);
    }
  };
  const doTransfer = async () => {
    const t = transferring;
    if (!t) return;
    if (!transferTo) { setTransferError('Pick the supervisor to transfer to.'); return; }
    const before = t.counts;
    const ok = await run(() => transferManagedMember(repo, user, t.user.id, transferTo).then((res) => (res.ok ? { ok: true } : res)), setTransferError);
    if (ok) {
      setTransferring(null);
      const after = handlerRecordCounts(repo, t.user.id);
      toast.show(`${t.user.name} transferred — records ${before.records} → ${after.records}, History ${before.history} → ${after.history} (kept)`);
    }
  };

  const candidateHandlers = users.filter((u) => u.id !== user.id && u.roles.includes('handler') && !memberIds.includes(u.id));
  const candidateSupervisors = users.filter((u) => u.id !== user.id && u.roles.includes('supervisor') && !memberIds.includes(u.id));
  const otherSupervisors = users.filter((u) => u.id !== user.id && u.roles.includes('supervisor'));
  const opt = (u: User) => ({ value: u.id, label: `${u.name} — ${u.department || 'no department'}`, description: u.email });

  const SortHeader = ({ k, title, width, flex, align }: { k: SortKey; title: string; width?: number; flex?: number; align?: 'left' | 'right' | 'center' }) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`Sort by ${title}`} testID={`sort-${k}`} onPress={() => toggleSort(k)} style={[styles.td, width ? { width } : { flex: flex ?? 1 }]}>
      <Row gap={4} justify={align === 'right' ? 'flex-end' : undefined}>
        <Text variant="label" color="muted">{title}</Text>
        {sort === k ? <Ionicons name={sortDir === 1 ? 'caret-up' : 'caret-down'} size={16} color={c.muted} /> : null}
      </Row>
    </Pressable>
  );

  const rowMenuItems = (s: HandlerStats): MenuItem[] => [
    { key: 'records', label: 'Records', caption: 'Open Records filtered to this handler', icon: 'clipboard-outline', testID: 'menu-handler-records', onPress: () => router.push(`/records?handler=${s.user.id}` as never) },
    { key: 'review', label: 'Review queue', caption: 'Their records awaiting review', icon: 'shield-half-outline', testID: 'menu-handler-review', onPress: () => router.push('/review' as never) },
    { key: 'history', label: 'History', caption: "This handler's modification history", icon: 'time-outline', testID: 'menu-handler-history', onPress: () => router.push(`/history?user=${s.user.id}` as never) },
    { key: 'profile', label: 'Profile', icon: 'person-circle-outline', testID: 'menu-handler-profile', onPress: () => router.push(`/profile?user=${s.user.id}` as never) },
    { key: 'dogs', label: 'Dogs', icon: 'paw-outline', testID: 'menu-handler-dogs', onPress: () => router.push('/dogs' as never) },
    { key: 'billing', label: 'Billing / configuration', caption: s.seat ? `${s.seat.plan} seat · ${s.seat.status} · ends ${fmtDate(s.seat.ends)}` : 'No subscription (inactive)', icon: 'card-outline', testID: 'menu-handler-billing', onPress: () => router.push('/billing' as never) },
    ...(role === 'supervisor' && memberIds.includes(s.user.id) ? [{ key: 'transfer', label: 'Transfer to another supervisor …', caption: 'Records and History stay with the handler', icon: 'swap-horizontal-outline' as const, testID: 'menu-handler-transfer', onPress: () => openTransfer(s.user) }] : []),
    { key: 'remove', label: 'Remove Handler', caption: 'Records and History are kept', icon: 'person-remove-outline', danger: true, testID: 'menu-handler-remove', onPress: () => openRemove(s.user) },
  ];

  const memberMenuItems: MenuItem[] = [
    { key: 'add-h', label: 'Add Handler ...', caption: 'An existing account (local mode)', icon: 'person-add-outline', testID: 'menu-add-handler', onPress: () => setAddKind('handler') },
    ...(role === 'supervisor' ? [{ key: 'add-s', label: 'Add Supervisor ...', caption: 'Managing a supervisor grants access to everyone they supervise', icon: 'shield-checkmark-outline' as const, testID: 'menu-add-supervisor', onPress: () => setAddKind('supervisor') }] : []),
    ...(role === 'supervisor' ? [{ key: 'inv-s', label: 'Invite Supervisor ...', caption: 'Management Request by email — they accept from Groups', icon: 'mail-outline' as const, testID: 'menu-invite-supervisor', onPress: () => setAddKind('invite_supervisor') }] : []),
    { key: 'inv-t', label: 'Invite Trainer ...', caption: 'A handler who accepts lets the trainer view their records and create new ones', icon: 'school-outline', testID: 'menu-invite-trainer', onPress: () => setAddKind('invite_trainer') },
    { key: 'signup', label: 'Signup New Member', caption: 'Create the account (30-day trial); password optional', icon: 'create-outline', testID: 'menu-signup-member', onPress: () => setAddKind('signup') },
    { key: 'sub', label: 'Add Handler to Subscription', caption: 'Group subscriptions — Billing', icon: 'card-outline', testID: 'menu-add-to-subscription', onPress: () => router.push('/billing' as never) },
  ];

  const handlerCard = (s: HandlerStats) => (
    <Card key={s.user.id} testID={`handler-card-${s.user.id}`} style={{ marginBottom: space.sm }}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1, minWidth: 0 }}>
          <Muted>{s.agencyName}</Muted>
          <Text variant="h3">{s.user.name}</Text>
          <Row wrap gap={space.xs} style={{ marginTop: 2 }}>
            <Muted>{s.dogs} dog{s.dogs === 1 ? '' : 's'}</Muted>
            {s.noTraining30d ? <Badge tone="accent" testID={`badge-no-training-${s.user.id}`}>NO TRAINING IN 30 DAYS</Badge> : null}
            {s.inactive ? <Badge tone="muted">INACTIVE</Badge> : null}
          </Row>
        </View>
        <Button title="⋯" variant="ghost" accessibilityLabel={`Actions for ${s.user.name}`} testID={`btn-handler-menu-${s.user.id}`} onPress={() => setRowMenu(s)} />
      </Row>
      <Text style={{ marginTop: space.xs }}>Last 3 Months: <Text variant="bodyStrong">{s.late3m}</Text> Late Records · <Text variant="bodyStrong">{hoursLabel(s.hours3m)}</Text> Training Hours · <Text variant="bodyStrong">{s.deploys3m}</Text> Total Deploys</Text>
      <Muted>Last record: {s.lastRecordAt ? fmtDate(s.lastRecordAt) : '—'} · This month: {hoursLabel(s.hoursThisMonth)} h training{s.hoursThisMonth >= TRAINING_HOURS_GREEN ? ' ✓' : ''}, {s.deploysThisMonth} deployment{s.deploysThisMonth === 1 ? '' : 's'}</Muted>
      <Row wrap gap={space.md} style={{ marginTop: space.sm }}>
        <View><Muted>Training By Month</Muted><MonthBars months={s.months} kind="hours" testID={`bars-hours-${s.user.id}`} /></View>
        <View><Muted>Deploys By Month</Muted><MonthBars months={s.months} kind="deploys" testID={`bars-deploys-${s.user.id}`} /></View>
      </Row>
    </Card>
  );

  return (
    <Screen
      title="Manage"
      subtitle={role === 'trainer' ? 'Handlers you train — the same table supervisors see. Sort the handlers list by clicking any of the column headers.' : 'Handlers and supervisors you manage. Sort the handlers list by clicking any of the column headers.'}
      testID="screen-manage"
      actions={<Button title="+ Member" iconRight="chevron-down" variant="accent" onPress={() => setMemberMenu(true)} testID="btn-add-member" />}
    >
      {role === 'supervisor' ? (
        <Card style={{ marginBottom: space.md }} testID="card-managed-supervisors">
          <Section title="Managed Supervisors" description="Managing another supervisor grants you access to every handler or supervisor they themselves supervise.">
            {supervisorIds.length === 0 ? <Muted testID="managed-supervisors-empty">No managed supervisors. Use + Member → Add Supervisor … to manage one.</Muted> : (
              <View style={[styles.table, { borderColor: c.border }]}>
                {desktop ? (
                  <View style={[styles.tr, styles.th, { borderBottomColor: c.border, backgroundColor: c.surfaceAlt }]}>
                    <View style={[styles.td, { flex: 2 }]}><Text variant="label" color="muted">Name</Text></View>
                    <View style={[styles.td, { width: 110 }]}><Text variant="label" color="muted" align="right">Handlers</Text></View>
                    <View style={[styles.td, { width: 120 }]}><Text variant="label" color="muted" align="right">Supervisors</Text></View>
                    <View style={[styles.td, { width: 60 }]} />
                  </View>
                ) : null}
                {supervisorIds.map((id, i) => {
                  const u = byId.get(id);
                  if (!u) return null;
                  const h = directMembers(repo, id, 'supervisor').filter((m) => byId.get(m)?.roles.includes('handler')).length;
                  const sCount = managedSupervisorIds(repo, id).length;
                  return (
                    <View key={id} style={[styles.tr, { borderBottomColor: c.border, borderBottomWidth: i === supervisorIds.length - 1 ? 0 : 1 }]} testID={`supervisor-row-${id}`}>
                      <View style={[styles.td, { flex: 2 }]}>
                        <Text variant="bodyStrong">{u.name}</Text>
                        <Muted>{(u.agency_id ? repo.getSync('agency', u.agency_id)?.name : null) || u.department}</Muted>
                        {!desktop ? <Muted>{plural(h, 'handler')} · {plural(sCount, 'supervisor')}</Muted> : null}
                      </View>
                      {desktop ? <View style={[styles.td, { width: 110 }]}><Text align="right">{h}</Text></View> : null}
                      {desktop ? <View style={[styles.td, { width: 120 }]}><Text align="right">{sCount}</Text></View> : null}
                      <View style={[styles.td, { width: 60 }]}><Button title="⋯" variant="ghost" accessibilityLabel={`Actions for ${u.name}`} testID={`btn-supervisor-menu-${id}`} onPress={() => setSupMenu(u)} /></View>
                    </View>
                  );
                })}
              </View>
            )}
          </Section>
        </Card>
      ) : null}

      <Card testID="card-handlers">
        <Section
          title="Handlers"
          description={`Inactive = no active subscription (${inactiveCount} ${listFilter === 'inactive' || (listFilter === 'all' && showInactive) ? 'shown' : 'hidden'}). A Late Record is ${LATE_RULE_TEXT} — the same rule the review queue counts and the past-due notification uses. Month bars turn green at ${TRAINING_HOURS_GREEN} training hours or more.`}
        >
          <Row wrap gap={space.sm} justify="space-between" style={{ marginBottom: space.sm }}>
            <Button
              title={`${listFilter === 'all' ? 'All' : listFilter === 'active' ? 'Active' : 'Inactive'} (${visible.length}${visible.length !== stats.length ? ` of ${stats.length}` : ''})`}
              iconRight="chevron-down"
              variant="secondary"
              accessibilityLabel="Filter handlers by subscription"
              onPress={() => setListFilterMenu(true)}
              testID="text-handler-count"
            />
            <Checkbox label="Show Inactive" value={listFilter === 'inactive' ? true : listFilter === 'active' ? false : showInactive} disabled={listFilter !== 'all'} onChange={setShowInactive} testID="check-show-inactive" style={{ paddingVertical: 0, minHeight: 40 }} />
          </Row>
          {visible.length === 0 ? <Muted testID="handlers-empty">{!stats.length ? 'No handlers yet. Use + Member to add one.' : listFilter === 'inactive' ? 'No inactive handlers — every handler has an active subscription.' : listFilter === 'active' ? 'No handler has an active subscription right now.' : 'Every handler is inactive — tick Show Inactive to list them.'}</Muted> : !desktop ? (
            <View testID="handlers-cards">{visible.map(handlerCard)}</View>
          ) : (
            <View style={[styles.table, { borderColor: c.border }]} testID="table-handlers">
              <View style={[styles.tr, styles.th, { borderBottomColor: c.border, backgroundColor: c.surfaceAlt }]}>
                <SortHeader k="name" title="Name" flex={2} />
                <View style={[styles.td, { width: 300 }]}>
                  <Text variant="label" color="muted">Last 3 Months</Text>
                  <Row gap={0} style={{ marginTop: 2 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Sort by Late Records" testID="sort-late" onPress={() => toggleSort('late')} style={{ width: 100 }}><Text variant="label" color="muted">Late Records{sort === 'late' ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}</Text></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Sort by Training Hours" testID="sort-hours" onPress={() => toggleSort('hours')} style={{ width: 100 }}><Text variant="label" color="muted">Training Hours{sort === 'hours' ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}</Text></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Sort by Total Deploys" testID="sort-deploys" onPress={() => toggleSort('deploys')} style={{ width: 100 }}><Text variant="label" color="muted">Total Deploys{sort === 'deploys' ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}</Text></Pressable>
                  </Row>
                </View>
                <View style={[styles.td, { width: 150 }]}><Text variant="label" color="muted">Training By Month</Text></View>
                <View style={[styles.td, { width: 150 }]}><Text variant="label" color="muted">Deployments By Month</Text></View>
                <SortHeader k="last" title="Last record" width={120} />
                <View style={[styles.td, { width: 56 }]} />
              </View>
              {visible.map((s, i) => (
                <View key={s.user.id} style={[styles.tr, { borderBottomColor: c.border, borderBottomWidth: i === visible.length - 1 ? 0 : 1 }]} testID={`handler-row-${s.user.id}`}>
                  <View style={[styles.td, { flex: 2 }]}>
                    <Pressable accessibilityRole="link" accessibilityLabel={`Open ${s.user.name}'s records`} testID={`link-handler-${s.user.id}`} onPress={() => router.push(`/records?handler=${s.user.id}` as never)}>
                      <Text variant="bodyStrong" style={{ color: c.primary }}>{s.user.name}</Text>
                    </Pressable>
                    <Muted>{s.agencyName} · {s.dogs} dog{s.dogs === 1 ? '' : 's'}{!memberIds.includes(s.user.id) ? ' · via managed supervisor' : ''}</Muted>
                    <Row wrap gap={4} style={{ marginTop: 2 }}>
                      {s.noTraining30d ? <Badge tone="accent" testID={`badge-no-training-${s.user.id}`}>NO TRAINING IN 30 DAYS</Badge> : null}
                      {s.inactive ? <Badge tone="muted" testID={`badge-inactive-${s.user.id}`}>INACTIVE</Badge> : null}
                    </Row>
                  </View>
                  <View style={[styles.td, { width: 300 }]}>
                    <Row gap={0}>
                      <Text style={{ width: 100, color: s.late3m ? c.danger : c.text }} testID={`text-late-${s.user.id}`}>{s.late3m}</Text>
                      <Pressable accessibilityRole="link" testID={`link-hours-${s.user.id}`} onPress={() => router.push(`/records?handler=${s.user.id}&type=Training` as never)} style={{ width: 100 }}><Text style={{ color: c.info }} testID={`text-hours-${s.user.id}`}>{hoursLabel(s.hours3m)}</Text></Pressable>
                      <Pressable accessibilityRole="link" testID={`link-deploys-${s.user.id}`} onPress={() => router.push(`/records?handler=${s.user.id}&type=Deployment` as never)} style={{ width: 100 }}><Text style={{ color: c.info }} testID={`text-deploys-${s.user.id}`}>{s.deploys3m}</Text></Pressable>
                    </Row>
                    <Muted>This month: {hoursLabel(s.hoursThisMonth)} h{s.hoursThisMonth >= TRAINING_HOURS_GREEN ? ' ✓ ≥16' : ''} · {s.deploysThisMonth} deploy{s.deploysThisMonth === 1 ? '' : 's'}</Muted>
                  </View>
                  <View style={[styles.td, { width: 150 }]}><MonthBars months={s.months} kind="hours" testID={`bars-hours-${s.user.id}`} /></View>
                  <View style={[styles.td, { width: 150 }]}><MonthBars months={s.months} kind="deploys" testID={`bars-deploys-${s.user.id}`} /></View>
                  <View style={[styles.td, { width: 120 }]}><Text>{s.lastRecordAt ? fmtDate(s.lastRecordAt) : '—'}</Text></View>
                  <View style={[styles.td, { width: 56, paddingHorizontal: 4 }]}><Button title="⋯" variant="ghost" accessibilityLabel={`Actions for ${s.user.name}`} testID={`btn-handler-menu-${s.user.id}`} onPress={() => setRowMenu(s)} /></View>
                </View>
              ))}
            </View>
          )}
        </Section>
      </Card>

      <MenuSheet visible={listFilterMenu} onClose={() => setListFilterMenu(false)} title="Show handlers" testID="sheet-handler-filter" items={[
        { key: 'all', label: `All (${stats.length})`, caption: 'Every handler you manage — Show Inactive decides whether the ones without a subscription are listed', icon: 'people-outline', testID: 'filter-handlers-all', onPress: () => setListFilter('all') },
        { key: 'active', label: `Active (${stats.filter((s) => !s.inactive).length})`, caption: 'Handlers with an active subscription', icon: 'checkmark-circle-outline', testID: 'filter-handlers-active', onPress: () => setListFilter('active') },
        { key: 'inactive', label: `Inactive (${inactiveCount})`, caption: 'Handlers whose subscription has expired', icon: 'pause-circle-outline', testID: 'filter-handlers-inactive', onPress: () => setListFilter('inactive') },
      ]} />
      <MenuSheet visible={memberMenu} onClose={() => setMemberMenu(false)} title="+ Member" testID="sheet-member-menu" items={memberMenuItems} />
      <MenuSheet visible={!!rowMenu} onClose={() => setRowMenu(null)} title={rowMenu?.user.name || ''} testID="sheet-handler-menu" items={rowMenu ? rowMenuItems(rowMenu) : []} />
      <MenuSheet visible={!!supMenu} onClose={() => setSupMenu(null)} title={supMenu?.name || ''} testID="sheet-supervisor-menu" items={supMenu ? [
        { key: 'manage', label: 'Their handlers', caption: 'Listed in the Handlers table (via managed supervisor)', icon: 'people-outline', testID: 'menu-supervisor-handlers', onPress: () => {} },
        { key: 'remove', label: 'Remove Supervisor', caption: 'Their handlers leave your table; nothing is deleted', icon: 'person-remove-outline', danger: true, testID: 'menu-supervisor-remove', onPress: () => openRemove(supMenu) },
      ] : []} />

      <Sheet visible={!!addKind} onClose={closeAdd} title={addKind === 'handler' ? 'Add Handler' : addKind === 'supervisor' ? 'Add Supervisor' : addKind === 'invite_supervisor' ? 'Invite Supervisor' : addKind === 'invite_trainer' ? 'Invite Trainer' : 'Signup New Member'} testID="sheet-add-member" footer={(
        <Row justify="flex-end">
          <Button title="Cancel" variant="secondary" onPress={closeAdd} testID="btn-cancel-add-member" />
          <Button title={addKind === 'signup' ? 'Create account' : addKind?.startsWith('invite') ? 'Send invitation' : 'Add'} onPress={() => void submitAdd()} loading={busy} testID="btn-confirm-add-member" />
        </Row>
      )}>
        {addKind === 'handler' || addKind === 'supervisor' ? (
          <>
            <Muted style={{ marginBottom: space.sm }}>{addKind === 'handler' ? `Adds an existing handler to your ${type === 'trainer' ? 'trainer' : 'management'} group. Local mode: pick by email; with an account server they get an email with a custom sign-up link.` : 'Managing another supervisor grants access to every handler or supervisor they themselves supervise.'}</Muted>
            <Select label={addKind === 'handler' ? 'Handler (by email)' : 'Supervisor (by email)'} required options={(addKind === 'handler' ? candidateHandlers : candidateSupervisors).map(opt)} value={pick} onChange={(v) => { setPick(v); setFormError(null); }} error={formError} allowCustom={false} placeholder="Choose an account" testID="select-add-member" />
          </>
        ) : addKind === 'signup' ? (
          <>
            <Muted style={{ marginBottom: space.sm }}>Creates the handler's account and adds it to your group. New handlers get a 30-day free trial. The password is optional — without one the onboarding email carries a set-your-own-password link (local mode: password “demo”).</Muted>
            <TextField label="First name" required value={signup.first_name} error={signupErrors.first_name} onChangeText={(v) => { setSignup({ ...signup, first_name: v }); setSignupErrors((e) => ({ ...e, first_name: undefined })); }} testID="input-signup-first" autoFocus />
            <TextField label="Last name" required value={signup.last_name} error={signupErrors.last_name} onChangeText={(v) => { setSignup({ ...signup, last_name: v }); setSignupErrors((e) => ({ ...e, last_name: undefined })); }} testID="input-signup-last" />
            <TextField label="Email" required value={signup.email} error={signupErrors.email} onChangeText={(v) => { setSignup({ ...signup, email: v }); setSignupErrors((e) => ({ ...e, email: undefined })); }} autoCapitalize="none" keyboardType="email-address" testID="input-signup-email" />
            <TextField label="Department" value={signup.department} onChangeText={(v) => setSignup({ ...signup, department: v })} placeholder={user.department} testID="input-signup-department" />
            <TextField label="Password (optional)" value={signup.password} onChangeText={(v) => setSignup({ ...signup, password: v })} secureTextEntry testID="input-signup-password" />
          </>
        ) : (
          <>
            <Muted style={{ marginBottom: space.sm }}>{addKind === 'invite_trainer' ? 'A handler who accepts grants the trainer permission to view their records and create new ones.' : 'A Management Request is sent; the supervisor accepts from their Groups page.'} Local mode: the account must already exist.</Muted>
            <TextField label="Email" required value={email} onChangeText={(v) => { setEmail(v); setFormError(null); }} error={formError} autoCapitalize="none" keyboardType="email-address" placeholder="name@agency.gov" testID="input-invite-email" autoFocus />
          </>
        )}
      </Sheet>

      <ConfirmDialog
        visible={!!removing}
        title={removing?.user.roles.includes('supervisor') && !removing.user.roles.includes('handler') ? 'Remove this supervisor?' : 'Remove this handler?'}
        body={removing ? `Are you sure you want to remove ${removing.user.name}? They keep everything: ${plural(removing.counts.records, 'record')} (${plural(removing.counts.completions, 'training record')} · ${plural(removing.counts.deployments, 'deployment')} · ${plural(removing.counts.classes, 'class', 'classes')} · ${plural(removing.counts.vet, 'vet visit')}) and ${plural(removing.counts.history, 'History row')} stay untouched — you simply lose access.` : ''}
        confirmTitle="Remove"
        onConfirm={() => void doRemove()}
        onCancel={() => setRemoving(null)}
        testID="dialog-remove-handler"
      />
      <Sheet visible={!!transferring} onClose={() => setTransferring(null)} title="Transfer handler" testID="sheet-transfer" footer={(
        <Row justify="flex-end">
          <Button title="Cancel" variant="secondary" onPress={() => setTransferring(null)} testID="btn-cancel-transfer" />
          <Button title="Transfer" icon="swap-horizontal-outline" onPress={() => void doTransfer()} loading={busy} testID="btn-confirm-transfer" />
        </Row>
      )}>
        {transferring ? <Muted style={{ marginBottom: space.sm }}>{transferring.user.name} moves from your management group to the other supervisor's. Their {plural(transferring.counts.records, 'record')} and {plural(transferring.counts.history, 'History row')} stay exactly as they are — records belong to the handler, not the agency.</Muted> : null}
        <Select label="Transfer to supervisor" required options={otherSupervisors.map(opt)} value={transferTo} onChange={(v) => { setTransferTo(v); setTransferError(null); }} error={transferError} allowCustom={false} placeholder="Choose a supervisor" testID="select-transfer-to" />
      </Sheet>
      <Muted style={{ marginTop: space.md }}>{ROLE_LABEL[role || 'supervisor']} view · you cannot remove yourself.</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  menuItem: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: space.sm, borderRadius: radius.sm },
  table: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  th: { borderBottomWidth: 1 },
  td: { paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 32 },
  barCol: { width: 8, alignItems: 'center', justifyContent: 'flex-end', height: 32 },
  bar: { width: 8, borderRadius: 2 },
});
