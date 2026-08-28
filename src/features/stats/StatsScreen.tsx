// STATS (bar §2.14). Range picker (Last 30 Days by default) + a dog picker; the same cards render
// per dog or for every dog at once. Charts are Views, not a chart library, so they read out loud and
// theme correctly in dark mode.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useList } from '@/db/provider';
import { useAuth, useVisibleUserIds } from '@/features/auth/AuthProvider';
import { Card, DateTimeField, Muted, Row, Screen, Section, Select, Text, fmtDate, useIsDesktop, space } from '@/ui';
import { BarChart, StackedBar } from './BarChart';
import {
  RANGE_OPTIONS, computeDeployments, computeDetection, computeTraining, resolveRange,
  type RangeKey, type StatsInput,
} from './statsModel';

export function StatsScreen() {
  const { user, role } = useAuth();
  const visible = useVisibleUserIds();
  const desktop = useIsDesktop();
  const now = Date.now();

  const [rangeKey, setRangeKey] = useState<RangeKey>('last_30');
  const [customFrom, setCustomFrom] = useState<string | null>(new Date(now - 30 * 86400000).toISOString());
  const [customTo, setCustomTo] = useState<string | null>(new Date(now).toISOString());
  const [dogId, setDogId] = useState<string | null>(null);

  const dogs = useList('dog', (d) => visible.includes(d.owner_user_id));
  const events = useList('training_event');
  const exercises = useList('exercise');
  const completions = useList('completion');
  const deployments = useList('deployment');
  const classes = useList('class_record');

  const range = useMemo(() => resolveRange(rangeKey, now, customFrom, customTo), [rangeKey, now, customFrom, customTo]);
  const input: StatsInput = useMemo(() => ({
    range, dogId, userIds: visible, dogs, events, exercises, completions, deployments, classes,
  }), [range, dogId, visible, dogs, events, exercises, completions, deployments, classes]);

  const training = useMemo(() => computeTraining(input), [input]);
  const detection = useMemo(() => computeDetection(input), [input]);
  const deploy = useMemo(() => computeDeployments(input), [input]);

  const scope = dogId ? dogs.find((d) => d.id === dogId)?.name || 'Dog' : role === 'handler' ? 'All my dogs' : 'Everyone I manage';
  const rangeText = `${fmtDate(new Date(range.from).toISOString())} – ${fmtDate(new Date(range.to).toISOString())}`;

  return (
    <Screen title="Stats" subtitle={`${range.label} · ${scope} · ${rangeText}`} testID="screen-stats" maxWidth={1240}>
      <Card testID="card-stats-filters" style={{ marginBottom: space.lg }}>
        <View style={desktop ? { flexDirection: 'row', gap: space.md } : undefined}>
          <View style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
            <Select
              label="Range"
              options={RANGE_OPTIONS}
              allowCustom={false}
              value={rangeKey}
              onChange={(v) => setRangeKey(v as RangeKey)}
              testID="select-stats-range"
              help="Last 30 Days by default."
            />
          </View>
          <View style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
            <Select
              label="Dog"
              options={[{ value: '', label: 'All dogs (total)' }, ...dogs.map((d) => ({ value: d.id, label: d.name, description: d.status === 'retired' ? 'Retired' : d.purpose }))]}
              allowCustom={false}
              value={dogId || ''}
              onChange={(v) => setDogId(v || null)}
              testID="select-stats-dog"
              help="Pick one dog, or keep the total across every dog."
            />
          </View>
        </View>
        {rangeKey === 'custom' ? (
          <View style={desktop ? { flexDirection: 'row', gap: space.md } : undefined} testID="wrap-stats-custom-range">
            <View style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
              <DateTimeField label="From" mode="date" value={{ at: customFrom, tz: 'UTC' }} onChange={(v) => setCustomFrom(v.at)} testID="input-stats-from" />
            </View>
            <View style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
              <DateTimeField label="To" mode="date" value={{ at: customTo, tz: 'UTC' }} onChange={(v) => setCustomTo(v.at)} testID="input-stats-to" />
            </View>
          </View>
        ) : null}
      </Card>

      <Section title={`Training Summary — ${range.label}`}>
        <Card testID="card-training-summary">
          <Row wrap gap={space.lg} style={{ marginBottom: space.md }}>
            <Counter label="Events / Classes" value={training.events + training.classes} testID="stat-events" />
            <Counter label="Exercises" value={training.exercises} testID="stat-exercises" />
            <Counter label="Hours" value={training.hours} testID="stat-hours" />
            <Counter label="Class Hours" value={training.classHours} testID="stat-class-hours" />
          </Row>
          <View style={desktop ? { flexDirection: 'row', gap: space.xl } : { gap: space.lg }}>
            <View style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
              <BarChart title="Hours Trained by patrol type" bars={training.byBucket} unit="hours" testID="chart-hours-by-type" emptyText="No training hours in this range." />
            </View>
            <View style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
              <BarChart title="Hours Trained by dog" bars={training.byDog} unit="hours" testID="chart-hours-by-dog" emptyText="No training hours in this range." />
            </View>
          </View>
          <Muted style={{ marginTop: space.md }}>
            Hours come from each completion&apos;s start and end time, falling back to the event duration. A scenario with more than one
            patrol type counts once, under Scenario (multiple), so the buckets add up to the total.
          </Muted>
        </Card>
      </Section>

      <Section title={`Detection — ${range.label}`}>
        <Card testID="card-detection-summary">
          <Row wrap gap={space.lg}>
            <Counter label="Detection exercises" value={detection.exercises} testID="stat-detection-exercises" />
            <Counter label="Hides placed" value={detection.hides} testID="stat-detection-hides" />
            <Counter label="Controlled negatives" value={detection.controlledNegatives} testID="stat-detection-negatives" />
            <Counter label="Blind" value={detection.blindPct == null ? '—' : `${detection.blindPct}%`} testID="stat-detection-blind" />
          </Row>
          <Muted style={{ marginTop: space.md }} testID="text-detection-note">
            Blind % counts only the completions where the blind question was actually answered ({detection.blindYes} of {detection.blindAnswered} answered).
            Finds per hide are not captured on a training completion in v1, so no find rate is shown — and by design there is no accuracy statistic anywhere.
          </Muted>
        </Card>
      </Section>

      <Section title={`Deployment Summary — ${range.label}`}>
        <Card testID="card-deployment-summary">
          <Row wrap gap={space.lg} style={{ marginBottom: space.md }}>
            <Counter label="Patrol" value={deploy.patrol} testID="stat-deploy-patrol" />
            <Counter label="Detection" value={deploy.detection} testID="stat-deploy-detection" />
            <Counter label="Arrests" value={deploy.arrests} testID="stat-deploy-arrests" />
            <Counter label={deploy.seizureIncidents === 1 ? 'Seizure Incident' : 'Seizure Incidents'} value={deploy.seizureIncidents} testID="stat-deploy-seizures" />
          </Row>
          <StackedBar title="Total Deployments" a={{ label: 'Patrol', value: deploy.patrol }} b={{ label: 'Detection', value: deploy.detection }} testID="chart-total-deployments" />
          <View style={[desktop ? { flexDirection: 'row', gap: space.xl } : { gap: space.lg }, { marginTop: space.lg }]}>
            <View style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
              <BarChart title="Deployments by outcome" bars={deploy.byOutcome} unit="deployments" testID="chart-deployments-by-outcome" tone="accent" />
            </View>
            <View style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
              <BarChart title="Deployments by reason" bars={deploy.byReason} unit="deployments" testID="chart-deployments-by-reason" tone="accent" />
            </View>
          </View>
        </Card>
      </Section>

      {user ? <Muted testID="text-stats-scope">Counts cover {role === 'handler' ? 'your own records' : 'every handler you manage'}.</Muted> : null}
    </Screen>
  );
}

function Counter({ label, value, testID }: { label: string; value: number | string; testID: string }) {
  return (
    <View style={{ minWidth: 120 }} testID={testID}>
      <Text variant="h1">{typeof value === 'number' ? value : value}</Text>
      <Muted>{label}</Muted>
    </View>
  );
}
