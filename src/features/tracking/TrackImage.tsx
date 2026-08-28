// <TrackImage/> — the static picture of a track that record views and printed reports use.
// It is a plain SVG polyline over a normalised bounding box: no tiles, no network, no map SDK, so it
// renders identically in a report, offline, and on both platforms.
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { useRecord } from '@/db/provider';
import type { Track } from '@/db/types';
import { Muted, radius, useColors } from '@/ui';
import { fmtDistance, projectToBox, statsOf, trackPath, type LatLng } from './trackModel';

export interface TrackImageProps {
  /** Either a stored track id… */
  trackId?: string | null;
  /** …or the row itself (supervisor lists already hold it). */
  track?: Track | null;
  /** An extra path drawn underneath (the laid track, when a follow track is shown). */
  underlay?: LatLng[] | null;
  width?: number;
  height?: number;
  /** Print the distance / duration caption under the drawing. */
  caption?: boolean;
  testID?: string;
}

export function TrackImage({ trackId, track, underlay, width = 220, height = 140, caption = true, testID = 'track-image' }: TrackImageProps) {
  const c = useColors();
  const fromStore = useRecord('track', track ? null : trackId);
  const row = track || fromStore || null;
  const path = row ? trackPath(row) : [];
  const under = underlay && underlay.length > 1 ? underlay : null;
  const stats = row ? (row.points?.length ? statsOf(row.points) : row.stats) : null;

  if (!row || path.length === 0) {
    return (
      <View testID={`${testID}-empty`} style={{ width, height, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
        <Muted style={{ textAlign: 'center' }}>No track points were recorded.</Muted>
      </View>
    );
  }

  const drawH = caption ? height - 22 : height;
  const { project } = projectToBox(under ? [path, under] : [path], width, drawH, 10);
  const pts = path.map(project);
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const underLine = under ? under.map(project).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') : null;
  const start = pts[0];
  const end = pts[pts.length - 1];
  const pins = (row.pins || []).map((p) => ({ ...project({ lat: p.lat, lng: p.lng }), label: p.label }));

  // Head arrow — the triangle is rotated in maths, not with an SVG transform, so the same markup
  // works in react-native-svg on web and on device.
  const prev = pts[Math.max(0, pts.length - 2)];
  const ang = Math.atan2(end.y - prev.y, end.x - prev.x);
  const rot = (dx: number, dy: number) => `${(end.x + dx * Math.cos(ang) - dy * Math.sin(ang)).toFixed(1)} ${(end.y + dx * Math.sin(ang) + dy * Math.cos(ang)).toFixed(1)}`;
  const arrow = `M ${rot(-6, -5)} L ${rot(6, 0)} L ${rot(-6, 5)} Z`;

  return (
    <View testID={testID} accessibilityLabel={`Track picture: ${fmtDistance(stats?.distance_m || 0)}`}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} testID={`${testID}-svg`}>
        <Rect x={0} y={0} width={width} height={drawH} rx={10} fill={c.surfaceAlt} stroke={c.border} strokeWidth={1} />
        {underLine ? <Polyline points={underLine} fill="none" stroke={c.warning} strokeWidth={3} strokeDasharray="6 5" strokeLinejoin="round" strokeLinecap="round" /> : null}
        <Polyline points={line} fill="none" stroke={c.primary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={start.x} cy={start.y} r={5} fill={c.success} stroke="#fff" strokeWidth={1.5} />
        <Path d={arrow} fill={c.accent} stroke="#fff" strokeWidth={1} />
        {pins.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={4} fill={c.info} stroke="#fff" strokeWidth={1.5} />
        ))}
        {caption ? (
          <SvgText x={2} y={height - 5} fill={c.muted} fontSize={16}>
            {`${fmtDistance(stats?.distance_m || 0)} · ${stats?.turns ?? 0} ${stats?.turns === 1 ? 'turn' : 'turns'}`}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}
