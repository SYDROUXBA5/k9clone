// Tracking home — pick a mode, pick a dog, name the track (lay) or pick one to follow, press Start.
// Everything below Start is context: recent tracks with their pictures, and the developer walk switch.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { Track, TrackMode, TrackVisibility } from '@/db/types';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  Badge, Banner, Button, Card, ConfirmDialog, Divider, EmptyState, Muted, Row, Screen, Section, Select,
  Sheet, StatusPill, Text, TextField, fmtDateTime, space, useColors, useIsDesktop, useToast,
} from '@/ui';
import { TrackImage } from './TrackImage';
import { SIM_ORIGIN, SIM_LENGTH_YD } from './simulate';
import { useSimulateWalk } from './simPref';
import { createDeploymentForTrack, createTrack, stopAbandonedLayerTracks } from './trackStore';
import { useLivePosition } from './useLivePosition';
import {
  FOLLOW_RADIUS_M, FOLLOW_RADIUS_YD, LAID_TRACK_EXPIRY_DAYS, TRACK_MODES, TRACK_VISIBILITIES,
  autoTrackName, fmtAge, fmtDistance, followability, followableLaidTracks, followedLaidTrackIds,
  haversineM, modeLabel, toYards, trackStart, trackStatusLabel,
} from './trackModel';

const AUTO_EXERCISE = '__auto__';
const NO_LAID_TRACK = '__none__';

export function TrackingModeScreen() {
  const c = useColors();
  const desktop = useIsDesktop();
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [simulate, setSimulate] = useSimulateWalk();

  const dogs = useList('dog', (d) => d.owner_user_id === user?.id && d.status === 'active');
  const tracks = useList('track');
  const completions = useList('completion', (x) => x.handler_id === user?.id);
  const exercises = useList('exercise');

  const [mode, setMode] = useState<TrackMode>('training_lay');
  const [dogId, setDogId] = useState<string>(() => dogs.find((d) => d.is_default)?.id || dogs[0]?.id || '');
  const [visibility, setVisibility] = useState<TrackVisibility>('hidden');
  const [pendingVisibility, setPendingVisibility] = useState<TrackVisibility | null>(null);
  const [name, setName] = useState('');
  const [laidId, setLaidId] = useState<string>(NO_LAID_TRACK);
  const [exerciseId, setExerciseId] = useState<string>(AUTO_EXERCISE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [codeNote, setCodeNote] = useState<string | null>(null);
  const [learnOpen, setLearnOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // A position is needed to know which laid tracks are in range; the picker watches quietly.
  const { fix, state, message } = useLivePosition({ enabled: true, simulate });
  const here = fix ? { lat: fix.lat, lng: fix.lng } : simulate ? SIM_ORIGIN : null;

  // A runner who closed the tab mid-walk leaves a laid track stuck 'active', which no picker will
  // ever list. Sweeping here means the team's own screen is where that gets put right.
  useEffect(() => { void stopAbandonedLayerTracks(repo, repo.snapshot('track')); }, [repo]);

  const myTracks = useMemo(() => tracks.filter((t) => t.owner_user_id === user?.id), [tracks, user?.id]);
  const nearby = useMemo(() => followableLaidTracks(tracks, here), [tracks, here]);
  const autoName = useMemo(() => autoTrackName(user?.last_name || 'Track', tracks), [user?.last_name, tracks]);
  const openCompletions = completions.filter((x) => !x.is_complete);
  const followedIds = useMemo(() => followedLaidTrackIds(tracks), [tracks]);

  const chosenLaid = laidId !== NO_LAID_TRACK ? tracks.find((t) => t.id === laidId) : null;
  const trackName =
    name.trim() ||
    (mode === 'training_lay'
      ? autoName
      : mode === 'training_follow' && chosenLaid
        ? `Follow — ${chosenLaid.name}`
        : `${modeLabel(mode)} ${new Date().toLocaleDateString()}`);
  const modeInfo = TRACK_MODES.find((m) => m.value === mode)!;

  const chooseVisibility = (v: TrackVisibility) => {
    if (v === 'visible' && visibility !== 'visible') { setPendingVisibility(v); return; }
    setVisibility(v);
  };

  const start = async () => {
    const e: Record<string, string> = {};
    if (!dogId && mode !== 'training_lay') e.dog = 'Choose the dog working this track.';
    if (!user) e.user = 'Sign in again before starting a track.';
    setErrors(e);
    if (Object.keys(e).length) { toast.show('Fill in what is missing before starting', 'error'); return; }
    setBusy(true);
    try {
      const track = await createTrack(repo, {
        mode,
        name: trackName,
        dogId: dogId || null,
        ownerId: user!.id,
        ownerKind: 'user',
        visibility: mode === 'training_lay' ? visibility : 'visible',
        laidTrackId: mode === 'training_follow' && laidId !== NO_LAID_TRACK ? laidId : null,
        exerciseId: mode === 'training_follow' && exerciseId !== AUTO_EXERCISE ? exerciseId : null,
      });
      if (mode === 'deployment') {
        await createDeploymentForTrack(repo, {
          handlerId: user!.id, dogId: dogId || null, trackId: track.id, trackName: track.name,
          lat: here?.lat ?? null, lng: here?.lng ?? null,
        });
      }
      router.push(`/tracking/live/${track.id}` as never);
    } catch {
      toast.show('The track could not be started — nothing was saved', 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Pickup code entry — the other half of the code a no-account layer is handed. Without this the
   * layer screen prints a code that nothing in the app can read, which is a promise with no keeper.
   */
  const applyCode = () => {
    const wanted = code.trim().toUpperCase();
    if (wanted.length < 4) { setCodeNote('Enter the 6-character code the runner was given.'); return; }
    const found = tracks.find((t) => (t.code || '').toUpperCase() === wanted);
    if (!found) { setCodeNote(`No laid track on this device has the code ${wanted}.`); return; }
    // Exactly the verdict the picker uses, so a code can never open a track the list is hiding.
    const verdict = followability(found, followedIds);
    if (!verdict.ok) { setCodeNote(verdict.reason); return; }
    const st = trackStart(found);
    const away = st && here ? haversineM(here, st) : null;
    setLaidId(found.id);
    setMode('training_follow');
    setCodeNote(
      away != null && away > FOLLOW_RADIUS_M
        ? `${found.name} selected — but its start is ${toYards(away)} yards away, further than the ${FOLLOW_RADIUS_YD}-yard pickup radius.`
        : `${found.name} selected${away != null ? ` · ${toYards(away)} yards away` : ''}.`,
    );
  };

  const laidOptions = [
    { value: NO_LAID_TRACK, label: 'Follow without a laid track' },
    ...nearby.map(({ track, distance_m }) => ({
      value: track.id,
      label: `${track.name} (${fmtAge(track.stopped_at || track.started_at)})`,
      description: `${toYards(distance_m)} yards away · ${fmtDistance(track.stats?.distance_m || 0)} · laid ${trackStatusLabel(track).toLowerCase()}`,
    })),
    // A track picked by code is kept selectable even when it is out of the pickup radius, so the
    // select never silently drops the choice the handler just made.
    ...(chosenLaid && !nearby.some((n) => n.track.id === chosenLaid.id)
      ? [{ value: chosenLaid.id, label: `${chosenLaid.name} (entered by code)`, description: `${fmtDistance(chosenLaid.stats?.distance_m || 0)} · laid ${trackStatusLabel(chosenLaid).toLowerCase()}` }]
      : []),
  ];

  return (
    <Screen title="Tracking" subtitle="Record where you and your dog went — the map, distance, turns and duration go straight onto the record." testID="screen-tracking">
      {state === 'denied' || state === 'unavailable' || state === 'error' ? (
        <Banner tone="warning" title="Location is not available" body={message || ''} testID="banner-geo-unavailable" />
      ) : null}

      <Card testID="card-track-mode">
        <Text variant="h3">Mode</Text>
        <Muted style={{ marginBottom: space.sm }}>Pick what this track is for. The mode decides which record it lands on.</Muted>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Track mode"
          testID="seg-track-mode"
          style={{ flexDirection: desktop ? 'row' : 'column', gap: space.sm, marginBottom: space.md }}
        >
          {TRACK_MODES.map((m) => {
            const active = m.value === mode;
            const badge = m.value === 'training_follow' ? nearby.length : 0;
            return (
              <Pressable
                key={m.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, checked: active }}
                accessibilityLabel={m.label}
                testID={`mode-${m.value}`}
                onPress={() => setMode(m.value)}
                style={({ hovered }: { hovered?: boolean }) => [
                  {
                    flex: desktop ? 1 : undefined, minHeight: 56, borderRadius: 10, borderWidth: active ? 2 : 1,
                    borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primarySoft : hovered ? c.surfaceAlt : c.surface,
                    padding: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm,
                  },
                ]}
              >
                <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? c.primary : c.muted} />
                <Text variant="bodyStrong" style={{ flex: 1, color: active ? c.primary : c.text }}>{m.label}</Text>
                {badge ? <Badge tone="accent" testID="badge-follow-count">{String(badge)}</Badge> : null}
              </Pressable>
            );
          })}
        </View>
        <Banner tone="info" body={modeInfo.help} testID="banner-mode-help" style={{ marginBottom: space.xs }} />
        <Row style={{ marginBottom: space.sm }}>
          <Button title="LEARN MORE" variant="ghost" icon="help-circle-outline" testID="btn-learn-more" accessibilityLabel="Learn more about the tracking modes" onPress={() => setLearnOpen(true)} />
        </Row>

        <Select
          label="Dog"
          required={mode !== 'training_lay'}
          testID="select-dog"
          value={dogId}
          onChange={setDogId}
          error={errors.dog || null}
          allowCustom={false}
          options={dogs.map((d) => ({ value: d.id, label: d.name, description: d.breed }))}
          placeholder={dogs.length ? 'Choose a dog' : 'No active dogs on this account'}
          help={mode === 'training_lay' ? 'A laid track has no dog working it — leave this blank if you are only the runner.' : undefined}
        />

        {mode === 'training_lay' ? (
          <>
            <TextField
              label="Track name"
              testID="input-track-name"
              value={name}
              onChangeText={setName}
              placeholder={autoName}
              help={`Named ${autoName} unless you change it. Followers see this name.`}
              maxLength={60}
            />
            <Text variant="label" style={{ marginBottom: 6 }}>Laid Track Visibility</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Laid Track Visibility" testID="seg-visibility" style={{ gap: space.sm, marginBottom: space.md }}>
              {TRACK_VISIBILITIES.map((v) => {
                const active = v.value === visibility;
                return (
                  <Pressable
                    key={v.value}
                    accessibilityRole="radio"
                    accessibilityLabel={v.label}
                    accessibilityState={{ selected: active, checked: active }}
                    testID={`visibility-${v.value}`}
                    onPress={() => chooseVisibility(v.value)}
                    style={{ minHeight: 48, borderRadius: 10, borderWidth: active ? 2 : 1, borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primarySoft : c.surface, padding: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                  >
                    <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? c.primary : c.muted} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="bodyStrong">{v.label}</Text>
                      <Muted>{v.help}</Muted>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Muted testID="text-expiry-note">Laid tracks that nobody follows disappear after {LAID_TRACK_EXPIRY_DAYS} days.</Muted>
          </>
        ) : null}

        {mode === 'training_follow' ? (
          <>
            <Select
              label="Tracking Exercise"
              testID="select-exercise"
              value={exerciseId}
              onChange={setExerciseId}
              allowCustom={false}
              options={[
                { value: AUTO_EXERCISE, label: '<Create new exercise automatically>' },
                ...openCompletions.map((x) => ({ value: x.exercise_id, label: exercises.find((e) => e.id === x.exercise_id)?.name || 'Tracking exercise', description: 'An exercise you have not finished yet' })),
              ]}
              help="The stopped track can be attached to one of your open exercises, or to a new one."
            />
            <Select
              label="Laid Track To Follow"
              testID="select-laid-track"
              value={laidId}
              onChange={setLaidId}
              allowCustom={false}
              options={laidOptions}
              help={`Only laid tracks that start within ${FOLLOW_RADIUS_YD} yards of you and are less than ${LAID_TRACK_EXPIRY_DAYS} days old are listed.`}
            />
            {nearby.length === 0 ? (
              <Muted testID="text-no-laid-tracks">No laid track is within {FOLLOW_RADIUS_YD} yards of you right now. You can still follow without one.</Muted>
            ) : null}
            <Row gap={space.sm} wrap align="flex-start" style={{ marginTop: space.sm }}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <TextField
                  label="Track code"
                  testID="input-track-code"
                  value={code}
                  onChangeText={(v) => { setCode(v.toUpperCase()); setCodeNote(null); }}
                  placeholder="A65NG3"
                  maxLength={6}
                  autoCapitalize="characters"
                  help="The 6-character code a runner who laid a track without an account was given."
                />
              </View>
              <Button title="Find track" variant="secondary" testID="btn-find-by-code" accessibilityLabel="Find laid track by code" onPress={applyCode} style={{ marginTop: 26 }} />
            </Row>
            {codeNote ? <Muted testID="text-code-note">{codeNote}</Muted> : null}
          </>
        ) : null}

        <Divider style={{ marginVertical: space.md }} />

        <Row wrap gap={space.sm}>
          <Button title="Start Track" testID="btn-start-track" icon="play" size="lg" onPress={() => void start()} loading={busy} />
          <Button title="⋯" variant="secondary" size="lg" testID="btn-track-overflow" accessibilityLabel="More tracking options" onPress={() => setMoreOpen(true)} />
          <View style={{ flex: 1, minWidth: 220 }}>
            <Muted testID="text-gps-state">
              {state === 'live' ? `GPS: ${fix?.simulated ? 'Simulated' : 'Good'}${fix?.accuracy_m != null ? ` · ±${Math.round(fix.accuracy_m)} m` : ''}` : state === 'starting' ? 'GPS: waiting for a fix…' : 'GPS: not available'}
            </Muted>
          </View>
        </Row>
      </Card>

      <Card style={{ marginTop: space.md }} testID="card-developer">
        <Row gap={space.sm} align="flex-start">
          <Ionicons name="construct-outline" size={22} color={c.muted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong">Developer · Simulate walk</Text>
            <Muted>Feeds a synthetic {SIM_LENGTH_YD}-yard path with turns at one point per second so tracking can be tried on a desktop without moving.</Muted>
          </View>
          <Button
            title={simulate ? 'Simulate walk: On' : 'Simulate walk: Off'}
            variant={simulate ? 'primary' : 'secondary'}
            testID="btn-simulate-walk"
            accessibilityLabel="Simulate walk"
            onPress={() => setSimulate(!simulate)}
          />
        </Row>
      </Card>

      <Section title="Recent tracks" description="Tracks you laid or followed. Saved tracks can be attached to a record later." style={{ marginTop: space.lg }}>
        {myTracks.length === 0 ? (
          <EmptyState icon="navigate-outline" title="No tracks yet" body="Start a track above and it will be listed here with its picture, distance and turns." testID="empty-tracks" />
        ) : (
          <View style={{ gap: space.sm }}>
            {[...myTracks].sort((a, b) => (a.started_at || '') < (b.started_at || '') ? 1 : -1).slice(0, 8).map((t) => (
              <RecentTrackCard key={t.id} track={t} followed={followedIds.has(t.id)} onOpen={() => router.push(`/tracking/live/${t.id}` as never)} />
            ))}
          </View>
        )}
      </Section>

      <Sheet visible={learnOpen} onClose={() => setLearnOpen(false)} title="Tracking modes" testID="sheet-learn-more">
        {TRACK_MODES.map((m) => (
          <View key={m.value} style={{ marginBottom: space.md }}>
            <Text variant="bodyStrong">{m.label}</Text>
            <Muted>{m.help}</Muted>
          </View>
        ))}
        <Divider style={{ marginVertical: space.sm }} />
        <Text variant="bodyStrong">Laid track visibility</Text>
        {TRACK_VISIBILITIES.map((v) => (
          <Muted key={v.value} style={{ marginTop: 4 }}>{v.label} — {v.help}</Muted>
        ))}
        <Muted style={{ marginTop: space.sm }}>
          A laid track can be picked up by any team starting within {FOLLOW_RADIUS_YD} yards, for {LAID_TRACK_EXPIRY_DAYS} days, and is followed once.
        </Muted>
      </Sheet>

      <Sheet visible={moreOpen} onClose={() => setMoreOpen(false)} title="More tracking options" testID="sheet-track-overflow">
        <Button title="Lay a track without an account" variant="secondary" fullWidth icon="walk-outline" testID="btn-more-layer" onPress={() => { setMoreOpen(false); router.push('/track-layer' as never); }} />
        <View style={{ height: space.sm }} />
        <Button title="Supervisor Live Tracks" variant="secondary" fullWidth icon="people-outline" testID="btn-more-supervisor" onPress={() => { setMoreOpen(false); router.push('/tracking/supervisor' as never); }} />
        <View style={{ height: space.sm }} />
        <Button title={simulate ? 'Turn Simulate walk off' : 'Turn Simulate walk on'} variant="secondary" fullWidth icon="construct-outline" testID="btn-more-simulate" onPress={() => setSimulate(!simulate)} />
      </Sheet>

      <ConfirmDialog
        visible={!!pendingVisibility}
        title="Confirm Track Visibility"
        body="Making the laid track visible shows the follower the whole path and its pins. The exercise record will show that the handler knew where the track went, and that cannot be undone."
        confirmTitle="Make it visible"
        tone="primary"
        onConfirm={() => { setVisibility(pendingVisibility!); setPendingVisibility(null); }}
        onCancel={() => setPendingVisibility(null)}
        testID="dialog-visibility"
      />
    </Screen>
  );
}

function RecentTrackCard({ track, followed, onOpen }: { track: Track; followed?: boolean; onOpen: () => void }) {
  const desktop = useIsDesktop();
  return (
    <Card testID={`track-card-${track.id}`}>
      <View style={{ flexDirection: desktop ? 'row' : 'column', gap: space.md }}>
        <TrackImage track={track} width={desktop ? 220 : 260} height={140} testID={`track-image-${track.id}`} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Row gap={space.sm} wrap>
            <Text variant="h3" style={{ flexShrink: 1 }}>{track.name}</Text>
            <StatusPill status={track.status === 'active' ? 'active' : track.status === 'completed' ? 'complete' : 'neutral'} label={trackStatusLabel(track)} testID={`track-status-${track.id}`} />
            {followed ? <Badge tone="accent" testID={`badge-followed-${track.id}`}>Followed</Badge> : null}
          </Row>
          <Muted>{modeLabel(track.mode)}{track.started_at ? ` · ${fmtDateTime(track.started_at, track.tz)}` : ''}</Muted>
          <Text>{fmtDistance(track.stats?.distance_m || 0)} · {track.stats?.turns ?? 0} {track.stats?.turns === 1 ? "turn" : "turns"} · {track.pins?.length || 0} {track.pins?.length === 1 ? 'pin' : 'pins'}</Text>
          <Row gap={space.sm} wrap style={{ marginTop: space.xs }}>
            <Button title={track.status === 'active' ? 'Resume' : 'Open'} variant="secondary" onPress={onOpen} testID={`btn-open-track-${track.id}`} accessibilityLabel={`Open ${track.name}`} />
          </Row>
        </View>
      </View>
    </Card>
  );
}
