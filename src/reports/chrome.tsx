// Report chrome — the printable furniture every report type shares: the paper sheet, the header with
// the app-name/agency line, grey section bands, key/value blocks, bar charts, the day×hour heatmap,
// dense scrolling tables and the "printed by … Page x of y" footer.
// Nothing here reads the repository; report components pass plain data in.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { APP_NAME } from '@/config';
import { Muted, Text, radius, space, useColors } from '@/ui';

/** data-* attributes so the print stylesheet can target blocks (web only; ignored on native). */
export function dataAttr(name: string, value: string | number = 'true'): Record<string, unknown> {
  return Platform.OS === 'web' ? { dataSet: { [name]: value } } : {};
}

export const PAGE_WIDTH = 816; // US Letter at 96 dpi

/** `maxWidth` is the screen's Page Width choice; `null` means "fill whatever the container gives us".
 *  Printing always uses the paper width, which the print stylesheet imposes — this only affects screen. */
export function ReportSheet({ children, testID = 'report-sheet', maxWidth = PAGE_WIDTH }: {
  children: React.ReactNode; testID?: string; maxWidth?: number | null;
}) {
  const c = useColors();
  return (
    <View
      testID={testID}
      accessibilityLabel="Report document"
      {...dataAttr('k9Report')}
      // '100%' rather than undefined for the uncapped case: an undefined maxWidth does not override
      // the 816 in styles.sheet, which is what made every Page Width choice draw the same sheet.
      style={[styles.sheet, { backgroundColor: '#FFFFFF', borderColor: c.border }, { maxWidth: maxWidth === null ? '100%' : maxWidth }]}
    >
      {children}
    </View>
  );
}

export function ReportHeader({ title, lines, badgeLabel, logoUri }: { title: string; lines: string[]; badgeLabel?: string; logoUri?: string | null }) {
  const c = useColors();
  return (
    <View {...dataAttr('k9Block')} style={styles.header} testID="report-header">
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="h2" accessibilityRole="header" testID="txt-report-title" style={{ color: '#1E1E1C' }}>{title}</Text>
        {lines.filter(Boolean).map((l, i) => (
          <Text key={i} testID={`txt-report-subtitle-${i}`} style={{ color: i === 0 ? '#1E1E1C' : '#6B6A66', marginTop: 2 }}>{l}</Text>
        ))}
      </View>
      {/* PT-PRO-05 — the Department Logo uploaded on Profile prints here. Without one the report
          falls back to the shield mark, so a department that never uploaded a logo still gets a
          masthead rather than a hole. */}
      {logoUri ? (
        <View style={[styles.badge, { borderColor: c.border, backgroundColor: '#FFFFFF' }]} testID="report-badge">
          <Image
            source={{ uri: logoUri }}
            resizeMode="contain"
            accessibilityLabel={`${badgeLabel || APP_NAME} logo`}
            testID="img-report-logo"
            style={{ width: 132, height: 56 }}
          />
          <Text style={{ color: '#1E1E1C', fontSize: 16, lineHeight: 18, fontWeight: '700' }} numberOfLines={1}>{badgeLabel || APP_NAME}</Text>
        </View>
      ) : (
        <View style={[styles.badge, { borderColor: c.primary, backgroundColor: c.primarySoft }]} testID="report-badge">
          <Ionicons name="shield-half" size={26} color={c.primary} />
          <Text style={{ color: c.primary, fontSize: 16, lineHeight: 18, fontWeight: '700' }} numberOfLines={1}>{badgeLabel || APP_NAME}</Text>
        </View>
      )}
    </View>
  );
}

export function Band({ title, children, testID }: { title: string; children?: React.ReactNode; testID?: string }) {
  return (
    <View style={{ marginTop: space.md }} testID={testID}>
      <View {...dataAttr('k9Band')} style={styles.band}>
        <Text variant="bodyStrong" accessibilityRole="header" style={{ color: '#1E1E1C', letterSpacing: 0.4 }}>{title}</Text>
      </View>
      {children ? <View style={{ paddingTop: space.sm }}>{children}</View> : null}
    </View>
  );
}

export interface KVItem { label: string; value: React.ReactNode; testID?: string; wide?: boolean }

/** Two-column key/value block on paper and desktop, one column on a phone. */
export function KVBlock({ items, columns = 2, testID }: { items: KVItem[]; columns?: number; testID?: string }) {
  return (
    <View testID={testID} {...dataAttr('k9Block')} style={styles.kvWrap}>
      {items.map((it, i) => (
        <View key={`${it.label}-${i}`} style={[styles.kvItem, { width: it.wide || columns === 1 ? '100%' : '50%' }]}>
          <Text style={styles.kvLabel}>{it.label}:</Text>
          <View style={{ flex: 1, minWidth: 0 }} testID={it.testID}>
            {typeof it.value === 'string' || typeof it.value === 'number'
              ? <Text style={{ color: '#1E1E1C' }}>{String(it.value === '' ? '—' : it.value)}</Text>
              : (it.value ?? <Text style={{ color: '#6B6A66' }}>—</Text>)}
          </View>
        </View>
      ))}
    </View>
  );
}

export function StatGrid({ stats, testID }: { stats: { label: string; value: string | number; testID?: string }[]; testID?: string }) {
  const c = useColors();
  return (
    <View testID={testID} {...dataAttr('k9Block')} style={styles.statWrap}>
      {stats.map((s, i) => (
        <View key={`${s.label}-${i}`} style={[styles.stat, { borderColor: c.border }]} testID={s.testID}>
          <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.primary }}>{s.value}</Text>
          <Text style={{ color: '#6B6A66' }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Horizontal bars — legible on paper (label · bar · value), no chart library. */
export function BarChart({ title, data, unit = '', testID, color, showPercent = true }: {
  title?: string; data: { key: string; value: number; note?: string }[]; unit?: string; testID?: string; color?: string;
  /** Off when the bars are unrelated counts (a percentage of their sum would be meaningless). */
  showPercent?: boolean;
}) {
  const c = useColors();
  const max = Math.max(1, ...data.map((d) => d.value));
  const fill = color || c.primary;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <View testID={testID} {...dataAttr('k9Block')} style={{ marginTop: space.sm }}>
      {title ? <Text variant="bodyStrong" style={{ color: '#1E1E1C', marginBottom: space.xs }}>{title}</Text> : null}
      {data.length === 0 ? <Muted>No data in this range.</Muted> : null}
      {data.map((d) => {
        const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
        return (
          <View key={d.key} style={styles.barRow} accessibilityLabel={`${d.key}: ${d.value}${unit ? ` ${unit}` : ''}`}>
            <Text style={styles.barLabel} numberOfLines={2}>{d.key}</Text>
            <View style={[styles.barTrack, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              {/* A 0 must draw nothing: a 2% stub is indistinguishable from a real small value. */}
              <View style={{ width: d.value <= 0 ? 0 : `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: fill, height: 18, borderRadius: 3 }} />
            </View>
            <Text style={styles.barValue}>{d.note ?? `${round1(d.value)}${unit ? ` ${unit}` : ''}${showPercent && total > 0 && !unit ? ` (${pct}%)` : ''}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Categorical palette for pies / donuts and grouped bars — teal-family first, then the accent. */
export const CHART_COLORS = ['#14524A', '#E4572E', '#2E7D32', '#6B6A66', '#4C8C82', '#B0651F', '#8A9A5B', '#C62828', '#3D5A80', '#A38560'];

export interface Slice { key: string; value: number; note?: string }

/** A real donut, drawn without SVG or a chart library so it renders identically on web and native.
 *
 *  Geometry: the circle is split into two hemispheres, each an overflow-hidden right-half window
 *  (the left one is the same window inside a frame rotated 180°). Inside a window a slice is a
 *  half-disc rotated about the circle centre to the slice's start angle — it therefore paints from
 *  that angle to the end of the hemisphere — immediately followed by a white half-disc rotated to
 *  the slice's END angle, which rubs out the overshoot. Slices paint in angular order, so each one
 *  repaints over the previous slice's overshoot and nothing can wrap past the hemisphere boundary.
 */
export function DonutChart({ title, data, testID, unit = '' }: { title?: string; data: Slice[]; testID?: string; unit?: string }) {
  const c = useColors();
  const rows = data.filter((d) => d.value > 0);
  const total = rows.reduce((s, d) => s + d.value, 0);
  if (!total) {
    return (
      <View testID={testID} {...dataAttr('k9Block')} style={{ marginTop: space.sm }}>
        {title ? <Text variant="bodyStrong" style={{ color: '#1E1E1C', marginBottom: space.xs }}>{title}</Text> : null}
        <Muted>No data in this range.</Muted>
      </View>
    );
  }
  const arcs: { color: string; from: number; to: number }[] = [];
  let acc = 0;
  rows.forEach((d, i) => {
    const sweep = (d.value / total) * 360;
    arcs.push({ color: CHART_COLORS[i % CHART_COLORS.length], from: acc, to: acc + sweep });
    acc += sweep;
  });
  const clip = (lo: number, hi: number) => arcs
    .map((a) => ({ color: a.color, from: Math.max(a.from, lo) - lo, to: Math.min(a.to, hi) - lo }))
    .filter((a) => a.to > a.from + 0.01);

  return (
    <View testID={testID} {...dataAttr('k9Block')} style={{ marginTop: space.sm }}>
      {title ? <Text variant="bodyStrong" style={{ color: '#1E1E1C', marginBottom: space.xs }}>{title}</Text> : null}
      <View style={styles.donutRow}>
        <View
          {...dataAttr('k9ChartClip')}
          style={[styles.donut, { borderColor: c.border }]}
          accessibilityLabel={rows.map((d) => `${d.key}: ${d.value}`).join(', ')}
        >
          <Hemisphere rotate={0} arcs={clip(0, 180)} />
          <Hemisphere rotate={180} arcs={clip(180, 360)} />
          <View style={styles.donutHole}>
            <Text style={{ fontSize: 18, lineHeight: 22, fontWeight: '700', color: '#1E1E1C' }}>{round1(total)}</Text>
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 200 }}>
          {rows.map((d, i) => (
            <View key={d.key} style={styles.legendRow}>
              <View {...dataAttr('k9Chart')} style={[styles.swatch, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
              <Text style={{ flex: 1, minWidth: 0, color: '#1E1E1C', fontSize: 16, lineHeight: 20 }}>{d.key}</Text>
              <Text style={{ color: '#1E1E1C', fontSize: 16, lineHeight: 20 }}>
                {d.note ?? `${round1(d.value)}${unit ? ` ${unit}` : ''} (${Math.round((d.value / total) * 100)}%)`}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** One half of the donut. `arcs` are angles 0–180 measured inside this hemisphere. */
function Hemisphere({ rotate, arcs }: { rotate: number; arcs: { color: string; from: number; to: number }[] }) {
  // translateX(-D/4) · rotate · translateX(D/4) turns the half-disc about the CIRCLE centre rather
  // than about its own centre, which is what makes the angles mean what they say.
  const spin = (deg: number) => [{ translateX: -DONUT / 4 }, { rotate: `${deg}deg` }, { translateX: DONUT / 4 }] as const;
  return (
    <View style={[styles.wedgeFrame, { transform: [{ rotate: `${rotate}deg` }], pointerEvents: 'none' }]}>
      <View {...dataAttr('k9ChartClip')} style={styles.wedgeWindow}>
        {arcs.map((a, i) => (
          <React.Fragment key={`${a.color}-${i}`}>
            <View {...dataAttr('k9Chart')} style={[styles.wedgeBody, { backgroundColor: a.color, transform: [...spin(a.from)] }]} />
            <View style={[styles.wedgeBody, { backgroundColor: '#FFFFFF', transform: [...spin(a.to)] }]} />
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

/** Grouped horizontal bars — one label, several measures side by side (Detection Environments). */
export function GroupedBarChart({ title, groups, series, testID }: {
  title?: string; groups: { key: string; values: number[] }[]; series: string[]; testID?: string;
}) {
  const c = useColors();
  const max = Math.max(1, ...groups.flatMap((g) => g.values));
  return (
    <View testID={testID} {...dataAttr('k9Block')} style={{ marginTop: space.sm }}>
      {title ? <Text variant="bodyStrong" style={{ color: '#1E1E1C', marginBottom: space.xs }}>{title}</Text> : null}
      <View style={styles.legendInline}>
        {series.map((label, i) => (
          <View key={label} style={styles.legendChip}>
            <View {...dataAttr('k9Chart')} style={[styles.swatch, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
            <Text style={{ color: '#1E1E1C', fontSize: 16, lineHeight: 20 }}>{label}</Text>
          </View>
        ))}
      </View>
      {groups.length === 0 ? <Muted>No data in this range.</Muted> : null}
      {groups.map((g) => (
        <View key={g.key} style={{ paddingVertical: 3 }}>
          <Text style={{ color: '#1E1E1C', fontSize: 16, lineHeight: 20 }}>{g.key}</Text>
          {g.values.map((v, i) => (
            <View key={series[i]} style={styles.barRow}>
              <Text style={[styles.barLabel, { width: 150, color: '#6B6A66' }]} numberOfLines={1}>{series[i]}</Text>
              <View style={[styles.barTrack, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                <View {...dataAttr('k9Chart')} style={{ width: v <= 0 ? 0 : `${Math.max(2, (v / max) * 100)}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length], height: 18, borderRadius: 3 }} />
              </View>
              <Text style={styles.barValue}>{round1(v)}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const DONUT = 150;

function round1(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Rows run Monday → Sunday; `heat` is still indexed 0=Sunday, so the row order is a lookup. */
const HEAT_ROW_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Deployments By Day of the Week and Hour — 7 rows × 24 columns, graduated fill, Day Total column. */
export function Heatmap({ heat, max, dayTotals, testID = 'heatmap-deployments' }: {
  heat: number[][]; max: number; dayTotals: number[]; testID?: string;
}) {
  const c = useColors();
  return (
    <View {...dataAttr('k9Block')} style={{ marginTop: space.sm }}>
      <HScroll>
        <View testID={testID} {...dataAttr('k9Heat')} style={[styles.heatTable, { borderColor: c.border }]}>
          <View style={styles.heatRow}>
            <View style={[styles.heatHeadCell, { width: 62 }]}><Text style={styles.heatHeadText}>Hour</Text></View>
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} style={styles.heatCell}><Text style={styles.heatHeadText}>{String(h).padStart(2, '0')}</Text></View>
            ))}
            <View style={[styles.heatCell, { width: 76 }]}><Text style={styles.heatHeadText}>Day Total</Text></View>
          </View>
          {HEAT_ROW_ORDER.map((dow) => (
            <View key={dow} style={styles.heatRow} accessibilityLabel={`${DOW[dow]}: ${dayTotals[dow]} deployments`}>
              <View style={[styles.heatHeadCell, { width: 62 }]}><Text style={styles.heatHeadText}>{DOW[dow].slice(0, 3)}</Text></View>
              {heat[dow].map((n, h) => {
                const t = n === 0 ? 0 : 0.15 + 0.85 * (n / max);
                return (
                  <View key={h} testID={`heat-${dow}-${h}`} style={[styles.heatCell, { backgroundColor: n === 0 ? '#FFFFFF' : shade(t) }]}>
                    <Text style={[styles.heatCellText, { color: t > 0.6 ? '#FFFFFF' : '#1E1E1C' }]}>{n || ''}</Text>
                  </View>
                );
              })}
              <View style={[styles.heatCell, { width: 76, backgroundColor: c.surfaceAlt }]}>
                <Text style={[styles.heatCellText, { fontWeight: '700' }]}>{dayTotals[dow]}</Text>
              </View>
            </View>
          ))}
        </View>
      </HScroll>
      <Muted style={{ marginTop: space.xs }}>Cell = deployments started in that hour, read in each record’s own time zone. Darker = more.</Muted>
    </View>
  );
}

/** Primary teal at a given intensity (0–1). */
function shade(t: number): string {
  const from = [227, 238, 236]; // primarySoft
  const to = [20, 82, 74]; // primary
  const mix = from.map((f, i) => Math.round(f + (to[i] - f) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

/** Wide content scrolls inside its own container — the page itself never scrolls sideways.
 *  Tagged `data-k9-wide` so the print stylesheet can scale it down to the printable width. */
export function HScroll({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      {...dataAttr('k9Wide')}
      style={[{ maxWidth: '100%' }, style]}
      contentContainerStyle={{ minWidth: '100%' }}
    >
      {children}
    </ScrollView>
  );
}

export interface ReportColumn<T> { key: string; title: string; width: number; render: (row: T) => string | React.ReactNode; align?: 'left' | 'right' }

/** Optional first header row: a spanning label over a run of columns ("DETECTION" over three). */
export interface ColumnGroup { title: string; span: number; color?: string }

export function ReportTable<T>({ columns, rows, keyOf, testID, emptyText = 'No records in this range.', maxRows, groups }: {
  columns: ReportColumn<T>[]; rows: T[]; keyOf: (r: T) => string; testID?: string; emptyText?: string; maxRows?: number;
  groups?: ColumnGroup[];
}) {
  const c = useColors();
  const shown = maxRows ? rows.slice(0, maxRows) : rows;
  if (!rows.length) return <Muted testID={testID ? `${testID}-empty` : undefined} style={{ paddingVertical: space.sm }}>{emptyText}</Muted>;
  let taken = 0;
  const groupCells = (groups || []).map((g) => {
    const width = columns.slice(taken, taken + g.span).reduce((w, col) => w + col.width, 0);
    taken += g.span;
    return { ...g, width };
  });
  return (
    <View style={{ marginTop: space.xs }}>
      <HScroll>
        <View testID={testID} style={[styles.table, { borderColor: c.border }]}>
          {groupCells.length ? (
            <View style={[styles.tr, { backgroundColor: c.surfaceAlt, borderBottomColor: c.border, borderBottomWidth: 1 }]} testID={testID ? `${testID}-groups` : undefined}>
              {groupCells.map((g, i) => (
                <View key={`${g.title}-${i}`} style={[styles.td, { width: g.width, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: c.border }]}>
                  <Text variant="label" style={{ color: g.color || '#1E1E1C', letterSpacing: 0.4 }}>{g.title}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={[styles.tr, { backgroundColor: c.surfaceAlt, borderBottomColor: c.border, borderBottomWidth: 1 }]}>
            {columns.map((col) => (
              <View key={col.key} style={[styles.td, { width: col.width }]}>
                <Text variant="label" style={{ color: '#1E1E1C', textAlign: col.align }}>{col.title}</Text>
              </View>
            ))}
          </View>
          {shown.map((r, i) => (
            <View key={keyOf(r)} {...dataAttr('k9Block')} style={[styles.tr, { borderBottomColor: c.border, borderBottomWidth: i === shown.length - 1 ? 0 : 1 }]}>
              {columns.map((col) => {
                const v = col.render(r);
                return (
                  <View key={col.key} style={[styles.td, { width: col.width }]}>
                    {typeof v === 'string' || typeof v === 'number' ? <Text style={{ color: '#1E1E1C', textAlign: col.align }}>{String(v)}</Text> : v}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </HScroll>
      {maxRows && rows.length > maxRows ? (
        <Muted testID={testID ? `${testID}-truncated` : undefined} style={{ marginTop: space.xs }}>
          Showing the first {maxRows} of {rows.length} rows on screen — DOWNLOAD (PDF) and CSV include all {rows.length}.
        </Muted>
      ) : null}
    </View>
  );
}

/** Footer: on screen this is the whole of it. In print it is hidden and the SAME line is redrawn by
 *  the @page margin boxes on every page with a real `Page x of y` — the only place Chrome resolves
 *  counter(page). An in-document estimate would only ever disagree with the printer, so there is none. */
export function ReportFooter({ printedBy, agency, printedAt }: { printedBy: string; agency: string; printedAt: string }) {
  return (
    <View {...dataAttr('k9Footer')} style={styles.footer} testID="report-footer">
      <Text {...dataAttr('k9Printedby')} style={styles.footerText} testID="txt-printed-by">
        {APP_NAME} report printed by {printedBy}{agency ? `, ${agency}` : ''} on {printedAt}
      </Text>
      <Text style={styles.footerText} testID="txt-page-of">Every printed page carries this line and its page number.</Text>
    </View>
  );
}

export function PageBreak() {
  return <View {...dataAttr('k9Pagebreak')} style={{ height: 1 }} />;
}

export function NoteLine({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return <Muted testID={testID} style={{ marginTop: space.xs }}>{children}</Muted>;
}

const styles = StyleSheet.create({
  sheet: { width: '100%', maxWidth: PAGE_WIDTH, alignSelf: 'center', borderWidth: 1, borderRadius: radius.md, padding: space.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, borderBottomWidth: 2, borderBottomColor: '#14524A', paddingBottom: space.sm },
  badge: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', maxWidth: 160 },
  band: { backgroundColor: '#EDEBE6', paddingHorizontal: space.sm, paddingVertical: 6, borderRadius: 3 },
  kvWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  kvItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 3, paddingRight: space.md, gap: 6, minWidth: 240 },
  kvLabel: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: '#1E1E1C' },
  statWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, minWidth: 150, flexGrow: 1 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 3 },
  barLabel: { width: 190, fontSize: 16, lineHeight: 20, color: '#1E1E1C' },
  barTrack: { flex: 1, minWidth: 60, height: 18, borderRadius: 3, borderWidth: 1, overflow: 'hidden' },
  barValue: { width: 130, textAlign: 'right', fontSize: 16, lineHeight: 20, color: '#1E1E1C' },
  donutRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  donut: { width: DONUT, height: DONUT, borderRadius: DONUT / 2, borderWidth: 1, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  wedgeFrame: { position: 'absolute', left: 0, top: 0, width: DONUT, height: DONUT },
  wedgeWindow: { position: 'absolute', left: DONUT / 2, top: 0, width: DONUT / 2, height: DONUT, overflow: 'hidden' },
  // Absolute: every wedge layer (colour then white mask) must OVERLAY the previous one inside the
  // window. Laid out in flow they stack vertically and only the first layer is ever visible.
  wedgeBody: { position: 'absolute', left: 0, top: 0, width: DONUT / 2, height: DONUT, borderTopRightRadius: DONUT / 2, borderBottomRightRadius: DONUT / 2 },
  donutHole: {
    position: 'absolute', left: DONUT * 0.22, top: DONUT * 0.22, width: DONUT * 0.56, height: DONUT * 0.56,
    borderRadius: DONUT * 0.28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 2 },
  legendInline: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.xs },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 14, borderRadius: 3 },
  heatTable: { borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  heatRow: { flexDirection: 'row' },
  heatHeadCell: { paddingHorizontal: 4, paddingVertical: 4, justifyContent: 'center' },
  heatHeadText: { fontSize: 16, lineHeight: 18, fontWeight: '600', color: '#1E1E1C', textAlign: 'center' },
  heatCell: { width: 26, minHeight: 26, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: '#E3E1DB', borderTopWidth: 1, borderTopColor: '#E3E1DB' },
  heatCellText: { fontSize: 16, lineHeight: 18, color: '#1E1E1C' },
  table: { borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'flex-start' },
  td: { paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' },
  footer: { marginTop: space.lg, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: '#C9C6BE', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space.sm },
  footerText: { fontSize: 16, lineHeight: 20, color: '#1E1E1C' },
});
