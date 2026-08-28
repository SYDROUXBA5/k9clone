// <TrackImage/> — the GPS-track slot in a full record report. Renders NOTHING when the record has no
// track, so reports for records that were never tracked print with no empty box.
// The plot is drawn from the stored points (no map tiles, so it prints): a connected path with a
// START and an END marker, the dropped pins, and a scale bar.
//
// Three rules make this safe to put in front of a court:
//   1. The box is MEASURED (onLayout), never assumed. Every coordinate is computed against the width
//      the box actually has on this screen, so nothing is ever drawn outside the clip region.
//   2. Both axes share ONE metres-per-pixel scale, so the shape of the track is the shape that was run.
//   3. The printed Track Distance and the scale bar come from the SAME source — the stored points.
//      When there are no points we print the stored figure and draw no scale bar, rather than pairing
//      a stored number with a bar that measures something else.
import React from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { Track, TrackPoint } from '@/db/types';
import { mToMiles, mToYards } from '@/db/util';
import { Muted, Text, radius, space, useColors } from '@/ui';
import { Band, KVBlock, dataAttr } from './chrome';

const BOX_W = 520; // the widest the plot is ever drawn; narrower screens measure smaller and rescale
const BOX_H = 260;
const PAD = 24; // room for the START / END markers, whose discs stick 11px out from their point
const MARKER_R = 11;

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320;
/** Scale-bar steps in metres — the largest that spans no more than a third of the track wins. */
const SCALE_STEPS = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

const RAD = Math.PI / 180;

/** Great-circle metres between two recorded fixes. */
function legMetres(a: TrackPoint, b: TrackPoint): number {
  const dLat = (b.lat - a.lat) * M_PER_DEG_LAT;
  const dLng = (b.lng - a.lng) * M_PER_DEG_LNG * Math.cos(((a.lat + b.lat) / 2) * RAD);
  return Math.hypot(dLat, dLng);
}

/** Path length of the recording, in metres — the same numbers the plot above is drawn from. */
export function trackPointsDistanceM(points: TrackPoint[] | null | undefined): number | null {
  if (!points || points.length < 2) return null;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += legMetres(points[i - 1], points[i]);
  return total;
}

function imperial(m: number): string {
  return m >= 1609 ? `${mToMiles(m)} Miles` : `${mToYards(m)} Yards`;
}

export function TrackImage({ track, title = 'TRACKING MAP', caption }: {
  track: Track | null | undefined;
  title?: string;
  /** Printed under the plot — say where these figures came from when the record also carries
   *  hand-entered track figures that the GPS recording will not agree with. */
  caption?: string;
}) {
  const c = useColors();
  // Measured width of the plot box. Until it is known we draw the empty box only: a path laid out
  // against a guessed width is a path that runs off the paper.
  const [boxW, setBoxW] = React.useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setBoxW((prev) => (prev === w ? prev : w));
  };

  if (!track) return null;
  const points = track.points || [];
  const hasPlot = points.length > 0;
  // Distance the DRAWING represents. Falls back to the stored figure only when there is no recording.
  const measuredM = trackPointsDistanceM(points);
  const storedM = track.stats?.distance_m ?? null;
  const distanceM = measuredM ?? storedM;

  const plot = (() => {
    if (!hasPlot || boxW === null) return null;
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const midLat = (minLat + maxLat) / 2;
    const mPerLng = M_PER_DEG_LNG * Math.cos(midLat * RAD);
    const widthM = Math.max(1e-3, (maxLng - minLng) * mPerLng);
    const heightM = Math.max(1e-3, (maxLat - minLat) * M_PER_DEG_LAT);
    const innerW = Math.max(1, boxW - PAD * 2);
    const innerH = BOX_H - PAD * 2;
    // One scale for both axes: a track squeezed differently in x and y is not the track that was run.
    const pxPerM = Math.min(innerW / widthM, innerH / heightM);
    const offX = PAD + (innerW - widthM * pxPerM) / 2;
    const offY = PAD + (innerH - heightM * pxPerM) / 2;
    const pt = (lat: number, lng: number) => ({
      left: offX + (lng - minLng) * mPerLng * pxPerM,
      top: offY + (maxLat - lat) * M_PER_DEG_LAT * pxPerM,
    });
    const xy = points.map((p) => pt(p.lat, p.lng));
    // Each leg is a thin bar laid on its own midpoint and rotated — rotating about the default centre
    // origin works identically on web and native, with no transformOrigin support needed.
    const legs = xy.slice(1).map((b, i) => {
      const a = xy[i];
      const dx = b.left - a.left;
      const dy = b.top - a.top;
      const len = Math.hypot(dx, dy);
      return {
        key: i,
        len,
        left: (a.left + b.left) / 2 - len / 2,
        top: (a.top + b.top) / 2 - 1.5,
        deg: (Math.atan2(dy, dx) * 180) / Math.PI,
      };
    }).filter((l) => l.len > 0.5);
    // The bar step is chosen from the TRACK, not from the box, so the same recording carries the same
    // scale figure on a phone and on a desktop — only its pixel length changes with the drawing.
    const spanM = Math.max(widthM, heightM);
    const barM = SCALE_STEPS.filter((m) => m <= spanM / 3).pop() || SCALE_STEPS[0];
    return { xy, legs, pt, barM, barPx: Math.max(20, barM * pxPerM), start: xy[0], end: xy[xy.length - 1] };
  })();

  return (
    <Band title={title} testID="report-track">
      <View
        {...dataAttr('k9Block')}
        onLayout={onLayout}
        style={[styles.box, { width: BOX_W, maxWidth: '100%', height: BOX_H, borderColor: c.border, backgroundColor: c.surfaceAlt }]}
        accessibilityLabel={hasPlot
          ? `Track path drawn from ${points.length} GPS points, with start and end markers${plot ? ` and a ${plot.barM} metre scale bar` : ''}`
          : 'No GPS points were recorded for this track, so no path is drawn'}
        testID="track-plot"
      >
        {plot ? (
          <>
            {plot.legs.map((l) => (
              <View
                key={l.key}
                {...dataAttr('k9Chart')}
                style={[styles.leg, { left: l.left, top: l.top, width: l.len, backgroundColor: c.primary, transform: [{ rotate: `${l.deg}deg` }] }]}
              />
            ))}
            {plot.xy.map((p, i) => (
              <View key={`p${i}`} style={[styles.dot, { left: p.left - 2, top: p.top - 2, backgroundColor: c.primary }]} />
            ))}
            {track.pins?.map((p) => {
              const pos = plot.pt(p.lat, p.lng);
              return (
                <View key={p.id} style={[styles.pin, { left: pos.left - 8, top: pos.top - 8, borderColor: c.accent, backgroundColor: '#FFFFFF' }]}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
                </View>
              );
            })}
            <View style={[styles.marker, { left: plot.start.left - MARKER_R, top: plot.start.top - MARKER_R, backgroundColor: c.success, borderColor: '#FFFFFF' }]} testID="track-start">
              <Text style={styles.markerText}>S</Text>
            </View>
            <View style={[styles.marker, { left: plot.end.left - MARKER_R, top: plot.end.top - MARKER_R, backgroundColor: c.accent, borderColor: '#FFFFFF' }]} testID="track-end">
              <Text style={styles.markerText}>E</Text>
            </View>
            <View style={styles.scaleWrap} testID="track-scale">
              <View style={[styles.scaleBar, { width: plot.barPx, borderColor: '#1E1E1C' }]} />
              <Text style={styles.scaleText}>{plot.barM >= 1609 ? `${mToMiles(plot.barM)} mi` : `${mToYards(plot.barM)} yd`}</Text>
            </View>
          </>
        ) : hasPlot ? null : (
          <View style={styles.emptyWrap}>
            <Text style={styles.scaleText} testID="txt-track-nopoints">No GPS points were recorded, so no path can be drawn.</Text>
          </View>
        )}
      </View>
      <Muted style={{ marginTop: space.xs }} testID="txt-track-legend">
        S = start of the recording · E = end · circles = dropped pins · the line is the path between the recorded points.
      </Muted>
      <KVBlock
        testID="track-stats"
        items={[
          { label: 'Track Name', value: track.name || '—' },
          { label: 'Track Distance', value: distanceM === null ? '—' : imperial(distanceM) },
          { label: 'Track Turns', value: String(track.stats?.turns ?? '—') },
          { label: 'Track Duration', value: track.stats?.duration_s ? `${Math.round(track.stats.duration_s / 60)} minutes` : '—' },
          { label: 'Pinned Photos', value: String((track.pins || []).filter((p) => p.photo_id).length) },
          { label: 'Points Recorded', value: String(points.length) },
        ]}
      />
      <Muted style={{ marginTop: space.xs }} testID="txt-track-note">
        {measuredM !== null
          ? (caption || `Track Distance is the length of the path drawn above, measured across its ${points.length} recorded GPS points.`)
          : 'No GPS points were uploaded for this track, so Track Distance is the figure stored with the recording and the plot above is left blank.'}
      </Muted>
    </Band>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.md, position: 'relative', overflow: 'hidden' },
  leg: { position: 'absolute', height: 3, borderRadius: 2 },
  dot: { position: 'absolute', width: 4, height: 4, borderRadius: 2 },
  pin: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  marker: { position: 'absolute', width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  markerText: { color: '#FFFFFF', fontSize: 16, lineHeight: 18, fontWeight: '700' },
  scaleWrap: { position: 'absolute', left: 8, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  scaleBar: { height: 8, borderLeftWidth: 2, borderRightWidth: 2, borderBottomWidth: 2 },
  scaleText: { fontSize: 16, lineHeight: 18, color: '#1E1E1C' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
});

export { Text };
