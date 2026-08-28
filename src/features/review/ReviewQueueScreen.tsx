// /review — a supervisor's (or trainer's) queue of managed handlers' records: Not Reviewed · Rejected ·
// Late (incomplete > 7 days) · Outdated, plus records shared with me. Each row opens /review/[type]/[id].
// Handlers see their own records that need attention (rejected / outdated). "Late" is the one rule from
// db/review.ts (isLateCompletion) that Manage's Late Records column and the past-due notification also use.
// U2's Records hub carries the same banners via getSupervisorBanners(); this queue exists so the loop is
// testable regardless of merge order.
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { accessContext, canSee, managedUserIds } from '@/db/access';
import { useList, useRepo } from '@/db/provider';
import { effectiveReview, isLateCompletion, isOutdated, isRejectedOpen, reviewRoute, type ReviewableRow, type ReviewableType } from '@/db/review';
import type { ClassRecord, Completion, Deployment } from '@/db/types';
import { LATE_RECORD_DAYS } from '@/db/vocab';
import { useAuth } from '@/features/auth/AuthProvider';
import { Banner, Card, EmptyState, Muted, Row, Screen, Segmented, StatusPill, Table, Text, fmtDate, fmtDateTime, useColors, space, type Column } from '@/ui';

type QueueRow = { key: string; type: ReviewableType; row: ReviewableRow; handler: string; dog: string; label: string; when: string; state: 'not_reviewed' | 'reviewed' | 'rejected'; outdated: boolean; late: boolean; shared: boolean };
type Filter = 'attention' | 'not_reviewed' | 'rejected' | 'late' | 'shared' | 'all';

export function ReviewQueueScreen() {
  const { user, role } = useAuth();
  const repo = useRepo();
  const router = useRouter();
  const c = useColors();
  const completions = useList('completion');
  const deployments = useList('deployment');
  const classes = useList('class_record');
  const users = useList('user');
  const dogs = useList('dog');
  useList('exercise'); useList('training_event'); useList('management_group'); useList('share');
  const [filter, setFilter] = useState<Filter>('attention');
  const nameOf = (id: string | null | undefined) => users.find((u) => u.id === id)?.name || '—';
  const dogName = (id: string | null | undefined) => dogs.find((d) => d.id === id)?.name || '—';

  const rows = useMemo<QueueRow[]>(() => {
    if (!user) return [];
    const ctx = accessContext(repo, user, role);
    const lateSince = Date.now() - 90 * 86400000; // Last 3 Months — the window Manage uses
    const out: QueueRow[] = [];
    const push = (type: ReviewableType, row: ReviewableRow, handlerId: string, dogId: string | null, label: string, when: string) => {
      const isMine = handlerId === user.id;
      if (!isMine && !canSee(repo, ctx, type, row as unknown as { id: string; owner_user_id: string; event_id?: string; handler_id?: string })) return;
      if (role === 'handler' && !isMine) return;
      const shared = ctx.shared.has(`${type}:${row.id}`) && !ctx.readable.has(handlerId);
      // "late" has ONE definition (db/review.ts): a completion still not saved 7 days after the event,
      // counted over the same Last 3 Months window as Manage's Late Records column.
      const late = type === 'completion' && new Date(when).getTime() >= lateSince && isLateCompletion(repo, row as Completion);
      out.push({ key: `${type}:${row.id}`, type, row, handler: nameOf(handlerId), dog: dogName(dogId), label, when, state: effectiveReview(row), outdated: type === 'completion' && isOutdated(repo, row as Completion), late, shared });
    };
    for (const x of completions) {
      const ex = repo.getSync('exercise', x.exercise_id);
      const ev = repo.getSync('training_event', x.event_id);
      push('completion', x, x.handler_id || x.owner_user_id, x.dog_id, `${ex?.name || 'Exercise'} · ${ev?.name || 'Training'}`, ev?.starts_at || x.created_at);
    }
    for (const d of deployments) push('deployment', d, d.handler_id || d.owner_user_id, d.dog_id, `Deployment${d.case_number ? ` · Case ${d.case_number}` : ''}`, d.occurred_at);
    for (const k of classes) push('class', k, k.owner_user_id, null, k.title || 'Class', k.occurred_at);
    return out.sort((a, b) => (a.when < b.when ? 1 : -1));
  }, [user, role, repo, completions, deployments, classes, users, dogs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;
  const isSaved = (r: QueueRow) => (r.row as Completion).saved_at || (r.row as Deployment).submitted_at || (r.row as ClassRecord).is_complete || (r.row as Completion).is_complete;
  const filtered = rows.filter((r) => {
    switch (filter) {
      case 'not_reviewed': return isSaved(r) && r.state === 'not_reviewed';
      case 'rejected': return r.state === 'rejected' && isRejectedOpen(r.row);
      case 'late': return r.late;
      case 'shared': return r.shared;
      case 'all': return true;
      default: return r.late || r.outdated || r.shared || (r.state === 'rejected' && isRejectedOpen(r.row)) || (isSaved(r) && r.state === 'not_reviewed');
    }
  });
  // Managed ids include managed SUPERVISORS; the subtitle counts handlers, so filter by role.
  const managedCount = role === 'supervisor' || role === 'trainer'
    ? managedUserIds(repo, user.id, role).filter((id) => users.find((u) => u.id === id)?.roles.includes('handler')).length
    : 0;
  const counts = {
    notReviewed: rows.filter((r) => isSaved(r) && r.state === 'not_reviewed').length,
    rejected: rows.filter((r) => r.state === 'rejected' && isRejectedOpen(r.row)).length,
    late: rows.filter((r) => r.late).length,
    outdated: rows.filter((r) => r.outdated).length,
    shared: rows.filter((r) => r.shared).length,
  };

  // Status is the point of this screen, so it comes first and never falls off the right edge. Every column
  // is fixed-width: the table lives in a horizontal ScrollView, where a flex column is sized by its longest
  // label (max-content) and pushes the later columns off screen. 190+124+112+296+110+76 = 908 < the 984 px
  // content column at 1280, so a supervisor reads Status → Dog without scrolling sideways.
  const columns: Column<QueueRow>[] = [
    { key: 'state', title: 'Status', width: 190, render: (r) => (
      <Row wrap gap={4}>
        {isSaved(r) ? <StatusPill status={r.state} testID={`pill-${r.key}`} /> : <StatusPill status="incomplete" />}
        {r.outdated ? <StatusPill status="outdated" /> : null}
        {r.late ? <StatusPill status="expired" label="Late" /> : null}
        {r.shared ? <StatusPill status="neutral" label="Shared with you" /> : null}
      </Row>
    ) },
    { key: 'when', title: 'Date', width: 124, render: (r) => <Text numberOfLines={1} accessibilityLabel={fmtDateTime(r.when, (r.row as Completion).tz)}>{fmtDate(r.when)}</Text> },
    { key: 'type', title: 'Type', width: 112, render: (r) => <Text numberOfLines={1}>{r.type === 'completion' ? 'Training' : r.type === 'deployment' ? 'Deployment' : 'Class'}</Text> },
    { key: 'label', title: 'Record', width: 296, render: (r) => <Text numberOfLines={2}>{r.label}</Text> },
    { key: 'handler', title: 'Handler', width: 110, render: (r) => <Text numberOfLines={2}>{r.handler}</Text> },
    { key: 'dog', title: 'Dog', width: 76, render: (r) => <Text numberOfLines={1}>{r.dog}</Text> },
  ];

  return (
    <Screen
      title="Review"
      subtitle={role === 'supervisor' ? `Records of the ${managedCount} handler${managedCount === 1 ? '' : 's'} you supervise, plus records shared with you.` : role === 'trainer' ? `Records of the ${managedCount} handler${managedCount === 1 ? '' : 's'} you train — open one to add Trainer Comments.` : 'Your records that need attention.'}
      testID="screen-review-queue"
    >
      {role === 'supervisor' ? (
        <Row wrap style={{ marginBottom: space.md }}>
          <Card style={{ minWidth: 150 }} testID="banner-not-reviewed"><Text variant="h2" style={{ color: c.primary }}>{counts.notReviewed}</Text><Muted>NOT REVIEWED · Last 3 Months</Muted></Card>
          <Card style={{ minWidth: 150, maxWidth: 300 }} testID="banner-late"><Text variant="h2" style={{ color: c.danger }}>{counts.late}</Text><Muted>LATE RECORDS · Last 3 Months</Muted><Muted testID="text-late-rule">Not saved {LATE_RECORD_DAYS} days after the event</Muted></Card>
          <Card style={{ minWidth: 150 }} testID="banner-rejected"><Text variant="h2" style={{ color: c.warning }}>{counts.rejected}</Text><Muted>REJECTED · awaiting re-save</Muted></Card>
        </Row>
      ) : null}
      {role === 'handler' && (counts.rejected || counts.outdated) ? <Banner tone="warning" body={`${counts.rejected} rejected and ${counts.outdated} outdated record${counts.rejected + counts.outdated === 1 ? '' : 's'} need your attention.`} testID="banner-handler-attention" /> : null}
      <View style={{ marginBottom: space.md }}>
        <Segmented
          label="Filter"
          options={[
            { value: 'attention', label: 'Needs attention' },
            { value: 'not_reviewed', label: `Not Reviewed (${counts.notReviewed})` },
            { value: 'rejected', label: `Rejected (${counts.rejected})` },
            ...(role === 'supervisor' ? [{ value: 'late' as const, label: `Late (${counts.late})` }, { value: 'shared' as const, label: `Shared (${counts.shared})` }] : []),
            { value: 'all', label: `All (${rows.length})` },
          ]}
          value={filter}
          onChange={setFilter}
          testID="seg-review-filter"
        />
      </View>
      {filtered.length === 0 ? (
        <EmptyState icon="shield-checkmark-outline" title={filter === 'attention' ? 'Nothing needs attention' : 'No records match'} body={role === 'supervisor' && managedCount === 0 ? 'You do not manage any handlers yet — add them from Manage.' : undefined} testID="empty-review-queue" />
      ) : (
        <Table columns={columns} rows={filtered} keyOf={(r) => r.key} onRowPress={(r) => router.push(reviewRoute(r.type, r.row.id) as never)} testID="table-review-queue" rowTestID={(r) => `row-${r.key}`} />
      )}
    </Screen>
  );
}
