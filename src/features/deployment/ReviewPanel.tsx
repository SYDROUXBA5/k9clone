// Shared by deployment + class editors: rejection banner ("Supervisor <name> rejected this record with
// the following comments:"), review/complete pills, submission status copy, read-only Trainer Comments.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useList } from '@/db/provider';
import type { ReviewFields, TrainerComment } from '@/db/types';
import { Banner, Card, Muted, Row, StatusPill, Text, fmtDateTime, useColors, radius, space } from '@/ui';

export function RejectionBanner({ record, testID = 'banner-rejected' }: { record: ReviewFields; testID?: string }) {
  const users = useList('user');
  if (record.review !== 'rejected') return null;
  const who = users.find((u) => u.id === record.reviewed_by)?.name || 'Your supervisor';
  return (
    <Banner tone="danger" testID={testID} title={`Supervisor ${who} rejected this record with the following comments:`} body={<Text style={{ fontStyle: 'italic' }}>{record.rejection_reason || '(no reason given)'}</Text>} />
  );
}

export function ReviewPills({ record, isComplete }: { record: ReviewFields | null; isComplete: boolean }) {
  return (
    <Row wrap gap={space.xs}>
      <StatusPill status={isComplete ? 'complete' : 'incomplete'} testID="pill-complete" />
      {record ? <StatusPill status={record.review} testID="pill-review" /> : null}
    </Row>
  );
}

/** Copy from the reference's status strings (bar §2.6.5 row 4). */
export function submissionStatus(record: { submitted_at?: string | null; is_complete: boolean } & ReviewFields, hasSupervisor: boolean, tz?: string): string {
  if (!record.is_complete) return hasSupervisor ? 'Not yet submitted for review' : 'Incomplete. Submit this record to complete it';
  if (record.review === 'reviewed') return `This record has been submitted and reviewed by your supervisor${record.reviewed_at ? ` (${fmtDateTime(record.reviewed_at, tz)})` : ''}`;
  if (record.review === 'rejected') return 'This record has been submitted and rejected by your supervisor — fix it and submit again';
  return hasSupervisor ? `This record has been submitted for review${record.submitted_at ? ` (${fmtDateTime(record.submitted_at, tz)})` : ''}` : 'This record has been submitted and marked complete';
}

export function TrainerComments({ recordType, recordId, testID = 'section-trainer-comments' }: { recordType: TrainerComment['record_type']; recordId: string | null; testID?: string }) {
  const c = useColors();
  const comments = useList('trainer_comment', (t) => t.record_type === recordType && t.record_id === recordId).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const users = useList('user');
  if (!recordId || comments.length === 0) return null;
  return (
    <Card style={{ marginTop: space.lg }} testID={testID}>
      <Text variant="h3" style={{ marginBottom: space.sm }}>Trainer Comments</Text>
      <Muted style={{ marginBottom: space.sm }}>Appended by your trainer and printed with the record's report. Read-only.</Muted>
      {comments.map((t) => (
        <View key={t.id} style={[styles.comment, { borderColor: c.border, backgroundColor: c.surfaceAlt }]} testID={`trainer-comment-${t.id}`}>
          <Row justify="space-between" wrap><Text variant="bodyStrong">{users.find((u) => u.id === t.trainer_id)?.name || 'Trainer'}</Text><Muted>{fmtDateTime(t.created_at)}</Muted></Row>
          <Text style={{ marginTop: 4 }}>{t.text}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({ comment: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginBottom: space.sm } });
