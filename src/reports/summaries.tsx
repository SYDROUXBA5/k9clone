// Summary / log reports — Training Summary, Deployment Summary (with the day×hour heatmap),
// Exercise Log, Deployment Log, Exercise Odor List, Vet / Vaccination and the supervisor variants.
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Muted, Text, space, useColors } from '@/ui';
import {
  deploymentSummary, exerciseLog, notReviewedList, odorList, trainingSummary, vetReport,
  type DeploymentRow, type ExerciseLogRow, type OdorDetailRow, type OdorSummaryRow, type TrainingSummaryRow,
} from '@/features/reports/aggregate';
import type { ReportSet, ReportSource } from '@/features/reports/select';
import { fmtShortDate, fmtShortDateTime } from '@/features/records/format';
import { Band, BarChart, DonutChart, GroupedBarChart, Heatmap, KVBlock, NoteLine, ReportTable, StatGrid, dataAttr } from './chrome';
import { EM, hoursLabel, mediumDate } from './fieldPrint';

/** On-screen row cap — printing and CSV always carry every row (the note under the table says so). */
export const SCREEN_ROW_CAP = 250;

const h = (min: number) => `${(min / 60).toFixed(1)} h`;
const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------------------------------------
export function TrainingSummaryReport({ src, set }: { src: ReportSource; set: ReportSet }) {
  const s = trainingSummary(src, set);
  return (
    <View testID="report-training-summary">
      <Band title="OVERVIEW">
        <StatGrid
          testID="stats-training"
          stats={[
            { label: 'Total Training Time', value: h(s.totalTrainingMin), testID: 'stat-total-training-time' },
            { label: 'Events Attended', value: s.eventsAttended, testID: 'stat-events-attended' },
            { label: 'Events With Training', value: s.eventsWithTraining, testID: 'stat-events-with-training' },
            { label: 'Performed Detection Exercises', value: s.performedDetection, testID: 'stat-performed-detection' },
            { label: 'Performed Patrol Exercises', value: s.performedPatrol, testID: 'stat-performed-patrol' },
            { label: 'Classes Attended', value: s.classesAttended, testID: 'stat-classes-attended' },
            { label: 'Total Event Duration', value: h(s.totalEventMin), testID: 'stat-total-event-duration' },
            { label: 'Avg. Event Time', value: s.avgEventMin != null ? h(s.avgEventMin) : EM, testID: 'stat-avg-event-time' },
            { label: 'Total Class Duration', value: h(s.totalClassMin), testID: 'stat-total-class-duration' },
          ]}
        />
      </Band>

      <Band title="TRAINING HOURS BY PATROL TYPE">
        <BarChart testID="chart-hours-by-type" data={s.hoursByType.map((r) => ({ key: r.key, value: r.hours, note: `${r.hours.toFixed(1)} h` }))} unit="h" />
        <NoteLine>Scenario exercises split their time evenly across the patrol types they carry.</NoteLine>
      </Band>

      <Band title="TRAINING BY DAY OF WEEK">
        <BarChart testID="chart-by-day" data={s.byDayOfWeek.map((r) => ({ key: r.key, value: r.hours, note: `${r.hours.toFixed(1)} h` }))} />
      </Band>

      <Band title="TRAINING BY WEEK">
        <BarChart testID="chart-by-week" data={s.byWeek.map((r) => ({ key: r.key, value: r.hours, note: `${r.hours.toFixed(1)} h` }))} />
      </Band>

      <Band title="TRAINING BY MONTH">
        <BarChart testID="chart-by-month" data={s.byMonth.map((r) => ({ key: r.key, value: r.hours, note: `${r.hours.toFixed(1)} h` }))} />
      </Band>

      <Band title="DETECTION TOTALS">
        <KVBlock
          testID="detection-totals"
          items={[
            { label: 'Detection Exercises', value: String(s.detection.exercises), testID: 'kv-detection-exercises' },
            { label: 'Hides Placed', value: String(s.detection.hides), testID: 'kv-detection-hides' },
            { label: 'Blind Exercises', value: String(s.detection.blind), testID: 'kv-detection-blind' },
            { label: 'Known Exercises', value: String(s.detection.known), testID: 'kv-detection-known' },
            { label: 'Blind Not Answered', value: String(s.detection.unanswered) },
            { label: 'Blank / Controlled Negatives', value: String(s.detection.controlledNegatives), testID: 'kv-detection-controlled-negative' },
            { label: 'Finds', value: s.detection.finds != null ? String(s.detection.finds) : EM },
            { label: 'False Alerts', value: s.detection.falseAlerts != null ? String(s.detection.falseAlerts) : EM },
          ]}
        />
        <DonutChart
          testID="chart-blind-split"
          title="Blind vs known detection exercises"
          data={[{ key: 'Blind', value: s.detection.blind }, { key: 'Known', value: s.detection.known }, { key: 'Not answered', value: s.detection.unanswered }]}
        />
        <DonutChart
          testID="chart-controlled-negative"
          title="Blank / controlled negatives"
          data={[
            { key: 'Blank / Controlled Negative', value: s.detection.controlledNegatives },
            { key: 'Odor Placed', value: Math.max(0, s.detection.exercises - s.detection.controlledNegatives) },
          ]}
        />
        <NoteLine testID="note-finds">
          Finds and false alerts print “—”: this data set records the hides placed and the outcome per exercise, not a per-hide find/alert count.
        </NoteLine>
      </Band>

      <Band title="COMPLETION STATES">
        <BarChart
          testID="chart-performed"
          data={[
            { key: 'Exercises Performed', value: s.performedCounts.performed },
            { key: 'Excused From Performing', value: s.performedCounts.excused },
            { key: 'Unable to Perform', value: s.performedCounts.unable },
            { key: 'Incomplete Records', value: s.performedCounts.incomplete },
          ]}
        />
      </Band>

      {s.tagCounts.length ? (
        <Band title="TAG COUNTS">
          <BarChart testID="chart-tags" data={s.tagCounts.map((t) => ({ key: t.key, value: t.count }))} />
        </Band>
      ) : null}

      <Band title="EXERCISE LIST">
        <ReportTable<TrainingSummaryRow>
          testID="table-training-exercises"
          maxRows={SCREEN_ROW_CAP}
          columns={[
            { key: 'date', title: 'Date', width: 160, render: (r) => fmtShortDateTime(r.at, r.tz) },
            { key: 'dog', title: 'Dog', width: 90, render: (r) => r.dogName },
            { key: 'handler', title: 'Handler', width: 130, render: (r) => r.handlerName },
            { key: 'ex', title: 'Exercise Name', width: 200, render: (r) => r.exerciseName },
            { key: 'type', title: 'Type', width: 210, render: (r) => r.type },
            { key: 'perf', title: 'Performed', width: 170, render: (r) => r.performed },
            { key: 'blind', title: 'Blind', width: 70, render: (r) => r.blind },
            { key: 'dur', title: 'Duration', width: 90, render: (r) => hoursLabel(r.minutes) },
            { key: 'rev', title: 'Review', width: 120, render: (r) => r.review },
          ]}
          rows={s.exercises}
          keyOf={(r) => r.id}
        />
      </Band>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
export function DeploymentSummaryReport({ src, set, showDemographics }: { src: ReportSource; set: ReportSet; showDemographics: boolean }) {
  const s = deploymentSummary(src, set);
  return (
    <View testID="report-deployment-summary">
      <Band title="OVERVIEW">
        <StatGrid
          testID="stats-deployment"
          stats={[
            { label: 'Total Deployments', value: s.total, testID: 'stat-total-deployments' },
            { label: 'Detection Deployments', value: s.detectionCount, testID: 'stat-detection-deployments' },
            { label: 'Patrol Deployments', value: s.patrolCount, testID: 'stat-patrol-deployments' },
            { label: 'Dog Not Deployed / Cancelled', value: s.notPerformed, testID: 'stat-not-performed' },
            { label: 'Dog-Assisted Arrests', value: s.outcomes.arrests, testID: 'stat-arrests' },
          ]}
        />
        <NoteLine testID="note-not-performed">
          {s.notPerformed} of these requests did not put the dog to work (not deployed at scene, or cancelled enroute); those do not contribute to the dog’s deployment statistics.
        </NoteLine>
      </Band>

      <Band title="DEPLOYMENTS BY DAY OF THE WEEK AND HOUR">
        <Heatmap heat={s.heat} max={s.heatMax} dayTotals={s.dayTotals} />
      </Band>

      <Band title="DEPLOYMENTS BY DAY OF WEEK">
        <BarChart testID="chart-deployments-by-day" showPercent={false} data={s.byDayOfWeek.map((r) => ({ key: r.key, value: r.count }))} />
      </Band>

      <Band title="DEPLOYMENTS BY WEEK">
        <BarChart testID="chart-deployments-by-week" showPercent={false} data={s.byWeek.map((r) => ({ key: r.key, value: r.count }))} />
      </Band>

      <Band title="DEPLOYMENTS BY MONTH">
        <BarChart testID="chart-deployments-by-month" showPercent={false} data={s.byMonth.map((r) => ({ key: r.key, value: r.count }))} />
      </Band>

      <Band title="REQUEST FULFILMENT">
        <DonutChart testID="chart-fulfillment" data={s.byFulfillment.map((r) => ({ key: r.key, value: r.count }))} />
      </Band>

      <Band title="TOP 25 REQUESTING AGENCIES">
        <DonutChart testID="chart-requesting" data={s.byRequestingUnit.map((r) => ({ key: r.key, value: r.count }))} />
      </Band>

      <Band title="DEPLOYMENT CATEGORIES">
        <DonutChart testID="chart-categories" data={s.byCategory.map((r) => ({ key: r.key, value: r.count }))} />
        <NoteLine>Patrol Types below break down the patrol records only.</NoteLine>
      </Band>

      <Band title="PATROL TYPES">
        <DonutChart testID="chart-patrol-types" data={s.byPatrolType.map((r) => ({ key: r.key, value: r.count }))} />
      </Band>

      <Band title="REASON FOR DEPLOYMENT">
        <BarChart testID="chart-reasons" data={s.byReason.slice(0, 12).map((r) => ({ key: r.key, value: r.count }))} />
      </Band>

      <Band title={`OUTCOMES FOR ${s.outcomes.peopleFound} PEOPLE FOUND`}>
        <DonutChart
          testID="chart-outcomes"
          data={[
            { key: 'Arrests With Bites', value: s.outcomes.arrestsWithBites },
            { key: 'Arrests Without Bites', value: s.outcomes.arrestsWithoutBites },
            { key: 'Not Bitten Or Arrested', value: s.outcomes.notBittenOrArrested },
            { key: 'Unintentional Bites', value: s.outcomes.unintentionalBites },
          ]}
        />
      </Band>

      <Band title="DETECTION STATISTICS">
        <BarChart
          testID="chart-detection-stats"
          showPercent={false}
          data={[
            { key: 'Deployments', value: s.detectionStats.deployments },
            { key: 'Environments', value: s.detectionStats.environments },
            { key: 'Indications', value: s.detectionStats.indications },
            { key: 'Items Seized', value: s.detectionStats.itemsSeized },
            { key: 'Arrests', value: s.detectionStats.arrests },
          ]}
        />
        <NoteLine testID="note-detection-stats">
          Indications counts alerts; Items Seized counts the seizures recorded against them.
          {s.detectionStats.indications
            ? ` ${s.indicationsWithSeizures} of ${s.detectionStats.indications} indication${s.detectionStats.indications === 1 ? '' : 's'} produced at least one seizure.`
            : ''}
        </NoteLine>
      </Band>

      <Band title="DETECTION ENVIRONMENTS">
        <GroupedBarChart
          testID="chart-detection-environments"
          series={['Searched', 'Indicated On']}
          groups={s.detectionEnvironments.map((r) => ({ key: r.key, values: [r.searched, r.indicated] }))}
        />
      </Band>

      <Band title="CURRENCY INDICATION RATIO">
        <DonutChart
          testID="chart-currency-ratio"
          data={[
            { key: 'Indicated On Currency', value: s.currency.indicated },
            { key: 'No Currency Indication', value: s.currency.notIndicated },
          ]}
        />
        <NoteLine testID="note-currency-ratio">
          Each of the {s.detectionStats.deployments} detection deployment{s.detectionStats.deployments === 1 ? '' : 's'} in range is counted once.
        </NoteLine>
        {s.currency.indicated ? (
          <NoteLine testID="note-currency-total">
            {s.currency.totalAmount.toLocaleString('en-US')} {s.currency.currencyType} indicated on across {s.currency.indicated} deployment{s.currency.indicated === 1 ? '' : 's'}.
          </NoteLine>
        ) : null}
      </Band>

      {s.indicationsByCategory.map((cat, i) => (
        <Band key={cat.category} title={`${cat.category.toUpperCase()} INDICATIONS — SEIZURES BY ODOR TYPE`} testID={`band-indications-${slug(cat.category)}`}>
          {/* The arithmetic that governs ALL the odor bands is stated once, on the first of them —
              repeating it under every band made the sheet argue with itself. */}
          {i === 0 ? (
            <NoteLine testID="note-indications-basis">
              Bars below count seizure incidents, not indications: the odor bands on this page total the {s.detectionStats.itemsSeized} Items
              Seized above, and cannot be added together as indications because one indication can produce more than one category.
            </NoteLine>
          ) : null}
          <BarChart
            testID={`chart-indications-${slug(cat.category)}`}
            showPercent={false}
            data={cat.rows.map((r) => ({ key: r.key, value: r.count, note: r.note }))}
          />
          <NoteLine testID={`note-indications-${slug(cat.category)}`}>
            {cat.indications} of {s.detectionStats.indications} indication{s.detectionStats.indications === 1 ? '' : 's'} in range produced {cat.category.toLowerCase()}.
          </NoteLine>
          {cat.packaging.map((p) => (
            <View key={p.odorType} {...dataAttr('k9Block')} style={{ marginTop: space.sm }}>
              <Text variant="bodyStrong" style={{ color: '#1E1E1C' }}>Packaging Around {p.odorType}</Text>
              {p.rows.map((r) => (
                <Text key={r.key} style={{ color: '#1E1E1C' }} testID={`packaging-${slug(cat.category)}-${slug(p.odorType)}-${slug(r.key)}`}>
                  {r.key}: {r.count}
                </Text>
              ))}
            </View>
          ))}
        </Band>
      ))}

      {s.tagCounts.length ? (
        <Band title="TAG COUNTS">
          <BarChart testID="chart-deployment-tags" data={s.tagCounts.map((t) => ({ key: t.key, value: t.count }))} />
        </Band>
      ) : null}

      {showDemographics ? (
        <Band title="ARREST DEMOGRAPHICS" testID="band-demographics">
          <BarChart testID="chart-demo-age" title="Age" data={s.demographics.ages.map((r) => ({ key: r.key, value: r.count }))} />
          <BarChart testID="chart-demo-sex" title="Sex At Birth" data={s.demographics.sexes.map((r) => ({ key: r.key, value: r.count }))} />
          <BarChart testID="chart-demo-race" title="Race / Ethnicity" data={s.demographics.races.map((r) => ({ key: r.key, value: r.count }))} />
          <NoteLine>{s.demographics.total} arrest{s.demographics.total === 1 ? '' : 's'} in range.</NoteLine>
        </Band>
      ) : (
        <Band title="ARREST DEMOGRAPHICS" testID="band-demographics-hidden">
          <Muted testID="note-demographics-hidden">Demographic arrest data is collected but hidden in reports — Profile → Report Options controls this.</Muted>
        </Band>
      )}

      <Band title="DEPLOYMENT LIST">
        <DeploymentRows rows={s.rows} />
      </Band>
    </View>
  );
}

function DeploymentRows({ rows }: { rows: DeploymentRow[] }) {
  return (
    <ReportTable<DeploymentRow>
      testID="table-deployments"
      maxRows={SCREEN_ROW_CAP}
      columns={[
        { key: 'case', title: 'Case Number', width: 130, render: (r) => r.caseNumber },
        { key: 'date', title: 'Date', width: 160, render: (r) => fmtShortDateTime(r.at, r.tz) },
        { key: 'dog', title: 'Dog', width: 90, render: (r) => r.dogName },
        { key: 'handler', title: 'Handler', width: 130, render: (r) => r.handlerName },
        { key: 'cat', title: 'Category', width: 110, render: (r) => (r.kind === 'detection' ? 'Detection' : 'Patrol') },
        { key: 'unit', title: 'Requesting Agency', width: 190, render: (r) => r.requestingUnit },
        { key: 'ful', title: 'Fulfillment', width: 200, render: (r) => r.fulfillment },
        { key: 'arr', title: 'Arrests', width: 90, render: (r) => String(r.arrests) },
        { key: 'rev', title: 'Review', width: 120, render: (r) => r.review },
      ]}
      rows={rows}
      keyOf={(r) => r.id}
    />
  );
}

// ---------------------------------------------------------------------------------------------
export function ExerciseLogReport({ src, set }: { src: ReportSource; set: ReportSet }) {
  const { rows, counts } = exerciseLog(src, set);
  return (
    <View testID="report-exercise-log">
      <Band title="COMPLETED EXERCISE RECORDS">
        <BarChart
          testID="chart-completed"
          data={[
            { key: 'Exercises Performed', value: counts.performed },
            { key: 'Excused From Performing', value: counts.excused },
            { key: 'Unable to Perform', value: counts.unable },
          ]}
        />
      </Band>
      <Band title="INCOMPLETE EXERCISE RECORDS">
        <BarChart testID="chart-incomplete" data={[{ key: 'Incomplete Records', value: counts.incomplete }]} />
      </Band>
      <Band title="EXERCISES">
        <ReportTable<ExerciseLogRow>
          testID="table-exercise-log"
          maxRows={SCREEN_ROW_CAP}
          columns={[
            { key: 'date', title: 'Date', width: 160, render: (r) => fmtShortDateTime(r.at, r.tz) },
            { key: 'loc', title: 'Location', width: 200, render: (r) => r.location },
            { key: 'name', title: 'Exercise Name', width: 190, render: (r) => r.exerciseName },
            { key: 'type', title: 'Type', width: 150, render: (r) => r.type },
            { key: 'desc', title: 'Description', width: 260, render: (r) => r.description },
            { key: 'status', title: 'Status', width: 170, render: (r) => r.status },
          ]}
          rows={rows}
          keyOf={(r) => r.id}
        />
      </Band>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
export function DeploymentLogReport({ src, set }: { src: ReportSource; set: ReportSet }) {
  const s = deploymentSummary(src, set);
  const c = useColors();
  return (
    <View testID="report-deployment-log">
      <Band title="DEPLOYMENTS">
        <ReportTable<DeploymentRow>
          testID="table-deployment-log"
          maxRows={SCREEN_ROW_CAP}
          groups={[
            { title: '', span: 2 },
            { title: 'DETECTION', span: 3, color: c.primary },
            { title: 'PATROL', span: 3, color: c.accent },
          ]}
          columns={[
            { key: 'case', title: 'Case Number', width: 130, render: (r) => r.caseNumber },
            { key: 'date', title: 'Date', width: 160, render: (r) => fmtShortDateTime(r.at, r.tz) },
            { key: 'env', title: 'Environ-ments', width: 120, render: (r) => (r.kind === 'detection' ? String(r.environments) : '-'), align: 'right' },
            { key: 'ind', title: 'Alerts / Indications', width: 150, render: (r) => (r.kind === 'detection' ? String(r.indications) : '-'), align: 'right' },
            { key: 'items', title: 'Items Seized', width: 120, render: (r) => (r.kind === 'detection' ? String(r.itemsSeized) : '-'), align: 'right' },
            // A request the dog never worked counts 0 deployments — the same rule the Deployment
            // Summary's not-performed note states, so the two reports cannot disagree.
            { key: 'dep', title: 'Deploy-ments', width: 110, render: (r) => (r.kind === 'patrol' ? (r.deployed ? '1' : '0') : '-'), align: 'right' },
            { key: 'bites', title: 'Arrests With Bites', width: 150, render: (r) => (r.kind === 'patrol' ? String(r.arrestsWithBites) : '-'), align: 'right' },
            { key: 'found', title: 'People Found', width: 130, render: (r) => (r.kind === 'patrol' ? (r.peopleFound != null ? String(r.peopleFound) : 'N/A') : '-'), align: 'right' },
          ]}
          rows={s.rows}
          keyOf={(r) => r.id}
        />
        {/* The legend only explains the conventions this table actually uses — a note about an N/A
            that never appears reads as a missing value the reader then goes hunting for. */}
        <NoteLine testID="note-deployment-log">
          A dash means the column does not apply to that deployment’s category.
          {s.rows.some((r) => r.caseNumber === 'N/A') ? ' Case numbers print N/A when the record has none.' : ''}
          {s.rows.some((r) => r.kind === 'patrol' && r.peopleFound == null) ? ' People Found prints N/A when the handler did not answer it.' : ''}
          {' '}A patrol request the dog did not work (not deployed at scene, or cancelled enroute) counts 0 deployments.
        </NoteLine>
      </Band>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
export function OdorListReport({ src, set }: { src: ReportSource; set: ReportSet }) {
  const { summary, details } = odorList(src, set);
  const targets = summary.filter((r) => r.role === 'Target Odor');
  const proofing = summary.filter((r) => r.role === 'Proofing Odor');
  // The description belongs to the ENVIRONMENT, not to each hide inside it, so the same sentence
  // lands on every row it produced. Print it where it is first said and point back to it after that.
  const firstDescriptionRow = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of details) if (r.description && r.description !== EM && !seen.has(r.description)) seen.set(r.description, r.id);
    return new Set(seen.values());
  }, [details]);
  const describe = (r: OdorDetailRow) =>
    (!r.description || r.description === EM || firstDescriptionRow.has(r.id)) ? r.description : '↑ as above';
  return (
    <View testID="report-odor-list">
      <Band title="TARGET ODORS">
        <OdorSummaryTable rows={targets} testID="table-target-odors" empty="No target odors were trained in this range." />
      </Band>
      <Band title="PROOFING ODORS">
        <OdorSummaryTable rows={proofing} testID="table-proofing-odors" empty="No proofing odors were trained in this range." />
      </Band>
      <Band title="ODORS USED, ONE ROW PER HIDE">
        <ReportTable<OdorDetailRow>
          testID="table-odor-detail"
          maxRows={SCREEN_ROW_CAP}
          columns={[
            { key: 'date', title: 'Date', width: 150, render: (r) => fmtShortDate(r.at, r.tz) },
            { key: 'dog', title: 'Dog', width: 90, render: (r) => r.dogName },
            { key: 'loc', title: 'Location', width: 190, render: (r) => r.location },
            { key: 'ex', title: 'Exercise Name', width: 180, render: (r) => r.exerciseName },
            { key: 'env', title: 'Environment', width: 180, render: (r) => r.environment },
            { key: 'odor', title: 'Odor Type', width: 140, render: (r) => r.odorType },
            { key: 'amt', title: 'Amount', width: 110, render: (r) => r.amount },
            { key: 'conc', title: 'Concealed', width: 190, render: (r) => r.concealed },
            { key: 'hxd', title: 'H × D', width: 100, render: (r) => r.hxd },
            { key: 'pack', title: 'Packaging', width: 150, render: (r) => r.packaging },
            { key: 'blind', title: 'Blind', width: 120, render: (r) => r.blind },
            { key: 'desc', title: 'Description', width: 230, render: describe },
          ]}
          rows={details}
          keyOf={(r) => r.id}
        />
        <NoteLine>The odor list covers detection exercises only — it is not available for deployments.</NoteLine>
      </Band>
    </View>
  );
}

function OdorSummaryTable({ rows, testID, empty }: { rows: OdorSummaryRow[]; testID: string; empty: string }) {
  return (
    <ReportTable<OdorSummaryRow>
      testID={testID}
      emptyText={empty}
      columns={[
        { key: 'dog', title: 'Dog', width: 100, render: (r) => r.dogName },
        { key: 'cat', title: 'Category', width: 150, render: (r) => r.category },
        { key: 'type', title: 'Odor Type', width: 170, render: (r) => r.type },
        { key: 'count', title: 'Times Trained', width: 130, render: (r) => String(r.count), align: 'right' },
        { key: 'last', title: 'Last Trained', width: 170, render: (r) => (r.lastTrainedAt ? fmtShortDate(r.lastTrainedAt, r.tz) : EM) },
      ]}
      rows={rows}
      keyOf={(r) => r.id}
    />
  );
}

// ---------------------------------------------------------------------------------------------
export function VetReportView({ src, set, vaccinationOnly }: { src: ReportSource; set: ReportSet; vaccinationOnly?: boolean }) {
  const v = vetReport(src, set);
  const c = useColors();
  const core = v.vaccinations.filter((x) => x.core);
  const other = v.vaccinations.filter((x) => !x.core);
  return (
    <View testID={vaccinationOnly ? 'report-vaccination-summary' : 'report-vet-visit'}>
      {!vaccinationOnly ? (
        <Band title="VETERINARY VISITS">
          <ReportTable
            testID="table-vet-visits"
            columns={[
              { key: 'date', title: 'Date', width: 160, render: (r) => fmtShortDate(r.visit.date, r.visit.tz) },
              { key: 'dog', title: 'Dog', width: 90, render: (r) => r.dogName },
              { key: 'name', title: 'Record', width: 200, render: (r) => r.visit.name || EM },
              { key: 'loc', title: 'Location', width: 220, render: (r) => r.visit.location || EM },
              { key: 'care', title: 'Care Types', width: 240, render: (r) => (r.visit.care_types || []).join(', ') || EM },
              { key: 'cost', title: 'Cost', width: 100, render: (r) => (r.visit.cost != null ? `$${r.visit.cost}` : EM), align: 'right' },
            ]}
            rows={v.visits}
            keyOf={(r) => r.visit.id}
            emptyText="No veterinary records in this range."
          />
          <NoteLine>Total recorded cost in range: ${v.totalCost}</NoteLine>
          {v.visits.filter((x) => x.visit.notes).map((x) => (
            <View key={x.visit.id} {...dataAttr('k9Block')} style={{ marginTop: space.sm }}>
              <Text variant="bodyStrong" style={{ color: '#1E1E1C' }}>{fmtShortDate(x.visit.date, x.visit.tz)} — {x.dogName}</Text>
              <Text style={{ color: '#1E1E1C' }}>{x.visit.notes}</Text>
            </View>
          ))}
        </Band>
      ) : null}

      <Band title="CORE VACCINATIONS">
        <VaccinationTable rows={core} testID="table-core-vaccinations" />
      </Band>
      <Band title="OTHER VACCINATIONS">
        <VaccinationTable rows={other} testID="table-other-vaccinations" />
      </Band>
      {v.vaccinations.some((x) => x.overdue) ? (
        <Text style={{ color: c.danger, marginTop: space.sm }} testID="txt-overdue-warning">
          {v.vaccinations.filter((x) => x.overdue).length} vaccination(s) are overdue.
        </Text>
      ) : null}
    </View>
  );
}

function VaccinationTable({ rows, testID }: { rows: { id: string; dogName: string; type: string; givenAt: string; nextDueAt: string | null; tz: string; overdue: boolean; dueInDays: number | null }[]; testID: string }) {
  const c = useColors();
  return (
    <ReportTable
      testID={testID}
      emptyText="No recorded vaccinations."
      columns={[
        { key: 'dog', title: 'Dog', width: 100, render: (r) => r.dogName },
        { key: 'type', title: 'Vaccination', width: 200, render: (r) => r.type },
        { key: 'given', title: 'Given', width: 160, render: (r) => mediumDate(r.givenAt, r.tz) },
        { key: 'due', title: 'Next due', width: 160, render: (r) => (r.nextDueAt ? mediumDate(r.nextDueAt, r.tz) : EM) },
        {
          key: 'status', title: 'Status', width: 160,
          render: (r) => (
            <Text style={{ color: r.overdue ? c.danger : r.dueInDays != null && r.dueInDays <= 30 ? c.warning : '#1E1E1C' }}>
              {r.overdue ? 'Overdue' : r.dueInDays != null ? `Due in ${r.dueInDays} days` : EM}
            </Text>
          ),
        },
      ]}
      rows={rows}
      keyOf={(r) => r.id}
    />
  );
}

// ---------------------------------------------------------------------------------------------
export function NotReviewedReport({ src, set }: { src: ReportSource; set: ReportSet }) {
  const rows = notReviewedList(src, set);
  const byHandler = new Map<string, typeof rows>();
  for (const r of rows) {
    const l = byHandler.get(r.handlerName);
    if (l) l.push(r); else byHandler.set(r.handlerName, [r]);
  }
  return (
    <View testID="report-not-reviewed">
      <Band title="SUMMARY">
        <StatGrid
          testID="stats-not-reviewed"
          stats={[
            { label: 'Records awaiting review', value: rows.length, testID: 'stat-not-reviewed-total' },
            { label: 'Handlers', value: byHandler.size, testID: 'stat-not-reviewed-handlers' },
          ]}
        />
      </Band>
      {rows.length === 0 ? <Muted testID="txt-all-reviewed">Every record in this range has been reviewed.</Muted> : null}
      {[...byHandler.entries()].map(([handler, list]) => (
        <Band key={handler} title={handler.toUpperCase()}>
          <ReportTable
            testID={`table-not-reviewed-${handler.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            columns={[
              { key: 'kind', title: 'Record Type', width: 140, render: (r) => r.kind },
              { key: 'title', title: 'Title', width: 240, render: (r) => r.title },
              { key: 'dog', title: 'Dog', width: 100, render: (r) => r.dogName },
              { key: 'date', title: 'Date', width: 170, render: (r) => fmtShortDateTime(r.at, r.tz) },
              { key: 'state', title: 'State', width: 140, render: (r) => r.state },
            ]}
            rows={list}
            keyOf={(r) => r.id}
          />
        </Band>
      ))}
    </View>
  );
}
