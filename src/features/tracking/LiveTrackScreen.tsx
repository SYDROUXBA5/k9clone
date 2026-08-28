// The live tracking screen: map, running stats, pins, and the stop sheet.
// Points are held in state while recording and flushed to the repository every few seconds so a
// closed tab never loses more than a moment of the track; every flush shows in the save line.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useList, useRecord, useRepo } from '@/db/provider';
import type { TrackPin, TrackPoint, Weather } from '@/db/types';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchWeather, weatherSummary } from '@/features/weather/openMeteo';
import {
  Banner, Button, Card, ConfirmDialog, Divider, Muted, Row, Screen, Section, Sheet, Text, TextField,
  fmtDateTime, radius, space, useColors, useIsDesktop, useToast,
} from '@/ui';
import { PinPhotoInput } from './PinPhotoInput';
import { TrackImage } from './TrackImage';
import { TrackMap } from './TrackMap';
import { SIM_ORIGIN } from './simulate';
import { useSimulateWalk } from './simPref';
import {
  attachTrackToCompletion, attachTrackToDeployment, createPinPhoto, discardTrack, markSavedForLater,
  resumeTrack, saveTrackPoints, stopTrack, syncTrackToRecord,
} from './trackStore';
import { useLivePosition } from './useLivePosition';
import {
  ACCURACY_LIMIT_M, DEFAULT_MAP_LAYER, MAP_LAYERS, compass, deviationFrom, fmtClock, fmtDistance,
  haversineM, headingOf, isAccurate, modeLabel, statsOf, toYards, trackPath, trackStatusLabel,
  visibilityLabel, visiblePortion, wallClock, type LatLng, type MapLayer,
} from './trackModel';
import type { MapPath, MapPinMarker } from './mapTypes';

const FLUSH_MS = 5000;
/** Marker glyphs — a house where a track starts, a runner on a laid track, a dog on a worked track. */
const GLYPH_START = '⌂';
const GLYPH_RUNNER = '🏃';
const GLYPH_DOG = '🐕';
/** Fixes closer together than this add noise, not track. */
const MIN_STEP_M = 1.5;

export function LiveTrackScreen({ id }: { id: string }) {
  const c = useColors();
  const desktop = useIsDesktop();
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [simulate] = useSimulateWalk();

  const track = useRecord('track', id);
  const tracks = useList('track');
  const completions = useList('completion', (x) => x.handler_id === user?.id);
  const deployments = useList('deployment', (d) => d.handler_id === user?.id);
  const exercises = useList('exercise');
  const documents = useList('document');

  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [pins, setPins] = useState<TrackPin[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [layer, setLayer] = useState<MapLayer>(DEFAULT_MAP_LAYER);
  const [mapOpen, setMapOpen] = useState(true);
  const [editingPin, setEditingPin] = useState<TrackPin | null>(null);
  const [dropped, setDropped] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const dirty = useRef(false);
  const weatherTried = useRef(false);
  const quickRef = useRef<{ click: () => void } | null>(null);

  const recording = track?.status === 'active';
  const { fix, state, message } = useLivePosition({ enabled: !!recording, simulate, origin: SIM_ORIGIN });

  // hydrate the buffer from the stored row once
  useEffect(() => {
    if (hydrated || !track) return;
    setPoints(track.points || []);
    setPins(track.pins || []);
    setWeather(track.weather || null);
    // The save line must tell the truth about the stored row, not about this component's lifetime:
    // re-opening a track that was explicitly saved used to say "Nothing saved yet".
    setSavedAt(track.saved_at || track.stopped_at || null);
    setHydrated(true);
  }, [track, hydrated]);

  // append every usable fix
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

  // weather at the first fix
  useEffect(() => {
    if (weather || weatherTried.current || !points.length || !recording) return;
    weatherTried.current = true;
    const p = points[0];
    void fetchWeather(p.at, p.lat, p.lng).then((res) => { if (res.ok) setWeather(res.weather); });
  }, [points, weather, recording]);

  // Periodic flush. The buffer lives in a ref so the interval is created once per recording session
  // instead of being torn down and restarted by every incoming fix.
  const buffer = useRef<{ id: string | null; points: TrackPoint[]; pins: TrackPin[]; weather: Weather | null }>({ id: null, points: [], pins: [], weather: null });
  buffer.current = { id: track?.id || null, points, pins, weather };

  const flush = useCallback(async () => {
    const b = buffer.current;
    if (!b.id || !dirty.current) return;
    dirty.current = false;
    try {
      await saveTrackPoints(repo, b.id, b.points, b.pins, b.weather);
      setSavedAt(new Date().toISOString());
      setSaveError(null);
    } catch {
      dirty.current = true;
      setSaveError('The last few seconds are not saved yet — they are still on this device and will be written again.');
    }
  }, [repo]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => { void flush(); }, FLUSH_MS);
    return () => { clearInterval(t); void flush(); };
  }, [recording, flush]);

  const path = useMemo<LatLng[]>(() => points.map((p) => ({ lat: p.lat, lng: p.lng })), [points]);
  const stats = useMemo(() => statsOf(points), [points]);
  const heading = useMemo(() => (fix?.heading ?? headingOf(path)), [fix, path]);

  const laid = tracks.find((t) => t.id === track?.laid_track_id) || null;
  const finished = !!track && track.status !== 'active';
  const laidView = laid ? visiblePortion(laid, finished) : null;
  const deviation = laid && finished ? deviationFrom(trackPath(laid), path) : null;

  const mapPaths = useMemo<MapPath[]>(() => {
    const out: MapPath[] = [];
    if (laidView && laidView.path.length > 1) out.push({ id: 'laid', points: laidView.path, color: '#B26A00', width: 5, label: 'Laid track' });
    if (path.length > 1) out.push({ id: 'mine', points: path, color: track?.mode === 'training_lay' ? '#B26A00' : '#1F5F8B', head: true, width: 5, label: 'My track' });
    return out;
  }, [laidView, path, track?.mode]);

  // Glyphs say what made the mark: a house where the track begins, a runner on a laid track, a dog on
  // the track the team is working. Identical dots would make an overlaid follow map unreadable.
  const mineGlyph = track?.mode === 'training_lay' ? GLYPH_RUNNER : GLYPH_DOG;
  const mapPins = useMemo<MapPinMarker[]>(() => {
    const out: MapPinMarker[] = [];
    if (laidView?.start) out.push({ id: 'laid-start', lat: laidView.start.lat, lng: laidView.start.lng, color: '#B26A00', label: `${laid?.name || 'Laid track'} start`, glyph: GLYPH_START, big: true });
    if (laidView?.showPins && laid) for (const p of laid.pins || []) out.push({ id: `laid-pin-${p.id}`, lat: p.lat, lng: p.lng, color: '#B26A00', label: p.label || 'Laid track pin', glyph: GLYPH_RUNNER });
    if (path.length) out.push({ id: 'start', lat: path[0].lat, lng: path[0].lng, color: '#2E7D32', label: 'Track start', glyph: GLYPH_START, big: true });
    for (const p of pins) out.push({ id: `pin-${p.id}`, lat: p.lat, lng: p.lng, color: '#E4572E', label: p.label || 'Pin', glyph: mineGlyph, big: true });
    return out;
  }, [laidView, laid, path, pins, mineGlyph]);

  if (!track) {
    return (
      <Screen title="Track" testID="screen-live-track">
        <Banner tone="warning" title="That track is not on this device" body="It may have been discarded, or it belongs to another account." testID="banner-track-missing" />
        <Button title="Back to Tracking" onPress={() => router.replace('/tracking' as never)} testID="btn-back-tracking" />
      </Screen>
    );
  }

  const readPhoto = async (file: File): Promise<string | null> => {
    try {
      const dataUri = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => resolve('');
        r.readAsDataURL(file);
      });
      return await createPinPhoto(repo, track.id, { name: file.name, type: file.type, size: file.size, dataUri });
    } catch {
      toast.show('The photo could not be read — the pin was kept without it', 'error');
      return null;
    }
  };

  const writePins = async (next: TrackPin[]) => {
    setPins(next);
    dirty.current = true;
    await saveTrackPoints(repo, track.id, points, next, weather);
    setSavedAt(new Date().toISOString());
  };

  /** Add a pin at the current position, or rewrite the one being edited. */
  const savePin = async (label: string, file: File | null, editing: TrackPin | null) => {
    if (editing) {
      const photoId = file ? await readPhoto(file) : editing.photo_id;
      await writePins(pins.map((p) => (p.id === editing.id ? { ...p, label: label.trim() || p.label, photo_id: photoId } : p)));
      toast.show('Pin updated');
      return;
    }
    const at = fix || (path.length ? { lat: path[path.length - 1].lat, lng: path[path.length - 1].lng } : null);
    if (!at) { toast.show('No position yet — the pin needs a fix first', 'error'); return; }
    const photoId = file ? await readPhoto(file) : null;
    const pin: TrackPin = { id: `${Date.now()}`, lat: at.lat, lng: at.lng, at: new Date().toISOString(), label: label.trim() || `Pin ${pins.length + 1}`, photo_id: photoId };
    await writePins([...pins, pin]);
    toast.show('Pin added');
  };

  /**
   * Quick Pin — one tap, photo, done. Standing in the field with a dog on a line, opening a sheet to
   * type a note is the thing a handler will not do; the note can be added later from the pin list.
   */
  const quickPin = async (file: File) => {
    const at = fix || (path.length ? { lat: path[path.length - 1].lat, lng: path[path.length - 1].lng } : null);
    if (!at) { toast.show('No position yet — the pin needs a fix first', 'error'); return; }
    const photoId = await readPhoto(file);
    const pin: TrackPin = { id: `${Date.now()}`, lat: at.lat, lng: at.lng, at: new Date().toISOString(), label: `Photo ${pins.length + 1}`, photo_id: photoId };
    await writePins([...pins, pin]);
    toast.show('Quick pin added');
  };

  const doStop = async () => {
    await stopTrack(repo, track.id, points, pins, weather);
    // A Deployment Track already has its record; the measurements go there now rather than waiting
    // for an attach step this mode never reaches.
    await syncTrackToRecord(repo, track.id);
    setSavedAt(new Date().toISOString());
    setStopOpen(true);
  };

  const doResume = async () => {
    await resumeTrack(repo, track.id);
    setStopOpen(false);
  };

  const doSaveForLater = async () => {
    await markSavedForLater(repo, track.id);
    setStopOpen(false);
    toast.show('Track saved — attach it to a record whenever you like');
    router.replace('/tracking' as never);
  };

  const doDiscard = async () => {
    await discardTrack(repo, track.id);
    setDiscardOpen(false);
    setStopOpen(false);
    toast.show('Track discarded');
    router.replace('/tracking' as never);
  };

  const openCompletions = completions.filter((x) => !x.is_complete);
  const openDeployments = deployments.filter((d) => !d.is_complete);

  const attach = async (kind: 'completion' | 'deployment', recordId: string) => {
    try {
      if (kind === 'completion') await attachTrackToCompletion(repo, track.id, recordId);
      else await attachTrackToDeployment(repo, track.id, recordId);
      setAttachOpen(false);
      setStopOpen(false);
      toast.show('Track attached to the record');
      // Land on the tab the track just filled, not on the event's first exercise: the handler came
      // here to see the map and the measurements on their own dog's completion.
      const cp = kind === 'completion' ? completions.find((x) => x.id === recordId) : null;
      router.push((cp
        ? `/records/training/${cp.event_id}?exercise=${cp.exercise_id}&dog=${cp.dog_id}`
        : `/records/deployment/${recordId}`) as never);
    } catch {
      toast.show('The track could not be attached — it is still saved', 'error');
    }
  };

  const gpsQuality = !recording
    ? 'Stopped'
    : state !== 'live'
      ? 'Waiting'
      : fix?.simulated
        ? 'Simulated'
        : fix?.accuracy_m == null
          ? 'Good'
          : fix.accuracy_m <= 10 ? 'Good' : fix.accuracy_m <= ACCURACY_LIMIT_M ? 'Fair' : 'Poor';

  const statTiles = [
    { key: 'start', label: 'Start time', value: track.started_at ? wallClock(track.started_at, track.tz) : '—', testID: 'stat-start-time' },
    { key: 'distance', label: 'Distance', value: fmtDistance(stats.distance_m), testID: 'stat-distance' },
    { key: 'duration', label: 'Duration', value: fmtClock(stats.duration_s), testID: 'stat-duration' },
    { key: 'turns', label: 'Turns', value: String(stats.turns), testID: 'stat-turns' },
    { key: 'points', label: 'Points', value: `${stats.points_uploaded} / ${stats.points_total} uploaded`, testID: 'stat-points' },
    { key: 'gps', label: 'GPS quality', value: gpsQuality, testID: 'stat-gps-quality' },
  ];

  return (
    <Screen
      title={track.name}
      subtitle={`${modeLabel(track.mode)} · ${trackStatusLabel(track)}${track.mode === 'training_lay' ? ` · ${visibilityLabel(track.visibility)}` : ''}`}
      testID="screen-live-track"
    >
      {state === 'denied' || state === 'unavailable' || state === 'error' ? (
        <Banner tone="danger" title="Location is not available" body={message || ''} testID="banner-geo-denied" />
      ) : null}
      {saveError ? <Banner tone="warning" title="Not saved yet" body={saveError} testID="banner-save-error" /> : null}
      {laidView ? <Banner tone="info" body={laidView.note} testID="banner-laid-visibility" /> : null}

      <Card style={{ padding: 0, overflow: 'hidden' }} testID="card-map">
        {mapOpen ? (
          <TrackMap paths={mapPaths} pins={mapPins} center={path[path.length - 1] || null} heading={heading} layer={layer} height={desktop ? 420 : 300} testID="track-map" />
        ) : null}
        <Row gap={space.sm} wrap style={{ padding: space.sm }}>
          <Button
            title={mapOpen ? 'Minimize map' : 'Show map'}
            variant="secondary"
            icon={mapOpen ? 'chevron-up' : 'chevron-down'}
            testID="btn-toggle-map"
            accessibilityLabel={mapOpen ? 'Minimize map' : 'Show map'}
            onPress={() => setMapOpen((v) => !v)}
          />
          {MAP_LAYERS.map((l) => (
            <Pressable
              key={l.value}
              accessibilityRole="radio"
              accessibilityLabel={`${l.label} map`}
              accessibilityState={{ selected: layer === l.value, checked: layer === l.value }}
              testID={`btn-layer-${l.value}`}
              onPress={() => setLayer(l.value)}
              style={{ minHeight: 44, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: layer === l.value ? c.primary : c.border, backgroundColor: layer === l.value ? c.primarySoft : c.surface }}
            >
              <Text style={{ color: layer === l.value ? c.primary : c.text, fontWeight: '600' }}>{l.label}</Text>
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          <Muted testID="text-gps-line">
            {recording ? (state === 'live' ? `GPS: ${fix?.simulated ? 'Simulated' : 'Good'}` : 'GPS: waiting…') : 'Recording stopped'}
            {dropped ? ` · ${dropped} inaccurate ${dropped === 1 ? 'point' : 'points'} dropped (over ±${ACCURACY_LIMIT_M} m)` : ''}
          </Muted>
        </Row>
      </Card>

      <Card style={{ marginTop: space.md }} testID="card-stats">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          {statTiles.map((t) => (
            <View key={t.key} style={{ minWidth: 130, flexGrow: 1 }} testID={t.testID}>
              <Muted>{t.label}</Muted>
              <Text style={{ fontSize: 24, lineHeight: 30, fontWeight: '700', color: c.primary }}>{t.value}</Text>
            </View>
          ))}
        </View>
        <Divider style={{ marginVertical: space.sm }} />
        <Row gap={space.sm} align="flex-start">
          <Ionicons name="partly-sunny-outline" size={20} color={c.primary} />
          <Text style={{ flex: 1, minWidth: 0 }} testID="text-weather">
            Weather at start: {weather && weatherSummary(weather) ? weatherSummary(weather) : recording ? 'looking it up…' : 'not recorded'}
          </Text>
        </Row>
        <Muted style={{ marginTop: 4 }} testID="text-save-state">
          {savedAt ? `${track.saved_for_later ? 'Saved for later' : 'Saved'} ${fmtDateTime(savedAt, track.tz)}` : 'Nothing saved yet'}
        </Muted>
      </Card>

      <Row gap={space.sm} wrap style={{ marginTop: space.md }}>
        {recording ? (
          <>
            <Button title="Stop Track" variant="danger" icon="stop" size="lg" testID="btn-stop-track" onPress={() => void doStop()} />
            <Button title="+ Pin" variant="secondary" icon="location" size="lg" testID="btn-add-pin" accessibilityLabel="Add pin" onPress={() => { setEditingPin(null); setPinOpen(true); }} />
            <Button
              title="Quick Pin"
              variant="secondary"
              icon="camera"
              size="lg"
              testID="btn-quick-pin"
              accessibilityLabel="Quick pin with a photo"
              onPress={() => { if (Platform.OS === 'web') quickRef.current?.click(); else toast.show('Quick Pin uses the camera on the device build'); }}
            />
          </>
        ) : (
          <>
            <Button title="Resume Track" icon="play" testID="btn-resume-track" onPress={() => void doResume()} />
            <Button title="Complete Exercise" variant="secondary" testID="btn-complete-exercise" onPress={() => setAttachOpen(true)} />
            <Button title="Discard Track" variant="danger" testID="btn-discard-track" onPress={() => setDiscardOpen(true)} />
          </>
        )}
      </Row>

      {pins.length ? (
        <Section title={`Pins (${pins.length})`} style={{ marginTop: space.lg }}>
          <View style={{ gap: space.sm }}>
            {pins.map((p) => {
              const doc = documents.find((d) => d.id === p.photo_id);
              return (
                <Card key={p.id} testID={`pin-${p.id}`}>
                  <Row gap={space.sm} align="flex-start">
                    <Ionicons name={doc ? 'image' : 'location'} size={22} color={c.accent} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="bodyStrong">{p.label}</Text>
                      <Muted>{fmtDateTime(p.at, track.tz)} · {toYards(haversineM(path[0] || p, p))} yards from the start{doc ? ` · photo ${doc.name}` : ''}</Muted>
                    </View>
                    <Button
                      title="Edit"
                      variant="secondary"
                      testID={`btn-edit-pin-${p.id}`}
                      accessibilityLabel={`Edit ${p.label}`}
                      onPress={() => { setEditingPin(p); setPinOpen(true); }}
                    />
                    <Button
                      title="Delete"
                      variant="ghost"
                      testID={`btn-delete-pin-${p.id}`}
                      accessibilityLabel={`Delete ${p.label}`}
                      onPress={() => {
                        void writePins(pins.filter((x) => x.id !== p.id));
                        toast.show('Pin deleted');
                      }}
                    />
                  </Row>
                </Card>
              );
            })}
          </View>
        </Section>
      ) : null}

      {finished ? (
        <Section title="Track picture" description="This is the picture that goes onto the record and into printed reports." style={{ marginTop: space.lg }}>
          <Card>
            <TrackImage track={{ ...track, points, pins }} underlay={laid && laidView?.path.length ? laidView.path : null} width={desktop ? 420 : 280} height={220} testID="track-image-summary" />
            {deviation ? (
              <View style={{ marginTop: space.sm }} testID="block-comparison">
                <Text variant="bodyStrong">Compared with {laid?.name}</Text>
                <Text testID="text-compare-distance">Distance: {fmtDistance(stats.distance_m)} followed vs {fmtDistance(laid?.stats?.distance_m || 0)} laid</Text>
                <Text testID="text-compare-deviation">Average deviation from the laid path: {fmtDistance(deviation.avg_m)} (worst {fmtDistance(deviation.max_m)}), measured over {deviation.compared} points</Text>
              </View>
            ) : null}
          </Card>
        </Section>
      ) : null}

      <PinSheet
        visible={pinOpen}
        editing={editingPin}
        onClose={() => { setPinOpen(false); setEditingPin(null); }}
        onSave={(label, file) => savePin(label, file, editingPin)}
      />
      <PinPhotoInput inputRef={quickRef} onFile={(f) => void quickPin(f)} testID="input-quick-pin-photo" />

      <Sheet visible={stopOpen} onClose={() => setStopOpen(false)} title="Track stopped" testID="sheet-stop-track">
        <Text style={{ marginBottom: space.sm }}>{fmtDistance(stats.distance_m)} · {fmtClock(stats.duration_s)} · {stats.turns} {stats.turns === 1 ? 'turn' : 'turns'} · {pins.length} {pins.length === 1 ? 'pin' : 'pins'}.</Text>
        <StopOption title="Complete Exercise" body="Save the track and put it on a record now." icon="checkmark-done" testID="btn-stop-complete" onPress={() => { setStopOpen(false); setAttachOpen(true); }} />
        <StopOption title="Save For Later" body="Keep the track; finish the record another time." icon="save-outline" testID="btn-stop-save-later" onPress={() => void doSaveForLater()} />
        <StopOption title="Discard Track" body="Throw the track away. This is written to History." icon="trash-outline" tone="danger" testID="btn-stop-discard" onPress={() => setDiscardOpen(true)} />
        <StopOption title="Resume current track" body="Go back to recording where you left off." icon="play" testID="btn-stop-resume" onPress={() => void doResume()} />
      </Sheet>

      <Sheet visible={attachOpen} onClose={() => setAttachOpen(false)} title="Complete Exercise" testID="sheet-attach-track">
        <Muted style={{ marginBottom: space.sm }}>Choose the record this track belongs to. Only your own unfinished records are listed.</Muted>
        {openCompletions.length === 0 && openDeployments.length === 0 ? (
          <Text testID="text-no-open-records">You have no unfinished training or deployment record. Create one and the track will be waiting.</Text>
        ) : null}
        {openCompletions.map((x) => (
          <StopOption
            key={x.id}
            title={exercises.find((e) => e.id === x.exercise_id)?.name || 'Training exercise'}
            body={`Training completion${x.start_at ? ` · ${fmtDateTime(x.start_at, x.tz)}` : ''}`}
            icon="clipboard-outline"
            testID={`btn-attach-completion-${x.id}`}
            onPress={() => void attach('completion', x.id)}
          />
        ))}
        {openDeployments.map((d) => (
          <StopOption
            key={d.id}
            title={d.case_number || 'Deployment record'}
            body={`Deployment · ${fmtDateTime(d.occurred_at, d.tz)}`}
            icon="shield-half-outline"
            testID={`btn-attach-deployment-${d.id}`}
            onPress={() => void attach('deployment', d.id)}
          />
        ))}
        <Divider style={{ marginVertical: space.sm }} />
        <StopOption
          title="New training record"
          body="Open the training record form; come back and attach the track when it exists."
          icon="add-circle-outline"
          testID="btn-attach-new-record"
          onPress={() => { setAttachOpen(false); router.push(`/records/training/new?track=${track.id}` as never); }}
        />
      </Sheet>

      <ConfirmDialog
        visible={discardOpen}
        title="Confirm Discard Track"
        body="The track, its points and its pins are thrown away. The deletion is written to History."
        confirmTitle="Discard"
        onConfirm={() => void doDiscard()}
        onCancel={() => setDiscardOpen(false)}
        testID="dialog-discard-track"
      />
    </Screen>
  );
}

function StopOption({ title, body, icon, onPress, testID, tone }: { title: string; body: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; testID: string; tone?: 'danger' }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={body}
      testID={testID}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, marginBottom: space.sm, backgroundColor: pressed || hovered ? c.surfaceAlt : c.surface },
      ]}
    >
      <Ionicons name={icon} size={24} color={tone === 'danger' ? c.danger : c.primary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" style={tone === 'danger' ? { color: c.danger } : undefined}>{title}</Text>
        <Muted>{body}</Muted>
      </View>
      <Ionicons name="chevron-forward" size={20} color={c.muted} />
    </Pressable>
  );
}

function PinSheet({ visible, editing, onClose, onSave }: { visible: boolean; editing: TrackPin | null; onClose: () => void; onSave: (label: string, file: File | null) => Promise<void> }) {
  const [label, setLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<{ click: () => void } | null>(null);

  useEffect(() => { if (visible) { setLabel(editing?.label || ''); setFile(null); } }, [visible, editing]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit pin' : 'Add pin'}
      testID="sheet-add-pin"
      footer={(
        <Row justify="flex-end" gap={space.sm}>
          <Button title="Cancel" variant="secondary" onPress={onClose} testID="btn-cancel-pin" />
          <Button
            title={editing ? 'Save changes' : 'Save pin'}
            testID="btn-save-pin"
            loading={busy}
            onPress={async () => { setBusy(true); await onSave(label, file); setBusy(false); onClose(); }}
          />
        </Row>
      )}
    >
      <Muted style={{ marginBottom: space.sm }}>{editing ? 'Change the note or replace the photo. The pin keeps the place and the time it was dropped.' : 'The pin is dropped at your current position with the time, distance from the start and, if you add one, a photo.'}</Muted>
      <TextField label="Pin note" testID="input-pin-label" value={label} onChangeText={setLabel} placeholder="Article found, crossing, hard surface…" maxLength={120} />
      <Row gap={space.sm} wrap>
        <Button
          title={file ? 'Change photo' : 'Add photo'}
          variant="secondary"
          icon="camera-outline"
          testID="btn-pin-photo"
          accessibilityLabel="Add photo to pin"
          onPress={() => { if (Platform.OS === 'web') inputRef.current?.click(); }}
        />
        <Text style={{ flex: 1, minWidth: 0 }} testID="text-pin-photo-name">{file ? file.name : editing?.photo_id ? 'Photo already attached — choosing one replaces it' : 'No photo attached'}</Text>
      </Row>
      <PinPhotoInput inputRef={inputRef} onFile={setFile} testID="input-pin-photo" />
      {Platform.OS !== 'web' ? <Muted style={{ marginTop: space.sm }}>Camera and library pins arrive with the device build.</Muted> : null}
    </Sheet>
  );
}
