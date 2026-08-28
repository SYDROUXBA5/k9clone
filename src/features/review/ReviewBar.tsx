// Supervisor review loop UI (bar §2.12 rows 3–5, §5.2):
//   <ReviewBar recordType recordId />  — state pill + trio Not Reviewed · Reviewed · Rejected (reason required)
//                                        for a supervisor who manages the handler (or was shared the record);
//                                        the record's handler sees the red rejection banner instead; anyone else the pill.
//   <RejectedBanner row />              — "Supervisor <name> has requested the following changes:" + reason
//   <OutdatedBanner completion />       — yellow banner + red/green Details diff + "Acknowledge & re-save"
// U3/U4 mount these on their record views; /review/[type]/[id] mounts them too so the loop is testable standalone.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { accessContext, canSee } from '@/db/access';
import { useList, useRecord, useRepo } from '@/db/provider';
import { acknowledgeOutdated, effectiveReview, getReviewable, handlerOf, isOutdated, isRejectedOpen, outdatedDiff, rejectRecord, reviewEntityOf, setNotReviewed, setReviewed, type ReviewableRow, type ReviewableType } from '@/db/review';
import type { Completion } from '@/db/types';
import { useAuth } from '@/features/auth/AuthProvider';
import { Banner, Button, Muted, Row, Sheet, StatusPill, Text, TextArea, fmtDateTime, useColors, useToast, radius, space } from '@/ui';

/** Who may act on this record in the current role. */
export function useReviewAccess(recordType: ReviewableType, recordId: string) {
  const { user, role } = useAuth();
  const repo = useRepo();
  const row = useRecord(reviewEntityOf(recordType), recordId) as ReviewableRow | undefined;
  useList('management_group'); useList('share'); // re-render when grants change
  if (!user || !row) return { row: undefined, isOwner: false, canReview: false, canView: false };
  const isOwner = handlerOf(row) === user.id;
  const ctx = accessContext(repo, user, role);
  const canView = isOwner || canSee(repo, ctx, recordType, row as unknown as { id: string; owner_user_id: string; event_id?: string; handler_id?: string });
  const canReview = role === 'supervisor' && !isOwner && canView;
  return { row, isOwner, canReview, canView };
}

export function ReviewStatePill({ row, testID }: { row: ReviewableRow; testID?: string }) {
  const users = useList('user');
  const state = effectiveReview(row);
  const by = row.reviewed_by ? users.find((u) => u.id === row.reviewed_by)?.name : null;
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <StatusPill status={state} testID={testID || 'pill-review-state'} />
      {state === 'reviewed' && by ? <Muted style={{ marginTop: 2 }}>Report Reviewed: Yes, by {by}</Muted> : state === 'not_reviewed' ? <Muted style={{ marginTop: 2 }}>Report Reviewed: No</Muted> : null}
    </View>
  );
}

export function ReviewBar({ recordType, recordId, compact }: { recordType: ReviewableType; recordId: string; compact?: boolean }) {
  const { user } = useAuth();
  const repo = useRepo();
  const toast = useToast();
  const c = useColors();
  const { row, isOwner, canReview } = useReviewAccess(recordType, recordId);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'reviewed' | 'rejected' | 'not_reviewed' | null>(null);
  if (!row || !user) return null;
  const state = effectiveReview(row);

  if (isOwner) {
    return (
      <View testID="review-bar-owner">
        <RejectedBanner row={row} />
        {recordType === 'completion' ? <OutdatedBanner completion={row as Completion} /> : null}
        {!compact ? <ReviewStatePill row={row} /> : null}
      </View>
    );
  }
  if (!canReview) return <ReviewStatePill row={row} />;

  const reviewed = async () => {
    setBusy('reviewed');
    try { await setReviewed(repo, recordType, recordId, user.id); toast.show('Marked as Reviewed'); }
    catch (err) { toast.show(`Could not save review — ${err instanceof Error ? err.message : 'try again'}`, 'error'); }
    finally { setBusy(null); }
  };
  const notReviewed = async () => {
    setBusy('not_reviewed');
    try { await setNotReviewed(repo, recordType, recordId, user.id); toast.show('Set back to Not Reviewed'); }
    catch (err) { toast.show(`Could not save review — ${err instanceof Error ? err.message : 'try again'}`, 'error'); }
    finally { setBusy(null); }
  };
  const reject = async () => {
    setBusy('rejected');
    try {
      const res = await rejectRecord(repo, recordType, recordId, user.id, reason);
      if (!res.ok) { setError(res.error); return; }
      toast.show('Record rejected — the handler was notified (in-app + email)');
      setRejectOpen(false);
      setReason('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed — try again');
    } finally { setBusy(null); }
  };

  return (
    <View testID="review-bar" style={[styles.bar, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
      <ReviewStatePill row={row} />
      <Row wrap style={{ marginTop: compact ? 0 : space.sm }}>
        <Button title="Not Reviewed" variant={state === 'not_reviewed' ? 'primary' : 'secondary'} icon="shield-outline" onPress={() => void notReviewed()} loading={busy === 'not_reviewed'} disabled={state === 'not_reviewed'} testID="btn-review-not-reviewed" accessibilityLabel="Set Not Reviewed" />
        <Button title="Reviewed" variant={state === 'reviewed' ? 'primary' : 'secondary'} icon="shield-checkmark" onPress={() => void reviewed()} loading={busy === 'reviewed'} disabled={state === 'reviewed'} testID="btn-review-reviewed" accessibilityLabel="Mark Reviewed" />
        <Button title="Rejected" variant={state === 'rejected' ? 'danger' : 'secondary'} icon="alert-circle" onPress={() => { setError(null); setRejectOpen(true); }} loading={busy === 'rejected'} testID="btn-review-rejected" accessibilityLabel="Reject with a reason" />
      </Row>
      {state === 'rejected' && row.rejection_reason ? <Muted style={{ marginTop: space.xs }} testID="text-rejection-reason">Reason given: “{row.rejection_reason}”</Muted> : null}
      <Muted style={{ marginTop: space.xs }}>Supervisors can view and review a handler's record but never alter it.</Muted>
      <Sheet visible={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject this record" testID="sheet-reject" footer={(
        <Row justify="flex-end">
          <Button title="Cancel" variant="secondary" onPress={() => setRejectOpen(false)} testID="btn-cancel-reject" />
          <Button title="Reject record" variant="danger" icon="alert-circle" onPress={() => void reject()} loading={busy === 'rejected'} testID="btn-confirm-reject" />
        </Row>
      )}>
        <Muted style={{ marginBottom: space.sm }}>A rejection needs a reason so the handler knows what to fix. The handler sees a red banner with your comments, is notified in-app and by email, updates the record and re-saves — then it comes back to you as Not Reviewed.</Muted>
        <TextArea label="Rejection reason" required value={reason} onChangeText={(v) => { setReason(v); if (error) setError(null); }} error={error} placeholder="What must the handler change?" minHeight={140} testID="input-rejection-reason" autoFocus />
      </Sheet>
    </View>
  );
}

/** Red banner on the handler's record while a rejection is open. */
export function RejectedBanner({ row }: { row: ReviewableRow }) {
  const users = useList('user');
  if (!isRejectedOpen(row)) return null;
  const by = users.find((u) => u.id === row.reviewed_by)?.name || 'Your supervisor';
  return (
    <Banner
      tone="danger"
      testID="banner-rejected"
      title={`Supervisor ${by} has requested the following changes:`}
      body={(
        <View>
          <Text style={{ fontStyle: 'italic' }} testID="text-rejected-reason">{row.rejection_reason || '(no reason recorded)'}</Text>
          <Muted style={{ marginTop: 4 }}>Please update your record based on any feedback provided and re-save to remove the Rejected status. Your supervisor will review the record again to ensure the changes are satisfactory.{row.reviewed_at ? ` Rejected ${fmtDateTime(row.reviewed_at, row.reviewed_tz || undefined)}.` : ''}</Muted>
        </View>
      )}
    />
  );
}

/** Yellow banner + red/green Details diff for an outdated completion; the handler acknowledges & re-saves. */
export function OutdatedBanner({ completion, showAck = true }: { completion: Completion; showAck?: boolean }) {
  const repo = useRepo();
  const { user } = useAuth();
  const toast = useToast();
  const c = useColors();
  useList('exercise'); // re-render when the exercise moves on
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (!isOutdated(repo, completion)) return null;
  const d = outdatedDiff(repo, completion);
  const isOwner = user && (completion.handler_id || completion.owner_user_id) === user.id;
  const diff = d?.diff || [];
  const changed = diff.filter((l) => l.kind !== 'same');
  const shown = expanded ? diff : diff.filter((l, i) => l.kind !== 'same' || diff.slice(Math.max(0, i - 1), i + 2).some((x) => x.kind !== 'same'));
  const hidden = diff.length - shown.length;
  const ack = async () => {
    if (!user) return;
    setBusy(true);
    try { await acknowledgeOutdated(repo, completion.id, user.id); toast.show('Exercise changes acknowledged — completion re-saved'); }
    catch (err) { toast.show(`Could not re-save — ${err instanceof Error ? err.message : 'try again'}`, 'error'); }
    finally { setBusy(false); }
  };
  return (
    <View testID="banner-outdated" style={[styles.outdated, { backgroundColor: c.warningSoft, borderColor: c.warning }]}>
      <Row align="flex-start">
        <Ionicons name="time" size={22} color={c.warning} style={{ marginRight: space.sm, marginTop: 1 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row wrap gap={space.sm}>
            <Text variant="bodyStrong" style={{ color: c.warning }}>Outdated</Text>
            <StatusPill status="outdated" testID="pill-outdated" />
          </Row>
          <Text style={{ marginTop: 4 }}>
            {d?.changedBy?.name || 'A trainer'} modified the exercise details after {isOwner ? 'you' : 'the handler'} saved this completion record. {isOwner ? 'Your' : 'The'} completion is now outdated and needs to be verified. The changes are shown below.
          </Text>
        </View>
      </Row>
      <View style={[styles.diff, { backgroundColor: c.surface, borderColor: c.border }]} testID="diff-exercise-details">
        <Row justify="space-between" style={{ marginBottom: 4 }}>
          <Muted>Exercise Details — previous (red) vs current (green){d?.previous ? ` · v${d.previous.version} → v${repo.getSync('exercise', completion.exercise_id)?.version || '?'}` : ''}</Muted>
          <Muted>{changed.length} changed line{changed.length === 1 ? '' : 's'}</Muted>
        </Row>
        {shown.map((l, i) => (
          <View key={i} style={[styles.diffLine, l.kind === 'del' ? { backgroundColor: c.dangerSoft } : l.kind === 'add' ? { backgroundColor: c.successSoft } : null]} testID={`diff-line-${l.kind}`}>
            <Text style={{ width: 22, color: l.kind === 'del' ? c.danger : l.kind === 'add' ? c.success : c.muted, fontWeight: '700' }}>{l.kind === 'del' ? '−' : l.kind === 'add' ? '+' : ' '}</Text>
            <Text style={{ flex: 1, color: l.kind === 'del' ? c.danger : l.kind === 'add' ? c.success : c.text }}>{l.text}</Text>
          </View>
        ))}
        {hidden > 0 && !expanded ? <Button title={`Show ${hidden} more line${hidden === 1 ? '' : 's'} …`} variant="ghost" onPress={() => setExpanded(true)} testID="btn-diff-expand" /> : null}
      </View>
      {isOwner && showAck ? (
        <View style={{ marginTop: space.sm }}>
          <Muted style={{ marginBottom: space.xs }}>Edit the record if the changes require it, then re-save. Re-saving signifies that you agree with the exercise modifications.</Muted>
          <Button title="Acknowledge & re-save" icon="checkmark-done" onPress={() => void ack()} loading={busy} testID="btn-acknowledge-outdated" />
        </View>
      ) : null}
    </View>
  );
}

/** Convenience for list rows: pills for review + outdated. */
export function RecordStatePills({ recordType, row }: { recordType: ReviewableType; row: ReviewableRow }) {
  const repo = useRepo();
  const outdated = recordType === 'completion' && isOutdated(repo, row as Completion);
  return (
    <Row wrap gap={space.xs}>
      <StatusPill status={effectiveReview(row)} />
      {outdated ? <StatusPill status="outdated" /> : null}
    </Row>
  );
}

const styles = StyleSheet.create({
  bar: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  outdated: { borderWidth: 1, borderLeftWidth: 4, borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  diff: { borderWidth: 1, borderRadius: radius.sm, padding: space.sm, marginTop: space.sm },
  diffLine: { flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
export { getReviewable };
