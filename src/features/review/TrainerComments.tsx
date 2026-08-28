// Trainer Comments — appended under a handler's record (bar §2.11 row 4): list with author + time,
// and for a trainer with access the "Trainer Comments" button → dialog (placeholder "Enter your
// trainer comments...") that saves a TrainerComment row and notifies the handler. U6 prints them as
// "Trainer <name> provided the following comments". Mount anywhere: <TrainerComments recordType recordId />.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { accessContext, canSee } from '@/db/access';
import { notify } from '@/db/notify';
import { useList, useRepo } from '@/db/provider';
import { getReviewable, handlerOf, reviewRoute, type ReviewableType } from '@/db/review';
import type { TrainerComment } from '@/db/types';
import { deviceTimeZone } from '@/db/util';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button, Card, ConfirmDialog, Muted, Row, Sheet, Text, TextArea, fmtDateTime, useColors, useToast, space } from '@/ui';

export function useCanTrainerComment(recordType: ReviewableType, recordId: string): boolean {
  const { user, role } = useAuth();
  const repo = useRepo();
  if (!user || role !== 'trainer') return false;
  const row = getReviewable(repo, recordType, recordId);
  if (!row) return false;
  if (handlerOf(row) === user.id) return false;
  return canSee(repo, accessContext(repo, user, 'trainer'), recordType, row as unknown as { id: string; owner_user_id: string; event_id?: string; handler_id?: string });
}

/**
 * The "Trainer Comments" action on its own, so the record screen can put it at the TOP of the record
 * (next to Back / Open full record) where a trainer sees it without scrolling past the whole completion.
 * Renders nothing when the signed-in user may not comment on this record.
 */
export function TrainerCommentButton({ recordType, recordId, variant = 'secondary' }: { recordType: ReviewableType; recordId: string; variant?: 'secondary' | 'ghost' }) {
  const { user } = useAuth();
  const repo = useRepo();
  const toast = useToast();
  const canComment = useCanTrainerComment(recordType, recordId);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!canComment) return null;

  const save = async () => {
    const t = text.trim();
    if (!t) { setError('Enter your trainer comments before saving.'); return; }
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const row = getReviewable(repo, recordType, recordId);
      await repo.upsert('trainer_comment', { owner_user_id: user.id, record_type: recordType, record_id: recordId, trainer_id: user.id, text: t, tz: deviceTimeZone() }, { label: 'Trainer comment' });
      if (row) {
        await notify(repo, { user_id: handlerOf(row), type: 'trainer_comment', title: 'Trainer comments added', body: `Trainer ${user.name} provided the following comments: “${t.length > 140 ? t.slice(0, 140) + '…' : t}”`, link: reviewRoute(recordType, recordId) });
      }
      toast.show('Trainer comments saved — handler notified');
      setText('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed — try again');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button title="Trainer Comments" icon="chatbubble-ellipses-outline" variant={variant} onPress={() => setOpen(true)} testID="btn-trainer-comments" />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Trainer Comments" testID="sheet-trainer-comments" footer={(
        <Row justify="flex-end">
          <Button title="Cancel" variant="secondary" onPress={() => setOpen(false)} testID="btn-cancel-trainer-comment" />
          <Button title={saving ? 'Saving…' : 'OK'} onPress={() => void save()} loading={saving} testID="btn-save-trainer-comment" />
        </Row>
      )}>
        <Muted style={{ marginBottom: space.sm }}>Your comments are appended to the handler's record and printed in its reports. The handler is notified.</Muted>
        <TextArea label="Trainer comments" required value={text} onChangeText={(v) => { setText(v); if (error) setError(null); }} placeholder="Enter your trainer comments..." error={error} minHeight={200} testID="input-trainer-comment" autoFocus />
      </Sheet>
    </>
  );
}

export function TrainerComments({ recordType, recordId, hideWhenEmpty, hideAddButton }: { recordType: ReviewableType; recordId: string; hideWhenEmpty?: boolean; hideAddButton?: boolean }) {
  const { user } = useAuth();
  const repo = useRepo();
  const toast = useToast();
  const c = useColors();
  const canComment = useCanTrainerComment(recordType, recordId);
  const comments = useList('trainer_comment', (t) => t.record_type === recordType && t.record_id === recordId).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const users = useList('user');
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name || 'Trainer';
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<TrainerComment | null>(null);

  if (!comments.length && !canComment && hideWhenEmpty) return null;

  const save = async () => {
    const t = text.trim();
    if (!t) { setError('Enter your trainer comments before saving.'); return; }
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const row = getReviewable(repo, recordType, recordId);
      await repo.upsert('trainer_comment', { owner_user_id: user.id, record_type: recordType, record_id: recordId, trainer_id: user.id, text: t, tz: deviceTimeZone() }, { label: 'Trainer comment' });
      if (row) {
        await notify(repo, { user_id: handlerOf(row), type: 'trainer_comment', title: 'Trainer comments added', body: `Trainer ${user.name} provided the following comments: “${t.length > 140 ? t.slice(0, 140) + '…' : t}”`, link: reviewRoute(recordType, recordId) });
      }
      toast.show('Trainer comments saved — handler notified');
      setText('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed — try again');
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!deleting) return;
    await repo.remove('trainer_comment', deleting.id, { label: 'Trainer comment' });
    setDeleting(null);
    toast.show('Trainer comment deleted — logged to History');
  };

  return (
    <View testID="trainer-comments" style={{ marginTop: space.md }}>
      <Row justify="space-between" style={{ marginBottom: space.xs }}>
        <Text variant="h3" accessibilityRole="header">Trainer comments{comments.length ? ` (${comments.length})` : ''}</Text>
        {canComment && !hideAddButton ? <Button title="Trainer Comments" icon="chatbubble-ellipses-outline" variant="secondary" onPress={() => setOpen(true)} testID="btn-trainer-comments" /> : null}
      </Row>
      {comments.length === 0 ? (
        <Muted testID="trainer-comments-empty">{canComment ? `No trainer comments yet — add yours with the Trainer Comments button at the top ${hideAddButton ? 'of this record' : 'of this section'}.` : 'No trainer comments on this record.'}</Muted>
      ) : (
        <View style={{ gap: space.sm }}>
          {comments.map((t) => (
            <Card key={t.id} style={[styles.comment, { borderLeftColor: c.primary }]} testID={`trainer-comment-${t.id}`}>
              <Row justify="space-between" align="flex-start">
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong">Trainer {nameOf(t.trainer_id)} provided the following comments:</Text>
                  <Muted>{fmtDateTime(t.created_at, t.tz)}</Muted>
                </View>
                {user?.id === t.trainer_id ? <Button title="Delete" variant="ghost" icon="trash-outline" onPress={() => setDeleting(t)} testID={`btn-delete-trainer-comment-${t.id}`} /> : null}
              </Row>
              <Text style={{ marginTop: space.xs }}>{t.text}</Text>
            </Card>
          ))}
        </View>
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} title="Trainer Comments" testID="sheet-trainer-comments" footer={(
        <Row justify="flex-end">
          <Button title="Cancel" variant="secondary" onPress={() => setOpen(false)} testID="btn-cancel-trainer-comment" />
          <Button title={saving ? 'Saving…' : 'OK'} onPress={() => void save()} loading={saving} testID="btn-save-trainer-comment" />
        </Row>
      )}>
        <Muted style={{ marginBottom: space.sm }}>Your comments are appended to the handler's record and printed in its reports. The handler is notified.</Muted>
        <TextArea label="Trainer comments" required value={text} onChangeText={(v) => { setText(v); if (error) setError(null); }} placeholder="Enter your trainer comments..." error={error} minHeight={200} testID="input-trainer-comment" autoFocus />
      </Sheet>
      <ConfirmDialog visible={!!deleting} title="Delete this trainer comment?" body="The deletion is logged to History." onConfirm={() => void remove()} onCancel={() => setDeleting(null)} testID="dialog-delete-trainer-comment" />
    </View>
  );
}

const styles = StyleSheet.create({
  comment: { borderLeftWidth: 4 },
});
