// Per-dog `Vaccination Summary` (bar §2.8 / PT-VET-08): Core Vaccinations, Other Vaccinations,
// `Next due:`, `Overdue`, `No recorded vaccinations`.
import React from 'react';
import { View } from 'react-native';
import { useList } from '@/db/provider';
import type { Dog } from '@/db/types';
import { Card, Muted, Row, StatusPill, Text, fmtDate, space } from '@/ui';
import { dogVaccineSummary, type VaccineStatus } from './vetModel';

export function VaccinationSummaryCard({ dog, testID = 'card-vaccination-summary' }: { dog: Dog; testID?: string }) {
  const vaccinations = useList('vaccination', (v) => v.dog_id === dog.id);
  const now = Date.now();
  const s = dogVaccineSummary(dog, vaccinations, now);

  return (
    <Card testID={testID}>
      <Row justify="space-between" wrap style={{ marginBottom: space.sm }}>
        <Text variant="h3">Vaccination Summary</Text>
        {s.state === 'overdue' ? <StatusPill status="expired" label="Overdue" testID="pill-vaccination-state" />
          : s.state === 'due' ? <StatusPill status="due" label="Due soon" testID="pill-vaccination-state" />
            : s.state === 'up_to_date' ? <StatusPill status="complete" label="Up to date" testID="pill-vaccination-state" />
              : <StatusPill status="neutral" label="None recorded" testID="pill-vaccination-state" />}
      </Row>
      {s.state === 'none' ? (
        <Muted testID="text-no-vaccinations">No recorded vaccinations.</Muted>
      ) : (
        <View style={{ gap: space.sm }}>
          <Group title="Core Vaccinations" rows={s.core} testID="group-core-vaccinations" />
          <Group title="Other Vaccinations" rows={s.other} testID="group-other-vaccinations" />
        </View>
      )}
      {s.missingCore.length ? (
        <Muted style={{ marginTop: space.sm }} testID="text-missing-core">
          No record of {s.missingCore.join(', ')} — the basic requirement is the four core vaccines plus rabies every three years.
        </Muted>
      ) : null}
    </Card>
  );
}

function Group({ title, rows, testID }: { title: string; rows: VaccineStatus[]; testID: string }) {
  return (
    <View testID={testID}>
      <Text variant="label" color="muted">{title}</Text>
      {rows.length === 0 ? <Muted>None recorded.</Muted> : rows.map((r) => (
        <Row key={r.vaccination.id} justify="space-between" wrap gap={space.sm} style={{ paddingVertical: 2 }}>
          <Text style={{ flexShrink: 1 }}>{r.vaccination.type}</Text>
          <Text
            color={r.state === 'overdue' ? 'danger' : r.state === 'due' ? 'accent' : 'muted'}
            testID={`text-next-due-${r.vaccination.id}`}
          >
            {r.state === 'overdue' ? `Overdue — was due ${fmtDate(r.dueAt)}` : `Next due: ${fmtDate(r.dueAt)}`}
          </Text>
        </Row>
      ))}
    </View>
  );
}
