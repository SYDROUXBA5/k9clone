// Full Record reports — Exercise ("Training Report"), Deployment ("Deployment Report") and Class.
// Everything the record holds is printed: overview, odor placements, weather, patrol sections,
// arrests (demographics only when the user's Report Options allow), narrative, trainer comments,
// review state and rejection reason, plus the GPS track slot.
import React from 'react';
import { View } from 'react-native';
import type { ClassRecord, Completion, Deployment, Dog, Exercise, Track, TrainerComment, TrainingEvent, User } from '@/db/types';
import { DEMOGRAPHICS_CUTOVER, normalizeDetection } from '@/features/deployment/deploymentModel';
import { PATROL_SECTIONS } from '@/features/training/patrolSections';
import { Muted, Text, space, useColors } from '@/ui';
import { Band, KVBlock, NoteLine, ReportTable, dataAttr } from './chrome';
import { EM, blindLabel, handlerEnteredLabel, hoursLabel, longDateTime, sectionEntries, sectionValue, weatherLine, windLine, yesNo } from './fieldPrint';
import { TrackImage } from './TrackImage';

const REVIEW_TEXT = (row: { review: string; reviewed_by: string | null }, nameOf: (id: string | null) => string) =>
  row.review === 'reviewed' ? `Yes, by ${nameOf(row.reviewed_by) || 'a supervisor'}`
    : row.review === 'rejected' ? `Rejected by ${nameOf(row.reviewed_by) || 'a supervisor'}`
      : 'No';

export interface FullRecordDeps {
  users: User[];
  dogs: Dog[];
  tracks: Track[];
  trainerComments: TrainerComment[];
  /** Report Options → demographic arrest data in deployment reports. */
  showDemographics: boolean;
}

function nameLookup(users: User[]) {
  const m = new Map(users.map((u) => [u.id, u.name]));
  return (id: string | null | undefined) => (id ? m.get(id) || '' : '');
}

function TrainerComments({ comments, users, testID = 'trainer-comments' }: { comments: TrainerComment[]; users: User[]; testID?: string }) {
  const nameOf = nameLookup(users);
  if (!comments.length) return null;
  return (
    <View testID={testID} style={{ marginTop: space.sm }}>
      {comments.map((tc) => (
        <View key={tc.id} {...dataAttr('k9Block')} style={{ marginTop: space.xs }}>
          <Text variant="bodyStrong" style={{ color: '#1E1E1C' }}>Trainer {nameOf(tc.trainer_id) || 'comment'} provided the following comments:</Text>
          <Text style={{ color: '#1E1E1C' }}>{tc.text}</Text>
        </View>
      ))}
    </View>
  );
}

function RejectionBlock({ reason }: { reason: string | null }) {
  const c = useColors();
  if (!reason) return null;
  return (
    <View {...dataAttr('k9Block')} style={{ marginTop: space.sm, borderLeftWidth: 4, borderLeftColor: c.danger, paddingLeft: space.sm }} testID="report-rejection">
      <Text variant="bodyStrong" style={{ color: c.danger }}>Rejection Reason</Text>
      <Text style={{ color: '#1E1E1C' }}>{reason}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Exercise / Training Report
// ---------------------------------------------------------------------------------------------
export function FullExerciseReport({ completion, exercise, event, deps }: {
  completion: Completion | null; exercise: Exercise | null; event: TrainingEvent | null; deps: FullRecordDeps;
}) {
  const nameOf = nameLookup(deps.users);
  if (!exercise) return <Muted testID="report-missing">This exercise record could not be found. It may have been deleted.</Muted>;
  const dog = completion ? deps.dogs.find((d) => d.id === completion.dog_id) || null : null;
  const tz = completion?.tz || event?.tz || 'UTC';
  const odorEnvs = exercise.environments || [];
  const track = completion?.track_id ? deps.tracks.find((t) => t.id === completion.track_id) || null : null;
  const tcs = completion ? deps.trainerComments.filter((t) => t.record_type === 'completion' && t.record_id === completion.id) : [];

  return (
    <View testID="report-full-exercise">
      <Band title="OVERVIEW">
        <KVBlock
          testID="overview-exercise"
          items={[
            { label: 'Type', value: exercise.kind === 'detection' ? 'Detection Exercise' : `Patrol Exercise${exercise.patrol_types.length > 1 ? ' (Scenario)' : ''}` },
            { label: 'Event', value: event ? `${event.name} — ${longDateTime(event.starts_at, event.tz)}` : EM },
            { label: 'Venue', value: event?.location?.name || EM },
            { label: 'Address', value: event?.location?.address || [event?.location?.address_line1, event?.location?.city, event?.location?.region, event?.location?.postal_code].filter(Boolean).join(', ') || EM },
            { label: 'Exercise Monitor', value: completion?.monitor || exercise.monitor || EM },
            { label: 'Controlled Negative', value: exercise.kind === 'detection' ? yesNo(exercise.blank_controlled_negative) : EM },
            { label: 'Goal', value: exercise.goal || EM, wide: true },
          ]}
        />
      </Band>

      {exercise.kind === 'detection' && odorEnvs.length ? odorEnvs.map((env) => (
        <Band key={env.id} title={`${env.env_type || 'Environment'} Environments`}>
          <Text style={{ color: '#1E1E1C' }}>
            There were {env.count} {env.env_type || 'Environment'} environments of which the following contained odors.
          </Text>
          {env.description ? <Text style={{ color: '#6B6A66' }}>{env.description}</Text> : null}
          {(env.units || []).map((u) => (
            <View key={u.id} {...dataAttr('k9Block')} style={{ marginTop: space.sm }}>
              <Text variant="bodyStrong" style={{ color: '#1E1E1C', letterSpacing: 0.4 }}>{(u.name || 'UNIT').toUpperCase()}</Text>
              {(u.odors || []).map((o) => (
                <KVBlock
                  key={o.id}
                  testID={`odor-${o.id}`}
                  items={[
                    { label: 'Odor Type', value: o.type || EM },
                    { label: 'Amount', value: o.amount != null ? `${o.amount} ${o.unit || ''}`.trim() : EM },
                    { label: 'Category', value: dog && o.category && dog.odor_types.includes(o.category) ? `${o.category} (Target Odor)` : `${o.category || EM}${o.category ? ' (Proofing Odor)' : ''}` },
                    { label: 'Concealed Location', value: o.concealed || EM },
                    { label: 'Packaging', value: o.packaging || EM },
                    { label: 'Height, Depth', value: o.height_ft != null || o.depth_ft != null ? `${o.height_ft ?? EM} ft, ${o.depth_ft ?? EM} ft` : EM },
                    // No Description here: the description is carried on the ENVIRONMENT (OdorPlacement
                    // has no field of its own), and it is already printed once at the top of this band.
                    // Repeating it against every hide made one sentence look like several findings.
                  ]}
                />
              ))}
            </View>
          ))}
        </Band>
      )) : null}

      {exercise.kind === 'detection' && !odorEnvs.length ? (
        <Band title="ENVIRONMENTS">
          <Text style={{ color: '#1E1E1C' }}>{exercise.blank_controlled_negative ? 'Blank / controlled negative exercise — no odor was placed.' : 'No odor placements were recorded for this exercise.'}</Text>
        </Band>
      ) : null}

      {completion ? (
        <>
          <Band title={`TRAINING OUTCOME FOR ${(dog?.name || 'K9').toUpperCase()}`}>
            <KVBlock
              testID="outcome-exercise"
              items={[
                { label: 'Exercise Performed', value: completion.is_complete ? (completion.performed === 'performed' ? 'Yes' : completion.performed === 'excused' ? 'Excused From Performing' : 'Unable to Perform') : 'Incomplete record' },
                { label: 'Report Reviewed', value: REVIEW_TEXT(completion, nameOf), testID: 'txt-review-state' },
                { label: 'Weather', value: weatherLine(completion.weather), testID: 'txt-weather' },
                { label: 'Wind', value: windLine(completion.weather) },
                { label: 'Blind Exercise', value: exercise.kind === 'detection' ? blindLabel(completion.is_blind) : EM, testID: 'txt-blind-exercise' },
                { label: 'Set Time', value: longDateTime(completion.odor_set_at, tz) },
                { label: 'Start Time', value: longDateTime(completion.start_at, tz) },
                { label: 'End Time', value: longDateTime(completion.end_at, tz) },
                { label: 'Duration', value: hoursLabel(completion.start_at && completion.end_at ? Math.round((new Date(completion.end_at).getTime() - new Date(completion.start_at).getTime()) / 60000) : null) },
                { label: 'Saved On', value: longDateTime(completion.saved_at, tz) },
                { label: 'Record Outdated', value: yesNo(completion.is_outdated) },
                { label: 'Attached Files', value: String((completion.files || []).length) },
              ]}
            />
            <RejectionBlock reason={completion.rejection_reason} />
          </Band>

          {exercise.patrol_types.map((p) => {
            const def = PATROL_SECTIONS[p];
            const data = completion.sections?.[p] || {};
            const rows = def
              ? def.fields.map((f) => {
                const raw = (data as Record<string, unknown>)[f.key];
                // Single-choice fields store the option VALUE ('verbal'); reports print its label.
                if (f.kind === 'single' && typeof raw === 'string' && Array.isArray(f.options)) {
                  const opt = (f.options as readonly (string | { value: string; label: string })[])
                    .find((o) => typeof o !== 'string' && o.value === raw);
                  if (opt && typeof opt !== 'string') return { key: f.key, label: f.label, value: opt.label };
                }
                return { key: f.key, label: handlerEnteredLabel(f.key, f.label, !!track), value: sectionValue(f.key, raw) };
              })
              : sectionEntries(data as Record<string, unknown>);
            return (
              <Band key={p} title={(def?.header || p).toUpperCase()} testID={`section-${p.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                <KVBlock items={rows.map((r) => ({ label: r.label, value: r.value }))} />
              </Band>
            );
          })}

          <Band title="COMMENTS">
            <Text style={{ color: '#1E1E1C' }} testID="txt-comments">{completion.comments || 'No handler narrative was recorded.'}</Text>
            <TrainerComments comments={tcs} users={deps.users} />
          </Band>

          <TrackImage
            track={track}
            title="TRACKING MAP — GPS RECORDING"
            caption={`Track Distance is the length of the path drawn above, measured across the ${track?.points?.length ?? 0} GPS points recorded on the mobile app while the track was run. Any distance typed into a Tracking section above is the handler's own estimate and will not match this recording exactly.`}
          />
        </>
      ) : (
        <Band title="TRAINING OUTCOME">
          <Muted testID="txt-no-completion">No completion has been saved against this exercise yet, so there is no outcome to print.</Muted>
        </Band>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Deployment Report
// ---------------------------------------------------------------------------------------------
export function FullDeploymentReport({ deployment, deps }: { deployment: Deployment | null; deps: FullRecordDeps }) {
  const c = useColors();
  const nameOf = nameLookup(deps.users);
  if (!deployment) return <Muted testID="report-missing">This deployment could not be found. It may have been deleted.</Muted>;
  const d = deployment;
  const dog = deps.dogs.find((x) => x.id === d.dog_id) || null;
  const det = d.kind === 'detection' ? normalizeDetection(d.detection) : null;
  const track = d.track_id ? deps.tracks.find((t) => t.id === d.track_id) || null : null;
  const tcs = deps.trainerComments.filter((t) => t.record_type === 'deployment' && t.record_id === d.id);
  const arrests = d.arrests || [];
  const beforeCutover = d.occurred_at.slice(0, 10) < DEMOGRAPHICS_CUTOVER;

  return (
    <View testID="report-full-deployment">
      <Band title="OVERVIEW">
        <KVBlock
          testID="overview-deployment"
          items={[
            { label: 'Category', value: d.kind === 'detection' ? 'Detection Deployment' : 'Patrol Deployment' },
            { label: 'Requesting Agency', value: d.requesting_unit || EM },
            { label: 'Location', value: d.location?.name || EM },
            { label: 'Dog-Assisted Arrests', value: String(det?.dog_assisted_arrests ?? arrests.length) },
            { label: 'Address', value: d.location?.address || EM },
            { label: 'Alerts / Indications', value: det ? String(det.indications.length) : EM },
            { label: 'Report Reviewed', value: REVIEW_TEXT(d, nameOf), testID: 'txt-review-state' },
            { label: 'Search Areas', value: det ? `${det.environments.reduce((s, e) => s + (e.count || 1), 0)} (${det.environments.map((e) => `${e.env_type || 'Environment'}: ${e.count ?? 1}`).join(', ') || EM})` : EM },
            { label: 'Fulfillment State', value: d.request_fulfillment === 'deployed' ? 'Dog Deployed At Scene' : d.request_fulfillment === 'not_deployed' ? 'Dog Not Deployed At Scene' : 'Request Cancelled Enroute' },
            { label: 'Alerts Without Items Seized', value: det ? yesNo(det.independent_information) : EM },
            { label: 'Report Complete', value: yesNo(d.is_complete) },
            { label: 'Tags', value: (d.tags || []).join(', ') || EM },
            { label: 'Weather', value: weatherLine(d.weather), testID: 'txt-weather' },
            { label: 'Wind', value: windLine(d.weather) },
            { label: 'Reason For Deployment', value: d.reason || EM, wide: true },
          ]}
        />
        <RejectionBlock reason={d.rejection_reason} />
      </Band>

      {d.kind === 'patrol' ? (
        <>
          <Band title="PATROL WORK">
            <KVBlock
              items={[
                { label: 'Patrol Types', value: (d.patrol_types || []).join(', ') || EM },
                { label: 'People Found', value: d.people_found != null ? String(d.people_found) : EM },
                { label: 'People Unintentionally Bitten', value: d.people_unintentionally_bitten != null ? String(d.people_unintentionally_bitten) : EM },
                { label: 'Arrests', value: String(arrests.length) },
              ]}
            />
          </Band>
          {(d.patrol_types || []).map((p) => (
            <Band key={p} title={p.toUpperCase()} testID={`section-${p.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
              <KVBlock items={sectionEntries(d.sections?.[p] as Record<string, unknown>).map((r) => ({ label: r.label, value: r.value }))} />
            </Band>
          ))}
        </>
      ) : null}

      {det ? (
        <>
          {det.indications.map((ind, i) => {
            const seizures = det.seizures.filter((s) => s.indication_id === ind.id);
            const env = det.environments.find((e) => e.id === ind.environment_id);
            // Type is the ENVIRONMENT the dog was worked on. The vehicle description is a separate
            // row, and is only printed when it says something the Name has not already said —
            // repeating one string under two labels reads as a data error in a court exhibit.
            const vehicle = ind.is_vehicle ? [ind.vehicle.color, ind.vehicle.make, ind.vehicle.model].filter(Boolean).join(' ') : '';
            const plate = ind.is_vehicle ? (ind.vehicle.plate || '') : '';
            return (
              <Band key={ind.id} title={`INDICATION #${i + 1}: ${(env?.env_type || 'ENVIRONMENT').toUpperCase()} ENVIRONMENT`} testID={`indication-${i + 1}`}>
                <KVBlock
                  items={[
                    { label: 'Name', value: ind.name || EM },
                    // The band title already names the environment type, so repeating it here would
                    // spend a row on nothing. The plate is the identifying fact a court needs, and it
                    // was collected but never printed on any sheet.
                    ...(plate ? [{ label: 'Vehicle Plate', value: plate }] : []),
                    ...(vehicle && vehicle !== (ind.name || '') ? [{ label: 'Vehicle', value: vehicle }] : []),
                    { label: 'Number of Items Seized', value: String(seizures.length) },
                    { label: 'Description', value: ind.description || EM, wide: true },
                  ]}
                />
                {seizures.length ? (
                  <ReportTable
                    testID={`seizures-${i + 1}`}
                    columns={[
                      { key: 'cat', title: 'Category', width: 130, render: (s) => s.odor_category || EM },
                      { key: 'type', title: 'Odor Type', width: 150, render: (s) => s.odor_type || EM },
                      { key: 'amt', title: 'Amount', width: 120, render: (s) => (s.amount != null ? `${s.amount} ${s.unit}` : EM) },
                      { key: 'pack', title: 'Packaging', width: 150, render: (s) => s.packaging || EM },
                      { key: 'where', title: 'Concealed', width: 180, render: (s) => s.concealed_location || EM },
                    ]}
                    rows={seizures}
                    keyOf={(s) => s.id}
                  />
                ) : null}
              </Band>
            );
          })}
          <Band title="DETECTION STATISTICS">
            <KVBlock
              items={[
                { label: 'Environments Searched', value: String(det.environments.reduce((s, e) => s + (e.count || 1), 0)) },
                { label: 'Alerts / Indications', value: String(det.indications.length) },
                { label: 'Seizure Incidents', value: String(det.seizures.length) },
                { label: 'Currency Indicated To', value: det.currency_amount != null ? `${det.currency_amount} ${det.currency_type}` : EM },
              ]}
            />
          </Band>
        </>
      ) : null}

      {arrests.length ? (
        <Band title="DOG-ASSISTED ARRESTS" testID="band-arrests">
          {deps.showDemographics ? (
            <ReportTable
              testID="table-arrests"
              columns={[
                // No Charges column — DECISIONS E21: the arrest group has no Charges field, so the
                // column could only ever print an em dash on a record a handler actually made.
                { key: 'n', title: '#', width: 50, render: (a) => String(a.n) },
                { key: 'bitten', title: 'Subject Bitten', width: 160, render: (a) => yesNo(a.subject_bitten) },
                { key: 'age', title: 'Age', width: 90, render: (a) => (a.demographics?.age != null ? String(a.demographics.age) : EM) },
                { key: 'sex', title: 'Sex At Birth', width: 150, render: (a) => a.demographics?.sex || EM },
                { key: 'race', title: 'Race / Ethnicity', width: 220, render: (a) => a.demographics?.race || EM },
              ]}
              rows={arrests}
              keyOf={(a) => a.id}
            />
          ) : (
            <ReportTable
              testID="table-arrests"
              columns={[
                { key: 'n', title: '#', width: 50, render: (a) => String(a.n) },
                { key: 'bitten', title: 'Subject Bitten', width: 160, render: (a) => yesNo(a.subject_bitten) },
              ]}
              rows={arrests}
              keyOf={(a) => a.id}
            />
          )}
          {deps.showDemographics ? null : (
            <NoteLine testID="note-demographics-hidden">
              Demographic arrest data is collected but hidden in reports — Profile → Report Options controls this.
            </NoteLine>
          )}
          {deps.showDemographics && beforeCutover ? (
            <NoteLine testID="note-demographics-cutover">
              NOTE: this deployment occurred before demographic arrest data collection began on {DEMOGRAPHICS_CUTOVER}.
            </NoteLine>
          ) : null}
        </Band>
      ) : null}

      <Band title="COMMENTS">
        <Text style={{ color: '#1E1E1C' }} testID="txt-comments">{d.summary || 'No narrative was recorded.'}</Text>
        <TrainerComments comments={tcs} users={deps.users} />
      </Band>

      <TrackImage
        track={track}
        title="DEPLOYMENT TRACK — GPS RECORDING"
        caption={`Track Distance is the length of the path drawn above, measured across the ${track?.points?.length ?? 0} GPS points recorded on the mobile app during the deployment. Any track figures typed into the sections above are the handler's own estimates and will not match this recording exactly.`}
      />
      <NoteLine>K9 {dog?.name || EM} · handler {nameOf(d.handler_id) || EM} · case {d.case_number || 'N/A'}</NoteLine>
      <View style={{ height: 1, backgroundColor: c.border, marginTop: space.sm }} />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Class Report
// ---------------------------------------------------------------------------------------------
export function FullClassReport({ record, deps }: { record: ClassRecord | null; deps: FullRecordDeps }) {
  const nameOf = nameLookup(deps.users);
  if (!record) return <Muted testID="report-missing">This class record could not be found. It may have been deleted.</Muted>;
  const tcs = deps.trainerComments.filter((t) => t.record_type === 'class' && t.record_id === record.id);
  return (
    <View testID="report-full-class">
      <Band title="OVERVIEW">
        <KVBlock
          testID="overview-class"
          items={[
            { label: 'Class', value: record.title || EM },
            { label: 'Instructor', value: record.instructor || EM },
            { label: 'Location', value: record.location || EM },
            { label: 'Date', value: longDateTime(record.occurred_at, record.tz) },
            { label: 'Duration', value: hoursLabel(record.duration_min) },
            { label: 'Report Reviewed', value: REVIEW_TEXT(record, nameOf), testID: 'txt-review-state' },
            { label: 'Report Complete', value: yesNo(record.is_complete) },
            { label: 'Attached Files', value: String((record.files || []).length) },
          ]}
        />
        <RejectionBlock reason={record.rejection_reason} />
      </Band>
      <Band title="NOTES">
        <Text style={{ color: '#1E1E1C' }} testID="txt-comments">{record.notes || 'No notes were recorded.'}</Text>
        <TrainerComments comments={tcs} users={deps.users} />
      </Band>
    </View>
  );
}
