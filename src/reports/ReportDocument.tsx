// ReportDocument — assembles one printable report: header (app name, who/which dog/which agency,
// the filter line), the body for the chosen type, and the "printed by … Page x of y" footer.
// It is deliberately dumb about data access: the screen hands it the snapshots it already has.
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { APP_NAME } from '@/config';
import type { Role, User } from '@/db/types';
import { splitByHandler } from '@/features/reports/aggregate';
import { REPORT_TITLE, isKnownType, isSingleRecord, type ReportParams } from '@/features/reports/params';
import { indexById, type ReportSet, type ReportSource } from '@/features/reports/select';
import { Muted, Text, space } from '@/ui';
import { Band, PageBreak, ReportFooter, ReportHeader, ReportSheet } from './chrome';
import { longDateTime, mediumDate } from './fieldPrint';
import { FullClassReport, FullDeploymentReport, FullExerciseReport, type FullRecordDeps } from './fullRecord';
import {
  DeploymentLogReport, DeploymentSummaryReport, ExerciseLogReport, NotReviewedReport, OdorListReport,
  TrainingSummaryReport, VetReportView,
} from './summaries';

export interface ReportDocumentProps {
  params: ReportParams;
  src: ReportSource;
  set: ReportSet;
  viewer: User | null;
  role: Role | null;
  showDemographics: boolean;
  /** Department / agency name printed in the header line and the badge. */
  agency: string;
  /** Department Logo from Profile → Department (PT-PRO-05); null prints the shield mark instead. */
  logoUri?: string | null;
  /** Screen-only Page Width choice; null = fill the container. Print always uses the paper width. */
  sheetMaxWidth?: number | null;
}

export function ReportDocument({ params, src, set, viewer, role, showDemographics, agency, logoUri, sheetMaxWidth }: ReportDocumentProps) {
  const userById = useMemo(() => indexById(src.users), [src.users]);
  const dogById = useMemo(() => indexById(src.dogs), [src.dogs]);
  const deps: FullRecordDeps = { users: src.users, dogs: src.dogs, tracks: src.tracks, trainerComments: src.trainerComments, showDemographics };

  const known = isKnownType(params.type);
  const title = known ? REPORT_TITLE[params.type] || 'Report' : 'Report Type Not Recognised';
  const printedBy = viewer?.name || 'K9 handler';
  const printedAt = longDateTime(new Date().toISOString());

  // A Full Record type opened from one record row prints that record; run from the dialog with no id
  // it prints EVERY record in range, one per page — the court-history packet (PT-RPT-22).
  const single = isSingleRecord(params.type) && !!params.id;
  const lines = single
    ? singleRecordLines(params, src, viewer, agency)
    : multiRecordLines(params, set, src, viewer, agency, role);

  return (
    <View>
      <ReportSheet maxWidth={sheetMaxWidth === undefined ? undefined : sheetMaxWidth}>
        <ReportHeader title={title} lines={lines} badgeLabel={agency || APP_NAME} logoUri={logoUri} />
        <View style={{ marginTop: space.sm }}>
          <ReportBody params={params} src={src} set={set} deps={deps} showDemographics={showDemographics} userById={userById} dogById={dogById} />
        </View>
        <ReportFooter printedBy={printedBy} agency={agency} printedAt={printedAt} />
      </ReportSheet>
    </View>
  );
}

function singleRecordLines(params: ReportParams, src: ReportSource, viewer: User | null, agency: string): string[] {
  const nameOf = (id: string | null | undefined) => (id ? src.users.find((u) => u.id === id)?.name || '' : '');
  const dogNameOf = (id: string | null | undefined) => (id ? src.dogs.find((d) => d.id === id)?.name || '' : '');
  if (params.type === 'full_exercise') {
    const c = src.completions.find((x) => x.id === params.id);
    const ex = src.exercises.find((x) => x.id === (c?.exercise_id || params.id));
    const ev = src.events.find((e) => e.id === (c?.event_id || ex?.event_id));
    const handler = nameOf(c?.handler_id) || viewer?.name || '';
    const dog = dogNameOf(c?.dog_id);
    return [
      ex?.name || 'Exercise',
      [handler, dog ? `and K9 ${dog}` : '', agency ? `, ${agency}` : ''].filter(Boolean).join(' ').replace(' ,', ','),
      longDateTime(c?.start_at || ev?.starts_at, c?.tz || ev?.tz),
    ];
  }
  if (params.type === 'full_deployment') {
    const d = src.deployments.find((x) => x.id === params.id);
    const handler = nameOf(d?.handler_id) || viewer?.name || '';
    const dog = dogNameOf(d?.dog_id);
    return [
      `Case: ${d?.case_number || 'N/A'}`,
      // "<Handler> and K9 <Dog> at <requesting unit>, <Agency>" — the requesting agency belongs on the
      // byline, not only in the Overview block.
      [handler, dog ? `and K9 ${dog}` : '', d?.requesting_unit ? `at ${d.requesting_unit}` : '', agency ? `, ${agency}` : '']
        .filter(Boolean).join(' ').replace(' ,', ','),
      longDateTime(d?.occurred_at, d?.tz),
    ];
  }
  const cl = src.classes.find((x) => x.id === params.id);
  return [
    cl?.title || 'Class',
    [nameOf(cl?.owner_user_id) || viewer?.name || '', agency ? `, ${agency}` : ''].filter(Boolean).join('').replace(' ,', ','),
    longDateTime(cl?.occurred_at, cl?.tz),
  ];
}

function multiRecordLines(params: ReportParams, set: ReportSet, src: ReportSource, viewer: User | null, agency: string, role: Role | null): string[] {
  const dogNames = params.dog
    ? [src.dogs.find((d) => d.id === params.dog)?.name || '']
    : [...new Set(set.dogIds.map((id) => src.dogs.find((d) => d.id === id)?.name || ''))].filter(Boolean);
  const handlerNames = set.handlerIds.map((id) => src.users.find((u) => u.id === id)?.name || '').filter(Boolean);
  const isGroup = (role === 'supervisor' || role === 'trainer') && handlerNames.length > 0;
  const who = isGroup
    ? `Group Report for ${handlerNames.length} Handler${handlerNames.length === 1 ? '' : 's'}${agency ? `, ${agency}` : ''}`
    : `${viewer?.name || 'Handler'}${dogNames.length ? ` and K9 ${dogNames.join(', ')}` : ''}${agency ? `, ${agency}` : ''}`;
  const rangeText = params.from || params.to
    ? `from ${params.from ? mediumDate(`${params.from}T12:00:00.000Z`, 'UTC') : 'the first record'} to ${params.to ? mediumDate(`${params.to}T12:00:00.000Z`, 'UTC') : 'today'}`
    : set.firstAt && set.lastAt
      ? `from ${mediumDate(set.firstAt)} to ${mediumDate(set.lastAt)}`
      : 'with no records in range';
  const mode = params.mode === 'custom' ? 'Using the' : 'Using all';
  const filters = [
    params.dog ? `Dog: ${dogNames[0] || params.dog}` : 'All dogs',
    params.handler ? `Handler: ${src.users.find((u) => u.id === params.handler)?.name || params.handler}` : null,
  ].filter(Boolean).join(' · ');
  return [who, `${mode} ${set.total} Records ${rangeText}`, filters];
}

function UnknownTypeNotice({ type }: { type: string }) {
  return (
    <View testID="report-unknown-type">
      <Band title="REPORT TYPE NOT RECOGNISED">
        <Text style={{ color: '#1E1E1C' }} testID="txt-unknown-type">
          “{type || '(blank)'}” is not a report this app knows how to print, so nothing has been drawn — the
          figures below would otherwise belong to a different report than the one you asked for.
        </Text>
        <Muted style={{ marginTop: space.xs }}>
          Start again from New report and pick a type from the list.
        </Muted>
      </Band>
    </View>
  );
}

/** Every selected record printed in full, one per page — the court-history packet. */
function BatchRecords<T>({ rows, render, keyOf, testID, label }: {
  rows: T[]; render: (row: T) => React.ReactNode; keyOf: (row: T) => string; testID: string; label: string;
}) {
  if (!rows.length) return <Muted testID="report-empty">No {label}s match these filters.</Muted>;
  return (
    <View testID={testID}>
      <Muted testID="txt-batch-count" style={{ marginBottom: space.sm }}>
        {rows.length} {label}{rows.length === 1 ? '' : 's'}, printed in full — one record per page.
      </Muted>
      {rows.map((row, i) => (
        <View key={keyOf(row)}>
          {i > 0 ? <PageBreak /> : null}
          {render(row)}
        </View>
      ))}
    </View>
  );
}

function ReportBody({ params, src, set, deps, showDemographics, userById }: {
  params: ReportParams; src: ReportSource; set: ReportSet; deps: FullRecordDeps; showDemographics: boolean;
  userById: Map<string, User>; dogById: Map<string, { id: string; name: string }>;
}) {
  switch (params.type) {
    case 'full_exercise': {
      if (!params.id) {
        return (
          <BatchRecords
            testID="report-full-exercise-batch"
            rows={set.completions}
            label="training record"
            render={(completion) => (
              <FullExerciseReport
                completion={completion}
                exercise={src.exercises.find((e) => e.id === completion.exercise_id) || null}
                event={src.events.find((e) => e.id === completion.event_id) || null}
                deps={deps}
              />
            )}
            keyOf={(c) => c.id}
          />
        );
      }
      const completion = src.completions.find((c) => c.id === params.id) || src.completions.find((c) => c.exercise_id === params.id) || null;
      const exercise = src.exercises.find((e) => e.id === (completion?.exercise_id || params.id)) || null;
      const event = src.events.find((e) => e.id === (completion?.event_id || exercise?.event_id)) || null;
      return <FullExerciseReport completion={completion} exercise={exercise} event={event} deps={deps} />;
    }
    case 'full_deployment':
      if (!params.id) {
        return (
          <BatchRecords
            testID="report-full-deployment-batch"
            rows={set.deployments}
            label="deployment record"
            render={(d) => <FullDeploymentReport deployment={d} deps={deps} />}
            keyOf={(d) => d.id}
          />
        );
      }
      return <FullDeploymentReport deployment={src.deployments.find((d) => d.id === params.id) || null} deps={deps} />;
    case 'full_class':
      if (!params.id) {
        return (
          <BatchRecords
            testID="report-full-class-batch"
            rows={set.classes}
            label="class record"
            render={(cl) => <FullClassReport record={cl} deps={deps} />}
            keyOf={(cl) => cl.id}
          />
        );
      }
      return <FullClassReport record={src.classes.find((c) => c.id === params.id) || null} deps={deps} />;
    case 'deployment_summary':
      return <DeploymentSummaryReport src={src} set={set} showDemographics={showDemographics} />;
    case 'exercise_log':
      return <ExerciseLogReport src={src} set={set} />;
    case 'deployment_log':
      return <DeploymentLogReport src={src} set={set} />;
    case 'exercise_odor_list':
      return <OdorListReport src={src} set={set} />;
    case 'vet_visit':
      return <VetReportView src={src} set={set} />;
    case 'vaccination_summary':
      return <VetReportView src={src} set={set} vaccinationOnly />;
    case 'not_reviewed_list':
      return <NotReviewedReport src={src} set={set} />;
    case 'training_summary_by_handler': {
      const groups = splitByHandler(set);
      if (!groups.length || !set.total) return <Muted testID="report-empty">No records match these filters.</Muted>;
      return (
        <View testID="report-training-summary-by-handler">
          {groups.map((g, i) => (
            <View key={g.handlerId || i}>
              {i > 0 ? <PageBreak /> : null}
              <Band title={`HANDLER: ${(userById.get(g.handlerId)?.name || 'Unknown handler').toUpperCase()}`} testID={`handler-group-${i}`} />
              <TrainingSummaryReport src={src} set={g.set} />
            </View>
          ))}
        </View>
      );
    }
    case 'training_summary':
      return <TrainingSummaryReport src={src} set={set} />;
    default:
      // An unrecognised ?type= must SAY so. Silently drawing the training summary under a made-up
      // title puts one report's numbers under another report's name — the worst kind of wrong.
      return <UnknownTypeNotice type={params.type} />;
  }
}
