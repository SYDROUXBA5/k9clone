// Supervisor VACCINES page (bar §2.8 / PT-VET-09): every managed dog's vaccination status in three
// tables — Vaccinations Due Within 30 Days, Overdue Vaccinations, Incomplete Vaccination Records.
// It also raises the reminder notifications (one per vaccination per milestone).
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { Dog, User, Vaccination } from '@/db/types';
import { useAuth, useVisibleUserIds } from '@/features/auth/AuthProvider';
import { Badge, Button, Card, EmptyState, Muted, Row, Screen, Section, StatusPill, Table, Text, fmtDate, space, type Column } from '@/ui';
import {
  VACCINES_PAGE_WINDOW_DAYS, dogVaccineSummary, planVaccineNotifications, vaccineStatuses, type VaccineStatus,
} from './vetModel';

interface Line extends VaccineStatus {
  handler: User | undefined;
  /** A vet visit already booked in the future for this dog (`Booked` Yes / No). */
  bookedVisitId: string | null;
}

export function VaccinesScreen() {
  const router = useRouter();
  const repo = useRepo();
  const { user } = useAuth();
  const visible = useVisibleUserIds();
  const users = useList('user');
  const dogs = useList('dog');
  const vaccinations = useList('vaccination');
  const visits = useList('vet_visit');
  const now = Date.now();

  const managedDogs = useMemo(() => dogs.filter((d) => visible.includes(d.owner_user_id) && d.status !== 'retired'), [dogs, visible]);
  const managedVax = useMemo(() => vaccinations.filter((v) => visible.includes(v.owner_user_id)), [vaccinations, visible]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const lines: Line[] = useMemo(() => {
    const upcoming = visits.filter((v) => new Date(v.date).getTime() > now);
    return vaccineStatuses(managedVax, managedDogs, now, VACCINES_PAGE_WINDOW_DAYS).map((s) => ({
      ...s,
      handler: userById.get(s.dog.owner_user_id),
      bookedVisitId: upcoming.find((v) => v.dog_id === s.dog.id)?.id || null,
    }));
  }, [managedVax, managedDogs, visits, userById, now]);

  const due = lines.filter((l) => l.state === 'due');
  const overdue = lines.filter((l) => l.state === 'overdue');
  const incomplete = useMemo(
    () => managedDogs.map((d) => dogVaccineSummary(d, managedVax, now)).filter((s) => s.missingCore.length > 0),
    [managedDogs, managedVax, now],
  );

  // Reminders: one Notification per (vaccination, milestone). The plan carries deterministic ids, so
  // re-rendering this screen never produces a duplicate.
  useEffect(() => {
    if (!user) return;
    const plan = planVaccineNotifications(managedVax, managedDogs, Date.now());
    for (const n of plan) {
      if (repo.getSync('notification', n.id)) continue;
      void repo.upsert('notification', {
        id: n.id, owner_user_id: n.user_id, user_id: n.user_id, type: 'vaccination_due',
        title: n.title, body: n.body, read: false, link: n.link,
      }, { silent: true });
    }
  }, [managedVax, managedDogs, repo, user]);

  const dueColumns = (): Column<Line>[] => [
    { key: 'dog', title: 'K9', flex: 1, render: (r) => <Text variant="bodyStrong">{r.dog.name}</Text> },
    { key: 'handler', title: 'Handler', flex: 1.2, render: (r) => r.handler?.name || '—' },
    {
      key: 'due', title: 'Due Date', flex: 1,
      render: (r) => (
        <Text color={r.state === 'overdue' ? 'danger' : 'text'} testID={`text-due-${r.vaccination.id}`}>
          {fmtDate(r.dueAt)}{r.state === 'overdue' ? ` · ${Math.abs(r.daysLeft)}d overdue` : r.daysLeft <= 0 ? ' · today' : ` · in ${r.daysLeft}d`}
        </Text>
      ),
    },
    { key: 'vaccines', title: 'Vaccines', flex: 1.2, render: (r) => <Row wrap gap={4}><Badge tone={r.vaccination.core ? 'primary' : 'muted'}>{r.vaccination.type}</Badge></Row> },
    {
      key: 'booked', title: 'Booked', width: 130,
      render: (r) => (r.bookedVisitId
        ? <Button title="Yes" variant="ghost" onPress={() => router.push(`/records/vet/${r.bookedVisitId}` as never)} testID={`btn-booked-${r.vaccination.id}`} style={{ minHeight: 36, paddingVertical: 4 }} />
        : (
          <Button
            title="No — book"
            variant="secondary"
            onPress={() => router.push(`/records/vet/new?dog=${r.dog.id}&due=${encodeURIComponent(r.vaccination.type)}` as never)}
            testID={`btn-book-${r.vaccination.id}`}
            accessibilityLabel={`Not booked — book a vet visit for ${r.dog.name} to give ${r.vaccination.type}`}
            style={{ minHeight: 36, paddingVertical: 4 }}
          />
        )),
    },
    {
      key: 'open', title: '', width: 110,
      render: (r) => (
        <Button
          title="Open"
          variant="secondary"
          onPress={() => router.push((r.vaccination.vet_visit_id ? `/records/vet/${r.vaccination.vet_visit_id}` : `/dogs/${r.dog.id}`) as never)}
          testID={`btn-open-vaccination-${r.vaccination.id}`}
          style={{ minHeight: 36, paddingVertical: 4 }}
        />
      ),
    },
  ];

  return (
    <Screen title="Vaccines" subtitle="Every managed dog's vaccination status. Overdue rows are red." testID="screen-vaccines" maxWidth={1240}>
      <Row wrap gap={space.sm} style={{ marginBottom: space.md }}>
        <SummaryTile label="Due within 30 days" value={due.length} tone="due" testID="tile-vaccines-due" />
        <SummaryTile label="Overdue" value={overdue.length} tone="expired" testID="tile-vaccines-overdue" />
        <SummaryTile label="Incomplete records" value={incomplete.length} tone="neutral" testID="tile-vaccines-incomplete" />
      </Row>

      <Section title={`Vaccinations Due Within ${VACCINES_PAGE_WINDOW_DAYS} Days`} description="A reminder is raised two weeks before the due date and again on the day it is due.">
        <Table<Line>
          testID="table-vaccines-due"
          columns={dueColumns()}
          rows={due}
          keyOf={(r) => r.vaccination.id}
          rowTestID={(r) => `row-due-${r.vaccination.id}`}
          emptyText="Nothing due in the next 30 days."
        />
      </Section>

      <Section title="Overdue Vaccinations" description="Past the date the vet set. These also appear in the handler's TO DO card.">
        <View testID="wrap-vaccines-overdue">
          <Table<Line>
            testID="table-vaccines-overdue"
            columns={dueColumns()}
            rows={overdue}
            keyOf={(r) => r.vaccination.id}
            rowTestID={(r) => `row-overdue-${r.vaccination.id}`}
            emptyText="No overdue vaccinations."
          />
        </View>
      </Section>

      <Section title="Incomplete Vaccination Records" description="These dogs have no record confirming the basic requirement — the four core vaccines plus rabies every three years.">
        <Table<{ dog: Dog; missingCore: string[] }>
          testID="table-vaccines-incomplete"
          columns={[
            { key: 'dog', title: 'K9', flex: 1, render: (r) => <Text variant="bodyStrong">{r.dog.name}</Text> },
            { key: 'handler', title: 'Handler', flex: 1.2, render: (r) => userById.get(r.dog.owner_user_id)?.name || '—' },
            { key: 'missing', title: 'Missing', flex: 2, render: (r) => <Row wrap gap={4}>{r.missingCore.map((m) => <Badge key={m} tone="muted">{m}</Badge>)}</Row> },
            { key: 'open', title: '', width: 110, render: (r) => <Button title="Open" variant="secondary" onPress={() => router.push(`/dogs/${r.dog.id}` as never)} testID={`btn-open-dog-${r.dog.id}`} style={{ minHeight: 36, paddingVertical: 4 }} /> },
          ]}
          rows={incomplete.map((s) => ({ dog: s.dog, missingCore: s.missingCore }))}
          keyOf={(r) => r.dog.id}
          emptyText="Every managed dog has the core vaccines on record."
        />
      </Section>

      {managedDogs.length === 0 ? (
        <EmptyState icon="paw-outline" title="No managed dogs" body="Add handlers on the Manage page and their dogs appear here." testID="empty-vaccines" />
      ) : null}
    </Screen>
  );
}

function SummaryTile({ label, value, tone, testID }: { label: string; value: number; tone: 'due' | 'expired' | 'neutral'; testID: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 200 }} testID={testID}>
      <Text variant="h1">{value}</Text>
      <Muted>{label}</Muted>
      <View style={{ marginTop: space.sm, alignSelf: 'flex-start' }}>
        <StatusPill status={tone} label={tone === 'due' ? 'Due soon' : tone === 'expired' ? 'Overdue' : 'Check'} />
      </View>
    </Card>
  );
}

/** Re-exported so other units can read the same list without importing the screen. */
export type { Vaccination };
