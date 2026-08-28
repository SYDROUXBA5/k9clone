// RECORDS hub — the home screen after sign-in for every role.
// TO DO card · (supervisor banners) · calendar (3 months desktop / 1 month phone) · FILTER + chips +
// saved searches · month-grouped virtualised list · row ⋯ menu (View · Edit · View Report · Delete).
// Everything reads from the Repository; every write goes through it (History rows appear).
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, View, type SectionListRenderItemInfo } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { SavedSearch } from '@/db/types';
import { useAuth, useVisibleUserIds } from '@/features/auth/AuthProvider';
import { RoleGuard } from '@/features/nav/RoleGuard';
import { ADD_MENU } from '@/features/nav/navConfig';
import { Button, ConfirmDialog, EmptyState, H1, Muted, Sheet, Text, radius, space, useScrollBottomClearance, useColors, useIsDesktop, useToast } from '@/ui';
import { FilterSheet, SaveSearchSheet, slug } from './FilterSheet';
import { deletePlanBody, planTrainingDelete } from './deletePlan';
import { HubCalendar, buildMarkers, type MonthCursor } from './HubCalendar';
import { fmtDayKey } from './format';
import {
  ALL_PATROL_TYPES, EMPTY_CRITERIA, activeCriteriaKeys, applyCriteria, buildHubRecords, clearCriterion, groupByMonth, normalizeCriteria,
  type Criteria, type HubRecord, type HubSection,
} from './model';
import { RecordCard, type MenuTarget } from './RecordCard';
import { SupervisorBanners } from './SupervisorBanners';
import { getSupervisorAlerts } from './supervisor';
import { TodoCard } from './TodoCard';
import { dueVaccinations, getTodoItems, todoTotal, type TodoItem } from './todo';

/**
 * Deep-link filter: `/records?q=<text>&type=<Training|Deployment|Class|Vet Visit>`.
 * Custom Entries' VIEW button lands here, so the hub it opens must already be narrowed to the
 * records that use the value — landing on the unfiltered list would make VIEW a dead link.
 */
function criteriaFromLink(q: string, type: string): Criteria {
  const wanted = (['Training', 'Deployment', 'Class', 'Vet Visit'] as const).find((t) => t.toLowerCase() === type.trim().toLowerCase());
  if (!q.trim() && !wanted) return EMPTY_CRITERIA;
  return { ...EMPTY_CRITERIA, q: q.trim(), recordType: wanted || 'All' };
}
const firstParam = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] || '' : v || '');

export function RecordsScreen() {
  return (
    <RoleGuard allow={['handler', 'trainer', 'supervisor']} title="Records">
      <RecordsHub />
    </RoleGuard>
  );
}

function RecordsHub() {
  const { user, role } = useAuth();
  const visible = useVisibleUserIds();
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const desktop = useIsDesktop();
  const c = useColors();
  const bottomClearance = useScrollBottomClearance();
  const userId = user?.id || '';
  const isSupervisor = role === 'supervisor';
  const isTrainer = role === 'trainer';
  const showHandler = isSupervisor || isTrainer;

  // ----- data (live snapshots) -----
  const users = useList('user');
  const dogs = useList('dog');
  const events = useList('training_event');
  const exercises = useList('exercise');
  const completions = useList('completion');
  const deployments = useList('deployment');
  const classes = useList('class_record');
  const vets = useList('vet_visit');
  const vaccinations = useList('vaccination');
  const tracks = useList('track');
  const trainerComments = useList('trainer_comment');
  const savedAll = useList('saved_search');
  const savedSearches = useMemo(() => savedAll.filter((s) => s.owner_user_id === userId).sort((a, b) => a.name.localeCompare(b.name)), [savedAll, userId]);
  const [now] = useState(() => Date.now());
  // First paint shows a loading state; the (possibly 1,000-row) hub model is built on the next tick.
  const [booted, setBooted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setBooted(true), 0); return () => clearTimeout(t); }, []);

  const visibleDogs = useMemo(() => dogs.filter((d) => visible.includes(d.owner_user_id)), [dogs, visible]);
  const dueVax = useMemo(() => dueVaccinations(vaccinations, visibleDogs, now), [vaccinations, visibleDogs, now]);
  const vaccineDueVisitIds = useMemo(() => new Set(dueVax.map((v) => v.vaccination.vet_visit_id).filter((x): x is string => !!x)), [dueVax]);

  const records = useMemo(() => (booted ? buildHubRecords({
    userId, role: role || 'handler', visibleIds: visible, now, users, dogs, events, exercises, completions, deployments, classes, vets, vaccineDueVisitIds, trainerComments,
  }) : []), [booted, userId, role, visible, now, users, dogs, events, exercises, completions, deployments, classes, vets, vaccineDueVisitIds, trainerComments]);

  // ----- filter state -----
  // Seeded from the URL so `/records?q=…` (Custom Entries → VIEW) opens already filtered.
  const params = useLocalSearchParams<{ q?: string | string[]; type?: string | string[] }>();
  const linkQ = firstParam(params.q);
  const linkType = firstParam(params.type);
  const [criteria, setCriteria] = useState<Criteria>(() => criteriaFromLink(linkQ, linkType));
  // A second VIEW while the hub is already mounted changes the URL but not the component, so re-seed
  // whenever the link itself changes (and never afterwards, so hand-edited filters survive a re-render).
  const seededLink = useRef(`${linkQ}\u0000${linkType}`);
  useEffect(() => {
    const key = `${linkQ}\u0000${linkType}`;
    if (seededLink.current === key) return;
    seededLink.current = key;
    setCriteria(criteriaFromLink(linkQ, linkType));
  }, [linkQ, linkType]);
  const deferred = useDeferredValue(criteria);
  const stale = deferred !== criteria;
  const activeKeys = activeCriteriaKeys(deferred);
  const filtered = useMemo(() => applyCriteria(records, deferred, now), [records, deferred, now]);
  const sections = useMemo<HubSection[]>(() => groupByMonth(filtered, now), [filtered, now]);
  const markers = useMemo(() => buildMarkers(records, activeKeys.length ? filtered : null), [records, filtered, activeKeys.length]);
  // "records" in the count line = hub records (an event with its exercises counts once), as the reference counts.
  const totalRows = records.length;
  const shownRows = filtered.length;

  // ----- TO DO / supervisor alerts -----
  const todoItems = useMemo(() => getTodoItems({ role, userId, visibleIds: visible, records, vaccinations, dogs, now }), [role, userId, visible, records, vaccinations, dogs, now]);
  const todoCount = todoTotal(todoItems);
  const managedIds = useMemo(() => visible.filter((id) => id !== userId), [visible, userId]);
  const alerts = useMemo(() => (isSupervisor ? getSupervisorAlerts({ managedIds, users, completions, deployments, classes, tracks, now }) : null), [isSupervisor, managedIds, users, completions, deployments, classes, tracks, now]);

  // ----- UI state -----
  const [cursor, setCursor] = useState<MonthCursor>(() => { const d = new Date(now); return { year: d.getFullYear(), month: d.getMonth() + 1 }; });
  const [filterOpen, setFilterOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveDraft, setSaveDraft] = useState<Criteria | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [deleting, setDeleting] = useState<MenuTarget | null>(null);
  const [undecidedFor, setUndecidedFor] = useState<HubRecord | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  // Phone records bar (PT-REC-19): the TO DO button scrolls the hub back to the TO DO card and rings it.
  const listRef = useRef<SectionList<HubRecord, HubSection>>(null);
  const [todoPulse, setTodoPulse] = useState(false);
  useEffect(() => { if (!todoPulse) return; const t = setTimeout(() => setTodoPulse(false), 1800); return () => clearTimeout(t); }, [todoPulse]);
  const jumpToTodo = useCallback(() => {
    setTodoPulse(true);
    const sr = listRef.current?.getScrollResponder?.();
    (sr as { scrollTo?: (o: { y: number; animated: boolean }) => void } | undefined)?.scrollTo?.({ y: 0, animated: true });
  }, []);

  const go = useCallback((href: string) => router.push(href as never), [router]);
  const patch = useCallback((p: Partial<Criteria>) => setCriteria((prev) => ({ ...prev, ...p })), []);
  const clearAll = useCallback(() => setCriteria(EMPTY_CRITERIA), []);
  const toggleSelect = useCallback((id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);

  const applyTodo = (item: TodoItem) => {
    if (item.href && (item.count === 0 || !item.criteria)) { go(item.href); return; }
    if (criteria.todo === item.criteria?.todo) { patch({ todo: '', recordType: 'All' }); return; }
    setCriteria({ ...EMPTY_CRITERIA, ...(item.criteria || {}) });
  };
  const applySaved = (s: SavedSearch) => { setCriteria(normalizeCriteria(s.criteria)); toast.show(`Saved search “${s.name}” applied`, 'info'); };
  const deleteSaved = async (s: SavedSearch) => { await repo.remove('saved_search', s.id, { label: `Saved search: ${s.name}` }); toast.show(`Saved search “${s.name}” deleted`); };
  const saveSearch = async (name: string) => {
    const crit = saveDraft || criteria;
    try {
      await repo.upsert('saved_search', { name, criteria: crit as unknown as Record<string, unknown>, owner_user_id: userId }, { label: `Saved search: ${name}` });
      setSaveOpen(false); setSaveDraft(null);
      setCriteria(crit);
      toast.show(`Search “${name}” saved`);
    } catch (err) {
      toast.show(`Save failed — ${err instanceof Error ? err.message : 'try again'}`, 'error');
    }
  };

  const answerInvite = async (rec: HubRecord, response: 'attend' | 'decline') => {
    setUndecidedFor(null);
    const ev = repo.getSync('training_event', rec.id);
    if (!ev) return;
    const invitees = ev.invitees.map((i) => (i.user_id === userId ? { ...i, response } : i));
    try {
      await repo.upsert('training_event', { id: ev.id, invitees }, { label: ev.name });
      toast.show(response === 'attend' ? `You are attending ${ev.name}` : `Declined ${ev.name}`);
    } catch (err) {
      toast.show(`Could not save your answer — ${err instanceof Error ? err.message : 'try again'}`, 'error');
    }
  };

  // A training delete is planned first (PT-REC-17): a shared exercise is never destroyed under another
  // handler — deleting your row removes YOUR completions and hides the row from YOUR records only.
  const planFor = useCallback((t: MenuTarget) => {
    const { record, row } = t;
    if (record.kind !== 'training') return null;
    const ev = repo.getSync('training_event', record.id);
    if (!ev) return null;
    return planTrainingDelete({
      userId,
      event: ev,
      exercises: repo.snapshot('exercise').filter((e) => e.event_id === ev.id),
      completions: repo.snapshot('completion').filter((c) => c.event_id === ev.id),
      users,
      exerciseId: row && row.entity === 'exercise' ? row.entityId : null,
    });
  }, [repo, userId, users]);
  const deletingPlan = useMemo(() => (deleting ? planFor(deleting) : null), [deleting, planFor]);

  const hideFor = async <E extends 'exercise' | 'training_event'>(entity: E, id: string, label: string) => {
    const cur = repo.getSync(entity, id);
    if (!cur) return;
    const removed = [...new Set([...(cur.removed_for || []), userId])];
    await repo.upsert(entity, { id, removed_for: removed } as never, { label: `${label} — removed from your Records` });
  };

  const performDelete = async (t: MenuTarget) => {
    setDeleting(null);
    setBusy(true);
    try {
      const { record, row } = t;
      const plan = record.kind === 'training' ? planFor(t) : null;
      if (plan) {
        const what = row && row.entity === 'exercise' ? row.title : record.title;
        for (const cid of plan.completionIds) await repo.remove('completion', cid, { label: `${what} — completion` });
        for (const exId of plan.exerciseIds) await repo.remove('exercise', exId, { label: repo.getSync('exercise', exId)?.name || what });
        for (const exId of plan.hideExerciseIds) await hideFor('exercise', exId, repo.getSync('exercise', exId)?.name || what);
        if (plan.eventId) await repo.remove('training_event', plan.eventId, { label: record.title });
        if (plan.hideEventId) await hideFor('training_event', plan.hideEventId, record.title);
        toast.show(
          plan.destroys
            ? `${row ? `Exercise “${row.title}”` : `Training record “${record.title}”`} deleted — logged to History`
            : `Removed from your records — ${plan.otherHandlers.length ? `${plan.otherHandlers.join(', ')} keep${plan.otherHandlers.length === 1 ? 's' : ''} their rows` : 'the shared record stays for the group'}`,
        );
      } else if (row && row.entity !== 'training_event') {
        await repo.remove(row.entity, row.entityId, { label: row.title });
        toast.show(`${labelOf(record)} deleted — logged to History`);
      } else {
        await repo.remove(record.entity, record.id, { label: labelOf(record) });
        toast.show(`${labelOf(record)} deleted — logged to History`);
      }
    } catch (err) {
      toast.show(`Delete failed — ${err instanceof Error ? err.message : 'nothing was removed'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  // ----- chips -----
  const dogName = (id: string) => dogs.find((d) => d.id === id)?.name || 'Dog';
  const userName = (id: string) => users.find((u) => u.id === id)?.name || 'Handler';
  const chipLabel = (k: keyof Criteria): string => {
    switch (k) {
      case 'recordType': return deferred.recordType;
      case 'workMode': return deferred.workMode;
      case 'patrolType': return deferred.patrolType;
      case 'dog': return dogName(deferred.dog);
      case 'handler': return userName(deferred.handler);
      case 'handlers': return `Late: ${deferred.handlers.map(userName).join(', ')}`;
      case 'dateRange': return deferred.dateRange === 'Custom...' ? `${deferred.from || '…'} → ${deferred.to || '…'}` : deferred.dateRange;
      case 'q': return `“${deferred.q.trim()}”`;
      case 'day': return fmtDayKey(deferred.day!);
      case 'todo': return deferred.todo === 'vaccinations' ? 'Vaccinations due' : `${deferred.todo[0].toUpperCase()}${deferred.todo.slice(1)}`;
      case 'review': return deferred.review === 'reviewed' ? 'Reviewed' : 'Not Reviewed';
      case 'completion': return deferred.completion === 'complete' ? 'Complete' : 'Not Complete';
      case 'deploymentTag': return `Tag: ${deferred.deploymentTag}`;
      case 'requestingUnit': return `Agency: ${deferred.requestingUnit}`;
      case 'odorType': return `Odor: ${deferred.odorType}`;
      case 'arrests': return 'Arrests';
      case 'comment': return `Comment: “${deferred.comment.trim()}”`;
      case 'trainerComments': return deferred.trainerComments === 'any' ? 'Trainer Comments' : `Trainer Comments: “${deferred.trainerComments.trim()}”`;
      default: return String(k);
    }
  };

  const filterHandlers = useMemo(() => users.filter((u) => managedIds.includes(u.id)), [users, managedIds]);
  const hasAny = records.length > 0;

  // ----- header (everything above the list scrolls with it) -----
  const header = (
    <View>
      <View style={styles.titleRow}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Ionicons name="clipboard-outline" size={28} color={c.primary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            {desktop ? <H1 accessibilityRole="header">Records</H1> : null}
            <Muted>{isSupervisor ? 'Records of the handlers you manage.' : isTrainer ? 'Group events you lead or are invited to.' : 'Training, deployments, classes and vet visits.'}</Muted>
          </View>
        </View>
        {desktop ? (
          <View style={styles.actions}>
            <Button title="Report" variant="secondary" icon="document-text-outline" onPress={() => go('/reports')} testID="btn-report" />
            {!isSupervisor ? <Button title="Add Record" variant="accent" icon="add" iconRight="chevron-down" onPress={() => setAddOpen(true)} testID="btn-add-record" /> : null}
          </View>
        ) : null}
      </View>

      <View
        testID="anchor-todo"
        style={todoPulse ? { borderRadius: radius.md + 2, borderWidth: 2, borderColor: c.accent } : null}
      >
        <TodoCard items={todoItems} total={todoCount} onPick={applyTodo} active={criteria.todo || null} />
      </View>
      {alerts ? (
        <SupervisorBanners
          alerts={alerts}
          activeKey={criteria.handlers.length ? 'late' : criteria.review === 'not_reviewed' ? 'not_reviewed' : null}
          onLate={() => (criteria.handlers.length ? patch({ handlers: [] }) : alerts.lateHandlers.length ? setCriteria({ ...EMPTY_CRITERIA, handlers: alerts.lateHandlers.map((h) => h.id), recordType: 'Training' }) : toast.show(`Every handler has a training record in the last ${alerts.lateDays} days`, 'info'))}
          onNotReviewed={() => (criteria.review === 'not_reviewed' ? patch({ review: '' }) : setCriteria({ ...EMPTY_CRITERIA, review: 'not_reviewed' }))}
          onLiveTracks={() => go('/tracking')}
        />
      ) : null}
      <HubCalendar cursor={cursor} onCursor={setCursor} markers={markers} selected={criteria.day} onSelect={(day) => patch({ day })} />

      {/* FILTER · chips · CLEAR · SAVE */}
      <View style={styles.filterRow} testID="filter-bar">
        <Button title="FILTER" variant="secondary" icon="options-outline" onPress={() => setFilterOpen(true)} testID="btn-filter" />
        <View style={styles.chips} testID="filter-chips">
          {activeKeys.map((k) => (
            <View key={k} testID={`chip-${k}`} style={[styles.chip, { backgroundColor: c.primarySoft, borderColor: c.primarySoft }]}>
              <Text style={{ color: c.primary, fontWeight: '600' }} numberOfLines={1}>{chipLabel(k)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove filter ${chipLabel(k)}`} testID={`chip-remove-${k}`} onPress={() => setCriteria((prev) => clearCriterion(prev, k))} hitSlop={8} style={styles.chipX}>
                <Ionicons name="close-circle" size={20} color={c.primary} />
              </Pressable>
            </View>
          ))}
        </View>
        {activeKeys.length ? (
          <>
            <Button title="CLEAR" variant="ghost" icon="close" onPress={clearAll} testID="btn-clear-filters" />
            <Button title="SAVE" variant="secondary" icon="bookmark-outline" onPress={() => { setSaveDraft(criteria); setSaveOpen(true); }} testID="btn-save-search" />
          </>
        ) : null}
      </View>

      <View style={styles.countRow}>
        <Text testID="text-record-count" style={{ flex: 1 }}>
          {activeKeys.length ? `Showing ${shownRows} out of ${totalRows} records` : `Showing ${totalRows} total records`}
          {stale ? <Muted>  · Updating…</Muted> : null}
        </Text>
        {selected.size ? (
          <>
            <Button title={`Report for ${selected.size} selected`} variant="accent" icon="document-text-outline" onPress={() => go(`/reports?ids=${[...selected].join(',')}`)} testID="btn-report-selected" />
            <Button title="Clear" variant="ghost" onPress={() => setSelected(new Set())} testID="btn-clear-selected" />
          </>
        ) : null}
      </View>
      {desktop && filtered.length ? (
        <View style={[styles.colHead, { borderColor: c.border }]} testID="list-columns">
          <View style={{ width: 44 }} />
          <Text variant="label" color="muted" style={{ flex: 2 }}>Record</Text>
          <Text variant="label" color="muted" style={{ flex: 1 }}>Dog</Text>
          {showHandler ? <Text variant="label" color="muted" style={{ flex: 1 }} testID="col-handler">Handler</Text> : null}
          <Text variant="label" color="muted" style={{ flex: 1.2, textAlign: 'right' }}>Status</Text>
          <View style={{ width: 44 }} />
        </View>
      ) : null}
      {!hasAny ? (
        <EmptyState icon="clipboard-outline" title="No records yet" body={isSupervisor ? 'Your managed handlers have not saved any records.' : isTrainer ? 'No group events yet. Create a training record for your group.' : 'Add your first training, deployment, class or vet record.'} action={!isSupervisor ? { title: 'Add Record', onPress: () => setAddOpen(true), testID: 'btn-add-record-empty' } : undefined} testID="empty-records" />
      ) : filtered.length === 0 ? (
        <EmptyState icon="funnel-outline" title="No records match these filters" body="Remove a chip or clear all filters to see every record." action={{ title: 'Clear filters', onPress: clearAll, testID: 'btn-clear-filters-empty' }} testID="empty-records-filtered" />
      ) : null}
    </View>
  );

  const renderItem = useCallback(({ item }: SectionListRenderItemInfo<HubRecord, HubSection>) => (
    <RecordCard record={item} desktop={desktop} showHandler={showHandler} selected={selected} onToggleSelect={toggleSelect} onOpen={go} onMenu={setMenu} onUndecided={!isSupervisor && !isTrainer ? setUndecidedFor : undefined} />
  ), [desktop, showHandler, selected, toggleSelect, go, isSupervisor, isTrainer]);

  if (!booted) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: space.sm }} testID="records-loading" accessibilityLabel="Loading records">
        <ActivityIndicator size="large" color={c.primary} />
        <Muted>Loading records…</Muted>
      </View>
    );
  }

  const menuTitle = menu ? (menu.row ? menu.row.title : menu.record.title) : '';
  const menuCanEdit = menu ? (menu.row ? menu.row.canEdit : menu.record.canEdit) : false;
  const menuCanDelete = menu ? (menu.row ? menu.row.canDelete : menu.record.canDelete) : false;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="screen-records">
      {/* Phone Records bar — continues the app top bar: TO DO (count) · FILTER (count) · Report (PT-REC-19). */}
      {!desktop ? (
        <View style={[styles.phoneBar, { backgroundColor: c.navBg }]} testID="records-phone-bar">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`TO DO — ${todoCount} item${todoCount === 1 ? '' : 's'}`}
            testID="btn-todo-phone"
            onPress={jumpToTodo}
            style={({ pressed }) => [styles.phoneBtn, { backgroundColor: pressed ? 'rgba(255,255,255,0.14)' : 'transparent' }]}
          >
            <Ionicons name="clipboard-outline" size={24} color={c.navText} />
            <Text variant="label" style={{ color: c.navText }}>TO DO</Text>
            {todoCount ? (
              <View style={[styles.phoneBadge, { backgroundColor: c.accentSolid }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }} testID="text-todo-phone-count">{todoCount > 99 ? '99+' : todoCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={activeKeys.length ? `Filter records — ${activeKeys.length} filter${activeKeys.length === 1 ? '' : 's'} set` : 'Filter records'}
            accessibilityState={{ selected: activeKeys.length > 0 }}
            testID="btn-filter-phone"
            onPress={() => setFilterOpen(true)}
            style={({ pressed }) => [styles.phoneBtn, { backgroundColor: pressed ? 'rgba(255,255,255,0.14)' : 'transparent' }]}
          >
            <Ionicons name="options-outline" size={24} color={c.navText} />
            <Text variant="label" style={{ color: c.navText }}>FILTER</Text>
            {activeKeys.length ? (
              <View style={[styles.phoneBadge, { backgroundColor: c.accentSolid }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }} testID="text-filter-phone-count">{activeKeys.length}</Text>
              </View>
            ) : null}
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create report"
            testID="btn-report-phone"
            onPress={() => go('/reports')}
            style={({ pressed }) => [styles.phoneBtn, { backgroundColor: pressed ? 'rgba(255,255,255,0.14)' : 'transparent' }]}
          >
            <Ionicons name="document-text-outline" size={24} color={c.navText} />
            <Text variant="label" style={{ color: c.navText }}>REPORT</Text>
          </Pressable>
        </View>
      ) : null}
      <SectionList<HubRecord, HubSection>
        ref={listRef}
        sections={sections}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHead, { backgroundColor: c.bg }]} testID={`section-${section.key}`}>
            <Text variant="label" color="muted" style={{ letterSpacing: 0.8 }}>{section.title}</Text>
            <Muted>{section.data.length}</Muted>
          </View>
        )}
        ListHeaderComponent={header}
        ListFooterComponent={hasAny && filtered.length ? <Muted style={{ textAlign: 'center', paddingVertical: space.lg }} testID="text-list-footer">Showing {shownRows} of {totalRows} records</Muted> : <View style={{ height: space.lg }} />}
        stickySectionHeadersEnabled={false}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews={false}
        contentContainerStyle={{ width: '100%', maxWidth: 1100, alignSelf: 'center', padding: desktop ? space.lg : space.md, paddingBottom: (desktop ? space.lg : space.md) + bottomClearance }}
        keyboardShouldPersistTaps="handled"
        testID="list-records"
      />

      {/* Add Record ▾ */}
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Add Record" testID="sheet-add-record" maxWidth={400}>
        {ADD_MENU.filter((m) => ['training', 'deployment', 'class', 'vet'].includes(m.key)).map((m) => (
          <Pressable key={m.key} accessibilityRole="menuitem" accessibilityLabel={m.label} testID={`add-record-${m.key}`} onPress={() => { setAddOpen(false); go(m.href); }} style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
            <Ionicons name={m.icon} size={22} color={c.primary} style={{ marginRight: space.sm }} />
            <Text style={{ flex: 1 }}>{m.label}</Text>
          </Pressable>
        ))}
      </Sheet>

      {/* Row ⋯ menu */}
      <Sheet visible={!!menu} onClose={() => setMenu(null)} title={menuTitle} testID="sheet-record-menu" maxWidth={400}>
        {menu ? (
          <>
            <MenuItem icon="eye-outline" label="View" testID="menu-view" onPress={() => { const r = menu.row?.routeView || menu.record.routeView; setMenu(null); go(r); }} />
            <MenuItem icon="create-outline" label="Edit" testID="menu-edit" disabled={!menuCanEdit} hint={!menuCanEdit ? (isSupervisor ? 'Supervisors review, they never edit handler records' : 'Only the owner or group leader can edit') : undefined} onPress={() => { const r = menu.row?.routeEdit || menu.record.routeEdit; setMenu(null); go(r); }} />
            <MenuItem icon="document-text-outline" label="View Report" testID="menu-view-report" onPress={() => { const t = menu.row?.reportType || menu.record.reportType; const id = menu.row?.reportId || menu.record.reportId; setMenu(null); go(`/reports/view?type=${t}&id=${id}`); }} />
            {menu.record.kind === 'training' && !menu.row && menu.record.canEdit && menu.record.routeAddExercise ? <MenuItem icon="add-circle-outline" label="Add Exercise" testID="menu-add-exercise" onPress={() => { const r = menu.record.routeAddExercise!; setMenu(null); go(r); }} /> : null}
            <View style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />
            <MenuItem icon="trash-outline" label="Delete" testID="menu-delete" danger disabled={!menuCanDelete} hint={!menuCanDelete ? (isSupervisor ? 'Supervisors never delete handler records' : 'Only the owner or group leader can delete') : undefined} onPress={() => { const t = menu; setMenu(null); setDeleting(t); }} />
          </>
        ) : null}
      </Sheet>
      <ConfirmDialog
        visible={!!deleting}
        title={deleting ? `Delete ${deleting.row ? deleting.row.title : labelOf(deleting.record)}?` : 'Delete?'}
        confirmTitle={deletingPlan && !deletingPlan.destroys ? 'Remove from my records' : 'Delete'}
        body={
          deletingPlan
            ? deletePlanBody(deletingPlan, deleting?.row?.entity === 'exercise' ? 'exercise' : 'record')
            : 'The record is removed from the list. The deletion is logged to History and cannot be undone from here.'
        }
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) void performDelete(deleting); }}
        testID="dialog-delete-record"
      />

      {/* Undecided → Attend / Decline */}
      <Sheet visible={!!undecidedFor} onClose={() => setUndecidedFor(null)} title={undecidedFor?.title || 'Optional event'} testID="sheet-undecided" maxWidth={400}>
        {undecidedFor ? (
          <>
            <Muted style={{ marginBottom: space.sm }}>Attendance is optional for this event. Let the group leader know.</Muted>
            <MenuItem icon="checkmark-circle-outline" label="Attend" testID="menu-attend" onPress={() => void answerInvite(undecidedFor, 'attend')} />
            <MenuItem icon="close-circle-outline" label="Decline" testID="menu-decline" danger onPress={() => void answerInvite(undecidedFor, 'decline')} />
          </>
        ) : null}
      </Sheet>

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={criteria}
        onApply={(next) => setCriteria({ ...next, patrolType: next.patrolType || ALL_PATROL_TYPES })}
        dogs={visibleDogs}
        handlers={filterHandlers}
        showHandler={showHandler}
        savedSearches={savedSearches}
        onApplySaved={applySaved}
        onDeleteSaved={(s) => void deleteSaved(s)}
        onSaveCurrent={(draft) => { setSaveDraft(draft); setFilterOpen(false); setSaveOpen(true); }}
      />
      <SaveSearchSheet visible={saveOpen} onClose={() => { setSaveOpen(false); setSaveDraft(null); }} onSave={(name) => void saveSearch(name)} existingNames={savedSearches.map((s) => s.name)} />
      {busy ? <View style={[styles.busy, { pointerEvents: 'none' }]} testID="records-busy" /> : null}
    </View>
  );
}

function labelOf(r: HubRecord): string {
  return r.kind === 'training' ? `Training record “${r.title}”` : r.kind === 'deployment' ? 'Deployment' : r.kind === 'class' ? `Class “${r.rows[0]?.title || ''}”` : `Vet visit “${r.rows[0]?.title || ''}”`;
}

function MenuItem({ icon, label, onPress, testID, danger, disabled, hint }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID: string; danger?: boolean; disabled?: boolean; hint?: string }) {
  const c = useColors();
  const color = disabled ? c.muted : danger ? c.danger : c.text;
  return (
    <Pressable accessibilityRole="menuitem" accessibilityLabel={label} accessibilityState={{ disabled }} testID={testID} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
      <Ionicons name={icon} size={22} color={danger && !disabled ? c.danger : disabled ? c.muted : c.primary} style={{ marginRight: space.sm }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color }}>{label}</Text>
        {hint ? <Muted>{hint}</Muted> : null}
      </View>
    </Pressable>
  );
}

export { slug };

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, flexWrap: 'wrap', marginBottom: space.md },
  actions: { flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', marginBottom: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1, flexGrow: 1, minWidth: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, paddingLeft: 12, paddingRight: 4, minHeight: 36, maxWidth: '100%' },
  chipX: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', marginBottom: space.sm, minHeight: 32 },
  colHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 1, marginBottom: space.xs },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.md, paddingBottom: space.sm },
  menuItem: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: space.sm, borderRadius: radius.md },
  phoneBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, paddingBottom: 6, gap: space.xs },
  phoneBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.md },
  phoneBadge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(228,87,46,0.6)' },
});
