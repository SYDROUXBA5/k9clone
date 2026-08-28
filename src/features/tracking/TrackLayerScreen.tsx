// Lay a track without an account. Anyone can walk a training track for a K9 team; they get a
// 6-character code so the team can identify it, and the track disappears after 3 days if nobody
// follows it. Nothing else in the app is reachable from here.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { Track, TrackPoint } from '@/db/types';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  Banner, Button, Card, ConfirmDialog, Divider, Muted, Row, Screen, Text, TextField,
  fmtDateTime, radius, space, useColors, useIsDesktop, useToast,
} from '@/ui';
import { TrackImage } from './TrackImage';
import { TrackMap } from './TrackMap';
import { SIM_LENGTH_YD, SIM_ORIGIN } from './simulate';
import { useSimulateWalk } from './simPref';
import { forgetLayerTrack, recallLayerTrack, rememberLayerTrack } from './layerSession';
import { createTrack, discardTrack, saveTrackPoints, stopAbandonedLayerTracks, stopTrack } from './trackStore';
import { useLivePosition } from './useLivePosition';
import {
  ACCURACY_LIMIT_M, DEFAULT_MAP_LAYER, FOLLOW_RADIUS_YD, LAID_TRACK_EXPIRY_DAYS, LAYER_ABANDON_MINUTES,
  MAP_LAYERS, fmtClock, fmtDistance, haversineM, headingOf, isAccurate, makeTrackCode, statsOf,
  type LatLng, type MapLayer,
} from './trackModel';
import type { MapPath, MapPinMarker } from './mapTypes';

const FLUSH_MS = 5000;
const MIN_STEP_M = 1.5;
const LAYER_OWNER = 'layer';

export function TrackLayerScreen() {
  const c = useColors();
  const desktop = useIsDesktop();
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const { status, signOut } = useAuth();
  const [simulate, setSimulate] = useSimulateWalk();

  const tracks = useList('track');
  const [trackId, setTrackId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [layer, setLayer] = useState<MapLayer>(DEFAULT_MAP_LAYER);
  const [dropped, setDropped] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [resumed, setResumed] = useState(false);
  // Nothing may be appended or flushed until the stored row has been read back, or the first fix
  // after a reload would overwrite a 200-point track with a 1-point one.
  const [hydrated, setHydrated] = useState(false);
  const dirty = useRef(false);

  const track = useMemo(() => tracks.find((t) => t.id === trackId) || null, [tracks, trackId]);
  const recording = track?.status === 'active';
  // Watched from the moment the screen opens, not only while recording: Start has to know whether a
  // position feed exists before it mints a code for a track that can never hold a single point.
  const { fix, state, message } = useLivePosition({ enabled: true, simulate, origin: SIM_ORIGIN });
  const geoBlocked = state === 'denied' || state === 'unavailable' || state === 'error';

  /**
   * Pick the layer session back up after a reload.
   *
   * The repository is already loaded when this screen mounts (RepoProvider renders nothing until it
   * is), so one pass is enough: stop any layer track the runner walked away from, then restore the
   * one this device is still on — by the remembered id, or, if that pointer was lost, by finding the
   * one open track that was laid without an account. Without this the runner's code, map, stats and
   * Stop Track all vanish on refresh while the row keeps recording (PT-GPS-13).
   */
  useEffect(() => {
    if (hydrated) return;
    let alive = true;
    void (async () => {
      await stopAbandonedLayerTracks(repo, tracks);
      const rememberedId = await recallLayerTrack();
      if (!alive) return;
      const live = repo.snapshot('track');
      const remembered = rememberedId ? live.find((t) => t.id === rememberedId) : null;
      const usable = (t: (typeof live)[number] | null | undefined) =>
        !!t && t.owner_kind === 'layer' && t.status !== 'discarded';
      const found = usable(remembered)
        ? remembered!
        : live.find((t) => t.owner_kind === 'layer' && t.status === 'active') || null;
      if (found) {
        setTrackId(found.id);
        setPoints(found.points || []);
        setName(found.name || '');
        setSavedAt(found.saved_at || found.stopped_at || null);
        setResumed(true);
        if (found.id !== rememberedId) await rememberLayerTrack(found.id);
      } else if (rememberedId) {
        await forgetLayerTrack();
      }
      if (alive) setHydrated(true);
    })();
    return () => { alive = false; };
    // Runs once: `tracks` is only the initial snapshot used to sweep, and re-running would fight the
    // runner's own Start / Lay another track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, repo]);

  useEffect(() => {
    if (!fix || !recording || !hydrated) return;
    if (!isAccurate(fix.accuracy_m)) { setDropped((d) => d + 1); return; }
    setPoints((prev) => {
      const last = prev[prev.length - 1];
      if (last && haversineM(last, fix) < MIN_STEP_M) return prev;
      dirty.current = true;
      return [...prev, { lat: fix.lat, lng: fix.lng, at: fix.at, accuracy_m: fix.accuracy_m }];
    });
  }, [fix, recording, hydrated]);

  // The buffer lives in a ref so the flush timer is created once per recording session rather than
  // being restarted by every incoming fix.
  const buffer = useRef<{ id: string | null; points: TrackPoint[] }>({ id: null, points: [] });
  buffer.current = { id: trackId, points };

  const flush = useCallback(async () => {
    const b = buffer.current;
    if (!b.id || !dirty.current) return;
    dirty.current = false;
    await saveTrackPoints(repo, b.id, b.points, []);
    setSavedAt(new Date().toISOString());
  }, [repo]);

  useEffect(() => {
    if (!recording || !hydrated) return;
    const t = setInterval(() => { void flush(); }, FLUSH_MS);
    return () => { clearInterval(t); void flush(); };
  }, [recording, hydrated, flush]);

  const path = useMemo<LatLng[]>(() => points.map((p) => ({ lat: p.lat, lng: p.lng })), [points]);
  const stats = useMemo(() => statsOf(points), [points]);

  const start = async () => {
    // No feed, no track. Handing a runner a 6-character code for a track that recorded nothing — and
    // that then sits in the picker for three days — is worse than refusing to start.
    if (geoBlocked) {
      toast.show('No position feed — allow location or turn on Simulate walk before starting', 'error');
      return;
    }
    const taken = new Set(tracks.map((t) => t.code || '').filter(Boolean));
    const code = makeTrackCode(taken);
    const t = await createTrack(repo, {
      mode: 'training_lay',
      name: name.trim() || `Laid track ${code}`,
      dogId: null,
      ownerId: LAYER_OWNER,
      ownerKind: 'layer',
      visibility: 'hidden',
      code,
    });
    setPoints([]);
    setTrackId(t.id);
    setResumed(false);
    // Remembered before the first fix arrives, so even an immediate refresh comes back to this track.
    await rememberLayerTrack(t.id);
  };

  const stop = async () => {
    if (!trackId) return;
    await stopTrack(repo, trackId, points, []);
    setSavedAt(new Date().toISOString());
    toast.show('Track laid — give the team the code');
  };

  const discard = async () => {
    if (!trackId) return;
    await discardTrack(repo, trackId);
    await forgetLayerTrack();
    setTrackId(null);
    setPoints([]);
    setResumed(false);
    setDiscardOpen(false);
    toast.show('Track discarded');
  };

  /** Back to the start form for a second track — the finished one keeps its code and stays followable. */
  const layAnother = async () => {
    await forgetLayerTrack();
    setTrackId(null);
    setPoints([]);
    setName('');
    setSavedAt(null);
    setResumed(false);
  };

  const mapPaths: MapPath[] = path.length > 1 ? [{ id: 'laid', points: path, color: '#B26A00', head: true, width: 5 }] : [];
  // Same glyph vocabulary as the handler screens: a house marks where a track begins.
  const mapPins: MapPinMarker[] = path.length ? [{ id: 'start', lat: path[0].lat, lng: path[0].lng, color: '#2E7D32', label: 'Track start', glyph: '⌂', big: true }] : [];

  return (
    <Screen
      title="Lay a track"
      subtitle={`No account needed. Walk the track, stop, and hand the team the code — any K9 team that starts within ${FOLLOW_RADIUS_YD} yards can follow it for ${LAID_TRACK_EXPIRY_DAYS} days.`}
      testID="screen-track-layer"
    >
      {geoBlocked ? (
        <Banner tone="warning" title="Location is not available" body={`${message || ''} No track is started and no code is issued until a position can be read.`} testID="banner-layer-geo" />
      ) : null}

      {resumed && track ? (
        <Banner
          tone="info"
          title={recording ? 'Picked your track back up' : 'Your laid track is still here'}
          body={recording
            ? `This device was still laying ${track.name}. The code, the map and the points below are the same track — it never stopped recording.`
            : `${track.name} was already stopped. Hand the team the code below, or start a second track.`}
          testID="banner-layer-resumed"
        />
      ) : null}

      {!track ? (
        <Card testID="card-layer-start">
          <TextField label="Track name" testID="input-layer-name" value={name} onChangeText={setName} placeholder="Ridge Park runner" maxLength={60} help="Optional — the team sees this name beside the code." />
          <Button title="Start Track" icon="play" size="lg" testID="btn-layer-start" disabled={geoBlocked} onPress={() => void start()} />
          {geoBlocked ? <Muted testID="text-layer-start-blocked">Start is off until a position can be read — allow location, or switch Simulate walk on below.</Muted> : null}
          <Divider style={{ marginVertical: space.md }} />
          <Row gap={space.sm} align="flex-start">
            <Ionicons name="construct-outline" size={22} color={c.muted} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyStrong">Developer · Simulate walk</Text>
              <Muted>Feeds a synthetic {SIM_LENGTH_YD}-yard path at one point per second so this screen can be tried without moving.</Muted>
            </View>
            <Button title={simulate ? 'Simulate walk: On' : 'Simulate walk: Off'} variant={simulate ? 'primary' : 'secondary'} testID="btn-layer-simulate" accessibilityLabel="Simulate walk" onPress={() => setSimulate(!simulate)} />
          </Row>
        </Card>
      ) : (
        <>
          <Card testID="card-layer-code">
            <Muted>Track code</Muted>
            <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 4, color: c.primary }} testID="text-track-code">{track.code || '——————'}</Text>
            <Muted>{track.name} · started {track.started_at ? fmtDateTime(track.started_at, track.tz) : ''}</Muted>
            {track.expires_at ? <Muted testID="text-layer-expiry">Disappears {fmtDateTime(track.expires_at, track.tz)} if nobody follows it.</Muted> : null}
            <Muted testID="text-layer-recovery">
              {recording
                ? `Keep this page open while you walk. If you close it, come back to this address — the track is picked up where you left it, and after ${LAYER_ABANDON_MINUTES} minutes with nothing recorded it is stopped for you so the team can still follow it.`
                : 'Stopped and saved. Any K9 team on this device can now pick it up with this code.'}
            </Muted>
          </Card>

          <Card style={{ marginTop: space.md, padding: 0, overflow: 'hidden' }} testID="card-layer-map">
            <TrackMap paths={mapPaths} pins={mapPins} center={path[path.length - 1] || null} heading={headingOf(path)} layer={layer} height={desktop ? 380 : 280} testID="track-map" />
            <Row gap={space.sm} wrap style={{ padding: space.sm }}>
              {MAP_LAYERS.map((l) => (
                <Pressable
                  key={l.value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${l.label} map`}
                  accessibilityState={{ selected: layer === l.value, checked: layer === l.value }}
                  testID={`btn-layer-map-${l.value}`}
                  onPress={() => setLayer(l.value)}
                  style={{ minHeight: 44, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: layer === l.value ? c.primary : c.border, backgroundColor: layer === l.value ? c.primarySoft : c.surface }}
                >
                  <Text style={{ color: layer === l.value ? c.primary : c.text, fontWeight: '600' }}>{l.label}</Text>
                </Pressable>
              ))}
            </Row>
          </Card>

          <Card style={{ marginTop: space.md }} testID="card-layer-stats">
            <Row gap={space.lg} wrap>
              <Stat label="Distance" value={fmtDistance(stats.distance_m)} testID="stat-layer-distance" />
              <Stat label="Duration" value={fmtClock(stats.duration_s)} testID="stat-layer-duration" />
              <Stat label="Turns" value={String(stats.turns)} testID="stat-layer-turns" />
            </Row>
            <Muted style={{ marginTop: space.sm }} testID="text-layer-save-state">
              {savedAt ? `Saved ${fmtDateTime(savedAt, track.tz)}` : 'Nothing saved yet'}
              {dropped ? ` · ${dropped} inaccurate ${dropped === 1 ? 'point' : 'points'} dropped (over ±${ACCURACY_LIMIT_M} m)` : ''}
            </Muted>
          </Card>

          <Row gap={space.sm} wrap style={{ marginTop: space.md }}>
            {recording ? (
              <Button title="Stop Track" variant="danger" icon="stop" size="lg" testID="btn-layer-stop" onPress={() => void stop()} />
            ) : (
              <>
                <Button title="Lay another track" icon="add" testID="btn-layer-new" onPress={() => void layAnother()} />
                <Button title="Discard Track" variant="danger" testID="btn-layer-discard" onPress={() => setDiscardOpen(true)} />
              </>
            )}
          </Row>

          {!recording ? (
            <Card style={{ marginTop: space.md }} testID="card-layer-summary">
              <Text variant="h3" style={{ marginBottom: space.sm }}>Laid track</Text>
              <TrackImage track={{ ...(track as Track), points }} width={desktop ? 420 : 280} height={200} testID="track-image-layer" />
            </Card>
          ) : null}
        </>
      )}

      <Divider style={{ marginVertical: space.lg }} />
      <Row gap={space.sm} wrap>
        <Button
          title="Sign in with an account"
          variant="secondary"
          testID="btn-layer-sign-in-account"
          onPress={async () => { if (status === 'layer') await signOut(); router.replace('/sign-in' as never); }}
        />
        <Muted style={{ flex: 1, minWidth: 200 }}>A K9 team following a track needs an account; laying one does not.</Muted>
      </Row>

      <ConfirmDialog
        visible={discardOpen}
        title="Confirm Discard Track"
        body="The laid track and its points are thrown away. No team will be able to follow it."
        confirmTitle="Discard"
        onConfirm={() => void discard()}
        onCancel={() => setDiscardOpen(false)}
        testID="dialog-layer-discard"
      />
    </Screen>
  );
}

function Stat({ label, value, testID }: { label: string; value: string; testID: string }) {
  const c = useColors();
  return (
    <View style={{ minWidth: 120 }} testID={testID}>
      <Muted>{label}</Muted>
      <Text style={{ fontSize: 24, lineHeight: 30, fontWeight: '700', color: c.primary }}>{value}</Text>
    </View>
  );
}
