// Supervisor tracking: the Live Tracks list (managed handlers, last 3 days) and the tactical map
// (every managed handler's track from the last 4 hours, overlaid with handler labels). Read only —
// a supervisor watches handler data, never edits it.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useList } from '@/db/provider';
import type { Track } from '@/db/types';
import { useAuth, useVisibleUserIds } from '@/features/auth/AuthProvider';
import {
  Banner, Button, Card, Divider, EmptyState, Muted, Row, Screen, Section, StatusPill, Text,
  fmtDateTime, radius, space, useColors, useIsDesktop,
} from '@/ui';
import { TrackImage } from './TrackImage';
import { TrackMap } from './TrackMap';
import {
  DEFAULT_MAP_LAYER, LIVE_TRACKS_DAYS, MAP_LAYERS, SUPERVISOR_MAP_HOURS, fmtAge, fmtClock, fmtDistance,
  getLiveTracksCount, haversineM, isLiveTrack, modeLabel, tacticalTracks, teamColor, toYards, trackPath,
  trackStatusLabel, wallClock, type MapLayer,
} from './trackModel';
import type { MapPath, MapPinMarker } from './mapTypes';

function KV({ k, v, testID }: { k: string; v: string; testID: string }) {
  return (
    <Row gap={space.sm} wrap>
      <Muted style={{ minWidth: 120 }}>{k}</Muted>
      <Text style={{ flex: 1, minWidth: 0 }} testID={testID}>{v}</Text>
    </Row>
  );
}

export function SupervisorTrackingScreen() {
  const c = useColors();
  const desktop = useIsDesktop();
  const router = useRouter();
  const { user, role } = useAuth();
  const visibleIds = useVisibleUserIds();
  const tracks = useList('track');
  const users = useList('user');
  const dogs = useList('dog');
  const [layer, setLayer] = useState<MapLayer>(DEFAULT_MAP_LAYER);
  const [selected, setSelected] = useState<string | null>(null);
  const [pointIx, setPointIx] = useState<number | null>(null);

  const managedIds = useMemo(() => visibleIds.filter((id) => id !== user?.id), [visibleIds, user?.id]);
  const now = Date.now();

  const liveCount = getLiveTracksCount({ user, managedIds, tracks, now });
  const liveList = useMemo(
    () => tracks.filter((t) => managedIds.includes(t.owner_user_id) && isLiveTrack(t, now)).sort((a, b) => ((a.started_at || '') < (b.started_at || '') ? 1 : -1)),
    [tracks, managedIds, now],
  );
  const tactical = useMemo(() => tacticalTracks(tracks, managedIds, now), [tracks, managedIds, now]);

  const selectedTrack = useMemo(() => tracks.find((t) => t.id === selected) || null, [tracks, selected]);

  /**
   * The point a supervisor stepped to: its clock time, how far into the track it is, and how many
   * yards along the path — the three things asked over a radio ("where were they at 14:12?").
   */
  const selectedPoint = useMemo(() => {
    const pts = selectedTrack?.points || [];
    if (pointIx == null || !pts.length) return null;
    const ix = Math.max(0, Math.min(pts.length - 1, pointIx));
    const p = pts[ix];
    const first = pts[0];
    let metres = 0;
    for (let i = 1; i <= ix; i++) metres += haversineM(pts[i - 1], pts[i]);
    return { at: p.at, elapsed_s: Math.max(0, Math.round((new Date(p.at).getTime() - new Date(first.at).getTime()) / 1000)), yards: toYards(metres) };
  }, [selectedTrack, pointIx]);

  const pick = (id: string) => { setSelected((cur) => (cur === id ? null : id)); setPointIx(null); };

  const nameOf = (t: Track) => users.find((u) => u.id === t.owner_user_id)?.name || 'Handler';
  const dogOf = (t: Track) => dogs.find((d) => d.id === t.dog_id)?.name || null;

  const mapPaths = useMemo<MapPath[]>(
    () => tactical.map((t, i) => ({ id: t.id, points: trackPath(t), color: teamColor(i), head: true, width: selected === t.id ? 7 : 5, label: nameOf(t) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tactical, selected, users],
  );
  const mapPins = useMemo<MapPinMarker[]>(() => {
    const out: MapPinMarker[] = [];
    tactical.forEach((t, i) => {
      const path = trackPath(t);
      if (!path.length) return;
      out.push({ id: `${t.id}-start`, lat: path[0].lat, lng: path[0].lng, color: teamColor(i), label: `${nameOf(t)} — start`, glyph: '⌂', big: true });
      const end = path[path.length - 1];
      out.push({ id: `${t.id}-end`, lat: end.lat, lng: end.lng, color: teamColor(i), label: `${nameOf(t)}${dogOf(t) ? ` · K9 ${dogOf(t)}` : ''}`, glyph: t.mode === 'training_lay' ? '🏃' : '🐕', big: true });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tactical, users, dogs]);

  if (role !== 'supervisor' && role !== 'trainer') {
    return (
      <Screen title="Live Tracks" testID="screen-supervisor-tracking">
        <Banner tone="info" title="This view is for supervisors" body="Switch to the Supervisor role to watch the tracks of the handlers you manage." testID="banner-not-supervisor" />
        <Button title="Back to Tracking" onPress={() => router.replace('/tracking' as never)} testID="btn-back-to-tracking" />
      </Screen>
    );
  }

  return (
    <Screen
      title="Live Tracks"
      subtitle={`Tracks of the handlers you manage. The list covers the last ${LIVE_TRACKS_DAYS} days; the map shows the last ${SUPERVISOR_MAP_HOURS} hours.`}
      testID="screen-supervisor-tracking"
    >
      <Row gap={space.md} wrap style={{ marginBottom: space.md }}>
        <Card style={{ flexGrow: 1, minWidth: 200 }} testID="card-live-count">
          <Muted>Live tracks · last {LIVE_TRACKS_DAYS} days</Muted>
          <Text style={{ fontSize: 32, lineHeight: 38, fontWeight: '700', color: c.primary }} testID="text-live-tracks-count">{liveCount}</Text>
        </Card>
        <Card style={{ flexGrow: 1, minWidth: 200 }} testID="card-tactical-count">
          <Muted>On the map · last {SUPERVISOR_MAP_HOURS} hours</Muted>
          <Text style={{ fontSize: 32, lineHeight: 38, fontWeight: '700', color: c.primary }} testID="text-tactical-count">{tactical.length}</Text>
        </Card>
        <Card style={{ flexGrow: 1, minWidth: 200 }} testID="card-managed-count">
          <Muted>Handlers you manage</Muted>
          <Text style={{ fontSize: 32, lineHeight: 38, fontWeight: '700', color: c.primary }} testID="text-managed-count">{managedIds.length}</Text>
        </Card>
      </Row>

      <Section title={`Tactical map — last ${SUPERVISOR_MAP_HOURS} hours`} description="Every managed team on one map. Each team has its own colour.">
        <Card style={{ padding: 0, overflow: 'hidden' }} testID="card-tactical-map">
          {tactical.length ? (
            <TrackMap paths={mapPaths} pins={mapPins} layer={layer} height={desktop ? 460 : 320} testID="tactical-map" />
          ) : (
            <View style={{ height: 180, alignItems: 'center', justifyContent: 'center', padding: space.md }}>
              <Ionicons name="map-outline" size={30} color={c.muted} />
              <Muted style={{ textAlign: 'center' }} testID="text-no-tactical">No managed handler has tracked in the last {SUPERVISOR_MAP_HOURS} hours.</Muted>
            </View>
          )}
          <Row gap={space.sm} wrap style={{ padding: space.sm }}>
            {MAP_LAYERS.map((l) => (
              <Pressable
                key={l.value}
                accessibilityRole="radio"
                accessibilityLabel={`${l.label} map`}
                accessibilityState={{ selected: layer === l.value, checked: layer === l.value }}
                testID={`btn-sup-layer-${l.value}`}
                onPress={() => setLayer(l.value)}
                style={{ minHeight: 44, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: layer === l.value ? c.primary : c.border, backgroundColor: layer === l.value ? c.primarySoft : c.surface }}
              >
                <Text style={{ color: layer === l.value ? c.primary : c.text, fontWeight: '600' }}>{l.label}</Text>
              </Pressable>
            ))}
          </Row>
          {selectedTrack ? (
            <>
              <Divider />
              <View style={{ padding: space.md, backgroundColor: c.surfaceAlt }} testID="panel-selected-track">
                <Text variant="h3" accessibilityRole="header" style={{ marginBottom: 4 }}>SELECTED TRACK</Text>
                <KV k={selectedTrack.mode === 'training_lay' ? 'Layer' : 'Follower'} v={`${nameOf(selectedTrack)}${dogOf(selectedTrack) ? ` · K9 ${dogOf(selectedTrack)}` : ''}`} testID="sel-handler" />
                <KV k="Track" v={`${selectedTrack.name} · ${modeLabel(selectedTrack.mode)}`} testID="sel-track" />
                <KV k="Duration" v={fmtClock(selectedTrack.stats?.duration_s || 0)} testID="sel-duration" />
                <KV k="Distance" v={fmtDistance(selectedTrack.stats?.distance_m || 0)} testID="sel-distance" />
                <KV k="Started" v={selectedTrack.started_at ? `${wallClock(selectedTrack.started_at, selectedTrack.tz)} (${fmtAge(selectedTrack.started_at, now)})` : '—'} testID="sel-started" />
                {selectedPoint ? (
                  <View style={{ marginTop: space.sm }} testID="panel-selected-point">
                    <Text variant="bodyStrong">SELECTED POINT</Text>
                    <KV k="Time" v={wallClock(selectedPoint.at, selectedTrack.tz)} testID="sel-point-time" />
                    <KV k="Elapsed" v={fmtClock(selectedPoint.elapsed_s)} testID="sel-point-elapsed" />
                    <KV k="Along the track" v={`${selectedPoint.yards} yards`} testID="sel-point-yards" />
                  </View>
                ) : (
                  <Muted style={{ marginTop: space.sm }} testID="text-no-point">Step through the track below to read a single point.</Muted>
                )}
                <Row gap={space.sm} wrap style={{ marginTop: space.sm }}>
                  <Button title="Track start" variant="secondary" testID="btn-point-start" onPress={() => setPointIx(0)} />
                  <Button title="Halfway" variant="secondary" testID="btn-point-mid" onPress={() => setPointIx(Math.floor(((selectedTrack.points || []).length - 1) / 2))} />
                  <Button title="Last point" variant="secondary" testID="btn-point-end" onPress={() => setPointIx((selectedTrack.points || []).length - 1)} />
                  <Button title="Open this track" testID="btn-open-selected-track" onPress={() => router.push(`/tracking/live/${selectedTrack.id}` as never)} />
                </Row>
              </View>
            </>
          ) : null}
          {tactical.length ? (
            <>
              <Divider />
              <View style={{ padding: space.sm, gap: 6 }} testID="tactical-legend">
                {tactical.map((t, i) => (
                  <Pressable
                    key={t.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${nameOf(t)} — ${t.name}`}
                    accessibilityState={{ selected: selected === t.id }}
                    testID={`legend-${t.id}`}
                    onPress={() => pick(t.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 }}
                  >
                    <View style={{ width: 18, height: 6, borderRadius: 3, backgroundColor: teamColor(i) }} />
                    <Text style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>{nameOf(t)}{dogOf(t) ? ` · K9 ${dogOf(t)}` : ''} — {t.name}</Text>
                    <Muted>{fmtDistance(t.stats?.distance_m || 0)} · {fmtClock(t.stats?.duration_s || 0)}</Muted>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </Card>
      </Section>

      <Section title={`Live Tracks — last ${LIVE_TRACKS_DAYS} days`} description="Tap a track to select it on the tactical map above, or open the track or the record it belongs to.">
        {liveList.length === 0 ? (
          <EmptyState icon="navigate-outline" title="No tracks in the last 3 days" body="Tracks made by the handlers you manage appear here while they are running and for three days afterwards." testID="empty-live-tracks" />
        ) : (
          <View style={{ gap: space.sm }}>
            {liveList.map((t) => (
              <Card key={t.id} testID={`live-track-${t.id}`} style={selected === t.id ? { borderColor: c.primary, borderWidth: 2 } : undefined}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${nameOf(t)} — ${t.name}`}
                  accessibilityState={{ selected: selected === t.id }}
                  testID={`btn-select-track-${t.id}`}
                  onPress={() => pick(t.id)}
                  style={{ flexDirection: desktop ? 'row' : 'column', gap: space.md }}
                >
                  <TrackImage track={t} width={desktop ? 200 : 240} height={130} testID={`live-track-image-${t.id}`} />
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Row gap={space.sm} wrap>
                      <Text variant="h3" style={{ flexShrink: 1 }}>{nameOf(t)}</Text>
                      <StatusPill status={t.status === 'active' ? 'active' : t.status === 'completed' ? 'complete' : 'neutral'} label={trackStatusLabel(t)} testID={`live-track-status-${t.id}`} />
                    </Row>
                    <Muted>{t.name} · {modeLabel(t.mode)}{dogOf(t) ? ` · K9 ${dogOf(t)}` : ''}</Muted>
                    <Text>{fmtDistance(t.stats?.distance_m || 0)} · {fmtClock(t.stats?.duration_s || 0)} · {t.stats?.turns ?? 0} {t.stats?.turns === 1 ? 'turn' : 'turns'} · {t.pins?.length || 0} {t.pins?.length === 1 ? 'pin' : 'pins'}</Text>
                    <Muted>{t.started_at ? `${fmtDateTime(t.started_at, t.tz)} (${fmtAge(t.started_at, now)})` : 'Not started'}</Muted>
                  </View>
                </Pressable>
                <Row gap={space.sm} wrap style={{ marginTop: space.sm }}>
                  <Button title="Show on the map" variant="secondary" testID={`btn-show-on-map-${t.id}`} accessibilityLabel={`Show ${t.name} on the tactical map`} onPress={() => pick(t.id)} />
                  <Button title="Open track" variant="secondary" testID={`btn-open-track-${t.id}`} accessibilityLabel={`Open ${t.name}`} onPress={() => router.push(`/tracking/live/${t.id}` as never)} />
                  {t.deployment_id ? (
                    <Button title="Open deployment record" variant="secondary" testID={`btn-open-deployment-${t.id}`} onPress={() => router.push(`/records/deployment/${t.deployment_id}` as never)} />
                  ) : null}
                  {t.exercise_id ? (
                    <Button title="Open training record" variant="secondary" testID={`btn-open-training-${t.id}`} onPress={() => router.push(`/records?exercise=${t.exercise_id}` as never)} />
                  ) : null}
                </Row>
              </Card>
            ))}
          </View>
        )}
      </Section>
    </Screen>
  );
}
