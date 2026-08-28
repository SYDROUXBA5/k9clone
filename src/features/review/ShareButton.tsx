// "Share with supervisor…" — a supervisor shares one managed record with another supervisor (any
// agency). Creates a Share row; the recipient sees exactly that record (canSee → Shares) and gets a
// notification. Existing shares are listed with a Remove option.
import React, { useState } from 'react';
import { View } from 'react-native';
import { notify } from '@/db/notify';
import { useList, useRepo } from '@/db/provider';
import { REVIEWABLE_LABEL, getReviewable, handlerOf, reviewRoute, type ReviewableType } from '@/db/review';
import type { ShareRecordType } from '@/db/types';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button, Muted, Row, Select, Sheet, Text, TextArea, fmtDateTime, useToast, space } from '@/ui';
import { useReviewAccess } from './ReviewBar';

export function ShareButton({ recordType, recordId }: { recordType: ReviewableType; recordId: string }) {
  const { user, role } = useAuth();
  const repo = useRepo();
  const toast = useToast();
  const { row, canReview } = useReviewAccess(recordType, recordId);
  const users = useList('user');
  const shares = useList('share', (s) => s.record_type === (recordType as ShareRecordType) && s.record_id === recordId);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user || role !== 'supervisor' || !row || !canReview) return null;
  const supervisors = users.filter((u) => u.roles.includes('supervisor') && u.id !== user.id);
  const options = supervisors.map((u) => ({ value: u.id, label: `${u.name} — ${u.department || 'no department'}`, description: u.email }));
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name || id;

  const share = async () => {
    if (!to) { setError('Pick the supervisor to share with.'); return; }
    if (shares.some((s) => s.to_supervisor === to)) { setError(`Already shared with ${nameOf(to)}.`); return; }
    setBusy(true);
    try {
      const rec = getReviewable(repo, recordType, recordId);
      const handler = rec ? repo.getSync('user', handlerOf(rec)) : null;
      await repo.upsert('share', { owner_user_id: user.id, record_type: recordType as ShareRecordType, record_id: recordId, from_supervisor: user.id, to_supervisor: to, note: note.trim() }, { label: `Shared ${REVIEWABLE_LABEL[recordType].toLowerCase()} with ${nameOf(to)}` });
      await notify(repo, { user_id: to, type: 'record_shared', title: `${REVIEWABLE_LABEL[recordType]} shared with you`, body: `${user.name} shared ${handler ? `${handler.name}'s` : 'a'} ${REVIEWABLE_LABEL[recordType].toLowerCase()} with you${note.trim() ? `: “${note.trim()}”` : '.'}`, link: reviewRoute(recordType, recordId) });
      toast.show(`Shared with ${nameOf(to)}`);
      setOpen(false); setTo(''); setNote(''); setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Share failed — try again');
    } finally { setBusy(false); }
  };
  const unshare = async (id: string, toId: string) => {
    await repo.remove('share', id, { label: `Share with ${nameOf(toId)} removed` });
    toast.show('Share removed');
  };

  return (
    <View testID="share-block">
      <Button title="Share with supervisor…" variant="secondary" icon="share-social-outline" onPress={() => setOpen(true)} testID="btn-share-record" />
      {shares.length ? (
        <View style={{ marginTop: space.xs, gap: 2 }}>
          {shares.map((s) => (
            <Row key={s.id} wrap gap={space.xs}>
              <Muted testID={`share-row-${s.id}`}>Shared with {nameOf(s.to_supervisor)} · {fmtDateTime(s.created_at)}</Muted>
              {s.from_supervisor === user.id ? <Button title="Remove" variant="ghost" onPress={() => void unshare(s.id, s.to_supervisor)} testID={`btn-unshare-${s.id}`} /> : null}
            </Row>
          ))}
        </View>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title="Share with supervisor" testID="sheet-share" footer={(
        <Row justify="flex-end">
          <Button title="Cancel" variant="secondary" onPress={() => setOpen(false)} testID="btn-cancel-share" />
          <Button title="Share" icon="share-social-outline" onPress={() => void share()} loading={busy} testID="btn-confirm-share" />
        </Row>
      )}>
        <Text style={{ marginBottom: space.sm }}>The other supervisor — from your agency or another one — will see exactly this record in their Records list and can review it. Nothing else of the handler's is shared.</Text>
        <Select label="Supervisor" required options={options} value={to} onChange={(v) => { setTo(v); if (error) setError(null); }} error={error} allowCustom={false} placeholder="Choose a supervisor" testID="select-share-to" />
        <TextArea label="Note (optional)" value={note} onChangeText={setNote} minHeight={80} placeholder="Why you are sharing it" testID="input-share-note" />
      </Sheet>
    </View>
  );
}
