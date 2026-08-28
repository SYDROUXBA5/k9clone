// /reports/view?type=…&id=…&dog=…&from=…&to=…&handler=…&ids=… — the report viewer.
// Toolbar (never printed) · the printable sheet · a dev-only render-time label. DOWNLOAD opens the
// browser print dialog (Save as PDF) against the print stylesheet; CSV builds the file in memory.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRepo } from '@/db/provider';
import { RoleGuard } from '@/features/nav/RoleGuard';
import { ReportDocument } from '@/reports/ReportDocument';
import { dataAttr } from '@/reports/chrome';
import { Button, Muted, Row, Select, Switch, Text, radius, space, useColors, useIsDesktop, useToast } from '@/ui';
import { buildCsv, toCsv } from './csv';
import { buildPrintPreview, canPrint, downloadCsv, downloadFile, installPrintStyles, printReport, reportHtml, reportText } from './deliver';
import { isSingleRecord, paramsFromQuery, typeLabel } from './params';
import { selectRecords } from './select';
import { useReportContext } from './useReportSource';

/** "Page Width ▾" — how wide the sheet is drawn on this screen. Word / Excel / image exports are not
 *  offered: see docs/DECISIONS.md E23 for why, and what stands in for them. */
/** Three widths that are always visibly different from each other at any window size — a menu with
 *  two entries that happen to draw the same sheet is worse than no menu at all. */
const PAGE_WIDTH_OPTIONS = ['Letter width', 'Fit to window', 'Reading width'] as const;
type PageWidth = (typeof PAGE_WIDTH_OPTIONS)[number];
/** null = no cap, the sheet fills the window. Threaded into the SHEET as well as the toolbar column,
 *  so choosing one visibly redraws the paper; printing always uses the paper width. */
const PAGE_WIDTHS: Record<PageWidth, number | null> = {
  'Letter width': 816, 'Fit to window': null, 'Reading width': 680,
};

export function ReportViewScreen() {
  return (
    <RoleGuard allow={['handler', 'trainer', 'supervisor']} title="Report">
      <ReportView />
    </RoleGuard>
  );
}

function ReportView() {
  const router = useRouter();
  const toast = useToast();
  const c = useColors();
  const desktop = useIsDesktop();
  const raw = useLocalSearchParams<Record<string, string | string[]>>();
  const ctx = useReportContext();
  // useLocalSearchParams returns a fresh object every render — key the memo on its VALUES, or every
  // render produces a new params/set pair and the render-time effect below loops forever.
  const queryKey = JSON.stringify(raw);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const params = useMemo(() => paramsFromQuery(raw), [queryKey]);
  const wantsPrint = (Array.isArray(raw.print) ? raw.print[0] : raw.print) === '1';
  // The render-time badge is a build tool, not a report feature: it floats over the sheet, so it is
  // off unless a developer asks for it with ?debug=1 on a development build.
  const wantsDebug = __DEV__ && (Array.isArray(raw.debug) ? raw.debug[0] : raw.debug) === '1';

  const t0 = useRef(0);
  t0.current = t0.current || (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);
  // Default = paper: what you see on screen is the width that comes out of the printer.
  const [pageWidth, setPageWidth] = useState<PageWidth>('Letter width');

  const set = useMemo(() => selectRecords(ctx.src, ctx.scope, params), [ctx.src, ctx.scope, params]);

  useEffect(() => { installPrintStyles(); }, []);
  // Dev-only hook: build the print DOM without opening the (blocking) dialog, so the printed layout
  // can be inspected by a headless browser exactly as the DOWNLOAD button prepares it.
  useEffect(() => {
    if (!__DEV__ || typeof globalThis === 'undefined') return;
    (globalThis as unknown as Record<string, unknown>).__k9BuildPrintPreview = buildPrintPreview;
    return () => { delete (globalThis as unknown as Record<string, unknown>).__k9BuildPrintPreview; };
  }, []);
  useEffect(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    setRenderMs(Math.round(now - t0.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, params.type]);

  const printedOnce = useRef(false);
  useEffect(() => {
    if (!wantsPrint || printedOnce.current) return;
    printedOnce.current = true;
    const t = setTimeout(() => {
      const res = printReport();
      toast.show(res.message, res.ok ? 'success' : 'info');
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsPrint]);

  const single = isSingleRecord(params.type);
  // Report Options → "Demographic arrest data in deployment reports". The Profile section that will
  // also carry it belongs to a later unit, so the control lives here, on the reports that use it.
  const repo = useRepo();
  const canShowDemographics = params.type === 'full_deployment' || params.type === 'deployment_summary';
  const toggleDemographics = (v: boolean) => {
    if (!ctx.viewer) return;
    void repo.upsert('user', { id: ctx.viewer.id, demographics_in_reports: v }, { label: 'Report options' });
    toast.show(v ? 'Demographic arrest data will be shown in deployment reports.' : 'Demographic arrest data is hidden in reports (it is still collected).');
  };

  const doPrint = () => {
    const res = printReport();
    toast.show(res.message, res.ok ? 'success' : 'info');
  };
  const doCsv = () => {
    const table = buildCsv(params.type, ctx.src, set);
    const filename = `${table.name}-${new Date().toISOString().slice(0, 10)}.csv`;
    const res = downloadCsv(filename, toCsv(table));
    setLastExport(res.ok ? `${filename} — ${table.rows.length} rows · header: ${table.header.join(', ')}` : res.message);
    toast.show(res.message, res.ok ? 'success' : 'error');
  };
  const stamp = () => new Date().toISOString().slice(0, 10);
  const doHtml = () => {
    const html = reportHtml(`${typeLabel(params.type)} — ${ctx.agency || 'K9'}`);
    if (!html) { toast.show('The report is still drawing — try again in a moment.', 'error'); return; }
    const filename = `${params.type}-${stamp()}.html`;
    const res = downloadFile(filename, html, 'text/html;charset=utf-8');
    setLastExport(res.ok ? `${filename} — standalone web page` : res.message);
    toast.show(res.message, res.ok ? 'success' : 'error');
  };
  const doText = () => {
    const text = reportText();
    if (!text) { toast.show('The report is still drawing — try again in a moment.', 'error'); return; }
    const filename = `${params.type}-${stamp()}.txt`;
    const res = downloadFile(filename, text, 'text/plain;charset=utf-8');
    setLastExport(res.ok ? `${filename} — ${text.split('\n').length} lines of plain text` : res.message);
    toast.show(res.message, res.ok ? 'success' : 'error');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: desktop ? space.lg : space.sm, alignItems: 'center' }} testID="screen-report-view">
      <View style={{ width: '100%', maxWidth: PAGE_WIDTHS[pageWidth] ?? undefined }}>
        <View
          {...dataAttr('k9Noprint')}
          style={[styles.toolbar, { backgroundColor: c.surface, borderColor: c.border }]}
          testID="report-toolbar"
        >
          <View style={{ width: '100%' }}>
            <Text variant="h3" accessibilityRole="header">{typeLabel(params.type)}</Text>
            <Muted testID="txt-report-scope">
              {single ? 'Single record' : `${set.total} record${set.total === 1 ? '' : 's'}`}
              {params.from || params.to ? ` · ${params.from || 'start'} → ${params.to || 'today'}` : ' · all dates'}
            </Muted>
          </View>
          {/* Page Width sits on its own line: parked at the end of the button row it pushed the
              primary "Download (PDF)" button past the right edge of the viewport at 1280. */}
          <View style={desktop ? { width: 220 } : { width: '100%' }}>
            <Select
              label="Page Width"
              testID="select-page-width"
              allowCustom={false}
              options={PAGE_WIDTH_OPTIONS.map((o) => ({ value: o, label: o }))}
              value={pageWidth}
              onChange={(v) => setPageWidth(v as PageWidth)}
            />
          </View>
          <Row gap={space.sm} wrap justify="flex-start" align="center" style={{ width: '100%' }}>
            <Button title="Back" variant="ghost" icon="arrow-back" testID="btn-report-back" onPress={() => router.back()} />
            <Button title="New report" variant="ghost" icon="document-text-outline" testID="btn-new-report" onPress={() => router.push('/reports' as never)} />
            {!single ? <Button title="CSV" variant="secondary" icon="grid-outline" testID="btn-report-csv" onPress={doCsv} /> : null}
            <Button title="Web page" variant="secondary" icon="globe-outline" testID="btn-report-html" onPress={doHtml} />
            <Button title="Text" variant="secondary" icon="document-outline" testID="btn-report-text" onPress={doText} />
            <Button title={canPrint() ? 'Download (PDF)' : 'Print'} variant="accent" icon="print-outline" testID="btn-report-print" onPress={doPrint} />
          </Row>
        </View>
        {canShowDemographics ? (
          <View {...dataAttr('k9Noprint')} style={[styles.optionBar, { backgroundColor: c.surface, borderColor: c.border }]} testID="report-options">
            <Switch
              label="Demographic arrest data in deployment reports"
              testID="switch-demographics"
              value={ctx.showDemographics}
              onChange={toggleDemographics}
              help="Report Options — with this off the data is still collected, it is just not printed."
            />
          </View>
        ) : null}
        {lastExport ? <Muted {...dataAttr('k9Noprint')} testID="txt-last-export" style={{ marginBottom: space.sm }}>Last export: {lastExport}</Muted> : null}

        <ReportDocument
          params={params}
          src={ctx.src}
          set={set}
          viewer={ctx.viewer}
          role={ctx.role}
          agency={ctx.agency}
          logoUri={ctx.logoUri}
          showDemographics={ctx.showDemographics}
          sheetMaxWidth={PAGE_WIDTHS[pageWidth]}
        />

        {wantsDebug ? (
          <View {...dataAttr('k9Noprint')} style={[styles.devLabel, { borderColor: c.border, backgroundColor: c.surface }]} testID="dev-render-time">
            <Muted testID="txt-render-ms">rendered in {renderMs ?? '…'} ms · {set.total} records</Muted>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'column', alignItems: 'stretch', gap: space.sm, borderWidth: 1, borderRadius: radius.md, padding: space.sm, marginBottom: space.md, width: '100%' },
  // A corner overlay, not the last row of the document: with the 1,000-record seed the exercise list
  // runs to thousands of rows and a label parked at the end of the scroll content is unreachable —
  // which is exactly when the render time matters most.
  devLabel: {
    ...(Platform.OS === 'web'
      ? { position: 'fixed' as unknown as 'absolute', right: space.sm, bottom: space.sm, zIndex: 50 }
      : { alignSelf: 'flex-end' as const, marginTop: space.sm }),
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
  },
  optionBar: { borderWidth: 1, borderRadius: radius.md, padding: space.sm, marginBottom: space.md, width: '100%' },
});
