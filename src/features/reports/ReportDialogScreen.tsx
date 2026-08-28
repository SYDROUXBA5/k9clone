// /reports — "Create Printable Report": step 1 mode (Standard vs Custom), step 2 report type,
// step 3 optional filters, then CANCEL · DOWNLOAD (PDF) · CSV · VIEW.
// Custom mode is only selectable when the Records page handed over a checkmarked set (?ids=…).
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { RoleGuard } from '@/features/nav/RoleGuard';
import {
  Button, Card, DateTimeField, Muted, Row, Screen, Section, Select, Text, radius, space, useColors, useIsDesktop, useToast,
} from '@/ui';
import { buildCsv, toCsv } from './csv';
import { downloadCsv } from './deliver';
import { HELP_TOPICS, HelpTopicsButton, WhenToUseLink } from './ReportHelp';
import {
  EMPTY_PARAMS, RANGE_PRESETS, isSingleRecord, paramsToQuery, presetRange, typeOptionsFor, type RangePreset, type ReportParams,
} from './params';
import { selectRecords } from './select';
import { useReportContext } from './useReportSource';

/** Above these the on-screen viewer is refused and the user is sent to DOWNLOAD (PDF), which streams
 *  through the print pipeline instead of laying thousands of rows out in the browser. */
const VIEW_LIMIT = 5000;
const VIEW_FULL_RECORD_LIMIT = 300;

export function ReportDialogScreen() {
  return (
    <RoleGuard allow={['handler', 'trainer', 'supervisor']} title="Reports">
      <ReportDialog />
    </RoleGuard>
  );
}

function ReportDialog() {
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const desktop = useIsDesktop();
  const query = useLocalSearchParams<{ ids?: string | string[]; type?: string | string[] }>();
  const ctx = useReportContext();

  const preselected = useMemo(() => {
    const raw = Array.isArray(query.ids) ? query.ids[0] : query.ids;
    return raw ? raw.split(',').filter(Boolean) : [];
  }, [query.ids]);

  const [params, setParams] = useState<ReportParams>(() => ({
    ...EMPTY_PARAMS,
    mode: preselected.length ? 'custom' : 'standard',
    ids: preselected.length ? preselected : null,
    type: (Array.isArray(query.type) ? query.type[0] : query.type) || 'training_summary',
  }));
  const [preset, setPreset] = useState<RangePreset>('All');
  const [lastExport, setLastExport] = useState<string | null>(null);
  const patch = (p: Partial<ReportParams>) => setParams((prev) => ({ ...prev, ...p }));

  const typeOptions = useMemo(() => typeOptionsFor(ctx.role), [ctx.role]);
  const current = typeOptions.find((o) => o.value === params.type) || typeOptions[0];

  // Counts under the filters — recomputed live, exactly the set the report will render.
  const standardSet = useMemo(() => selectRecords(ctx.src, ctx.scope, { ...params, mode: 'standard', ids: null }), [ctx.src, ctx.scope, params]);
  const set = useMemo(() => selectRecords(ctx.src, ctx.scope, params), [ctx.src, ctx.scope, params]);
  const customSet = useMemo(
    () => (preselected.length ? selectRecords(ctx.src, ctx.scope, { ...params, mode: 'custom', ids: preselected }) : null),
    [ctx.src, ctx.scope, params, preselected],
  );

  const completedCount = set.completions.filter((x) => x.is_complete).length;
  const exerciseCount = new Set(set.completions.map((x) => x.exercise_id)).size;
  const singleRecord = isSingleRecord(params.type);
  // How many records the chosen type will actually print in full — a Full Record run from here is a
  // batch (one record per page), so it is the batch that decides whether VIEW is sensible.
  const fullRecordCount = params.type === 'full_exercise' ? set.completions.length
    : params.type === 'full_deployment' ? set.deployments.length
      : params.type === 'full_class' ? set.classes.length : 0;
  const viewTooBig = singleRecord ? fullRecordCount > VIEW_FULL_RECORD_LIMIT : set.total > VIEW_LIMIT;
  const missing: string[] = [];
  if (!params.type) missing.push('Report Type');
  if (singleRecord && !params.id && fullRecordCount === 0) missing.push('at least one record in range — this report prints records in full and the filters match none');
  if (preset === 'Custom…' && !params.from && !params.to) missing.push('a start or end date for the custom range');

  const applyPreset = (p: RangePreset) => {
    setPreset(p);
    if (p === 'Custom…') return;
    const r = presetRange(p);
    patch({ from: r.from, to: r.to });
  };

  const view = () => {
    if (missing.length) { toast.show(`Add ${missing[0]} first.`, 'error'); return; }
    if (viewTooBig) { toast.show('This report is too large to draw on screen — use DOWNLOAD (PDF) instead.', 'error'); return; }
    router.push(`/reports/view?${paramsToQuery(params)}` as never);
  };

  const csv = () => {
    if (missing.length) { toast.show(`Add ${missing[0]} first.`, 'error'); return; }
    const table = buildCsv(params.type, ctx.src, set);
    const filename = `${table.name}-${new Date().toISOString().slice(0, 10)}.csv`;
    const res = downloadCsv(filename, toCsv(table));
    setLastExport(res.ok ? `${filename} — ${table.rows.length} rows · header: ${table.header.join(', ')}` : res.message);
    toast.show(res.message, res.ok ? 'success' : 'error');
  };

  const modeCard = (mode: 'standard' | 'custom', title: string, count: number, caption: string, disabled: boolean) => {
    const active = params.mode === mode;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: active, disabled }}
        accessibilityLabel={`${title} — ${count} records`}
        testID={`card-mode-${mode}`}
        disabled={disabled}
        onPress={() => patch({ mode, ids: mode === 'custom' ? preselected : null })}
        style={({ hovered }: { hovered?: boolean }) => [
          styles.modeCard,
          {
            borderColor: active ? c.primary : c.border,
            backgroundColor: active ? c.primarySoft : hovered && !disabled ? c.surfaceAlt : c.surface,
            opacity: disabled ? 0.55 : 1,
            flexBasis: desktop ? 0 : 'auto',
          },
        ]}
      >
        <Row gap={space.sm}>
          <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? c.primary : c.muted} />
          <Text variant="bodyStrong">{title}</Text>
        </Row>
        <Text variant="h3" style={{ color: c.primary, marginTop: space.xs }}>{mode === 'custom' ? `${count} SEARCHED RECORDS` : `ALL ${count} RECORDS`}</Text>
        <Muted style={{ marginTop: 2 }}>{caption}</Muted>
      </Pressable>
    );
  };

  return (
    <Screen title="Create Printable Report" subtitle="Choose a mode, a report type and any extra filtering, then view or download." testID="screen-reports">
      <Card>
        <Row justify="flex-end">
          <HelpTopicsButton />
        </Row>
        <Section title="1. Choose which report mode to use">
          <View style={[styles.modeRow, { flexDirection: desktop ? 'row' : 'column' }]}>
            {modeCard('standard', 'Standard Report', standardSet.total, 'Use all of my records; the report type and the filters below decide what is printed.', false)}
            {modeCard('custom', 'Custom Report', customSet?.total ?? 0, preselected.length
              ? 'Use only the records you checkmarked on the Records page.'
              : 'Run a search or checkmark records on the Records page first, then press Report there.', preselected.length === 0)}
          </View>
          <WhenToUseLink
            testID="link-when-to-use-mode"
            text={HELP_TOPICS[0].body}
          />
        </Section>

        <Section title="2. Select the type of report to run">
          <Select
            label="Report Type"
            required
            testID="select-report-type"
            options={typeOptions.map((o) => ({ value: o.value, label: o.label, group: o.group, description: o.description }))}
            value={params.type}
            onChange={(v) => patch({ type: v })}
            allowCustom={false}
            help={current?.description}
          />
          {singleRecord ? (
            <Muted testID="txt-single-record-hint" style={{ marginTop: space.xs }}>
              Full Record prints every field of a record. Run from here it prints all {fullRecordCount} matching record{fullRecordCount === 1 ? '' : 's'} in
              full, one per page — that is the court-history packet. For a single record, use “View Report” on its row on the Records page.
            </Muted>
          ) : null}
          <WhenToUseLink testID="link-when-to-use-type" text={HELP_TOPICS[1].body} />
        </Section>

        <Section title="3. Optional: provide any additional filtering to apply to these records">
          <Select
            label="Dog"
            testID="select-report-dog"
            clearable
            allowCustom={false}
            options={[{ value: '', label: 'All Dogs' }, ...ctx.scopedDogs.map((d) => ({ value: d.id, label: `${d.name}${d.handlerName ? ` — ${d.handlerName}` : ''}` }))]}
            value={params.dog}
            onChange={(v) => patch({ dog: v })}
            placeholder="All Dogs"
          />
          {ctx.scopedHandlers.length > 1 ? (
            <Select
              label="Handler"
              testID="select-report-handler"
              clearable
              allowCustom={false}
              options={[{ value: '', label: 'All Handlers' }, ...ctx.scopedHandlers.map((u) => ({ value: u.id, label: u.name }))]}
              value={params.handler}
              onChange={(v) => patch({ handler: v })}
              placeholder="All Handlers"
            />
          ) : null}
          <Select
            label="Date Range"
            testID="select-report-range"
            allowCustom={false}
            options={RANGE_PRESETS.map((r) => ({ value: r, label: r }))}
            value={preset}
            onChange={(v) => applyPreset(v as RangePreset)}
          />
          {preset === 'Custom…' ? (
            <Row gap={space.md} wrap align="flex-start">
              <DateTimeField label="From" mode="date" testID="input-report-from" value={{ at: params.from ? `${params.from}T12:00:00.000Z` : null, tz: 'UTC' }} onChange={(v) => patch({ from: v.at ? v.at.slice(0, 10) : null })} />
              <DateTimeField label="To" mode="date" testID="input-report-to" value={{ at: params.to ? `${params.to}T12:00:00.000Z` : null, tz: 'UTC' }} onChange={(v) => patch({ to: v.at ? v.at.slice(0, 10) : null })} />
            </Row>
          ) : null}
        </Section>

        <View style={[styles.countBox, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
          <Text testID="txt-report-count">
            Includes {completedCount} completed record{completedCount === 1 ? '' : 's'} from {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'} and {set.classes.length} class{set.classes.length === 1 ? '' : 'es'}.
          </Text>
          <Muted testID="txt-report-wait">
            {set.total} records selected · estimated wait time under {Math.max(1, Math.ceil(set.total / 400))} second{set.total > 400 ? 's' : ''}.
          </Muted>
          {missing.length ? <Text color="danger" testID="txt-report-missing">Still needed: {missing.join('; ')}.</Text> : null}
          {viewTooBig && !missing.length ? (
            <Text color="danger" testID="txt-report-too-big">
              Too large to draw on screen ({singleRecord ? `${fullRecordCount} full records` : `${set.total} records`}). Use DOWNLOAD (PDF) — it prints every row.
            </Text>
          ) : null}
        </View>

        {lastExport ? <Muted testID="txt-last-export" style={{ marginTop: space.sm }}>Last export: {lastExport}</Muted> : null}

        <Row gap={space.sm} wrap justify="flex-end" style={{ marginTop: space.md }}>
          <Button title="Cancel" variant="ghost" testID="btn-report-cancel" onPress={() => router.back()} />
          <Button title="CSV" variant="secondary" icon="grid-outline" testID="btn-report-csv" onPress={csv} disabled={singleRecord} />
          <Button title="Download (PDF)" variant="secondary" icon="cloud-download-outline" testID="btn-report-download" onPress={() => { if (missing.length) { toast.show(`Add ${missing[0]} first.`, 'error'); return; } router.push(`/reports/view?${paramsToQuery(params)}&print=1` as never); }} />
          <Button title="View" variant="accent" icon="eye-outline" testID="btn-report-view" onPress={view} disabled={viewTooBig} />
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  modeRow: { gap: space.md },
  modeCard: { flexGrow: 1, borderWidth: 2, borderRadius: radius.md, padding: space.md, minHeight: 44 },
  countBox: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginTop: space.sm },
});
