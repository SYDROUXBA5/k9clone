// Every track write goes through here, and every one of them goes through the Repository — which is
// what puts track interactions into History. Point flushes are silent (a breadcrumb every second is
// not a history entry); create / stop / discard / attach are not.
import type { Repository } from '@/db/repository';
import type { Deployment, Document, Track, TrackMode, TrackPin, TrackPoint, TrackVisibility, Weather } from '@/db/types';
import { deviceTimeZone, nowISO, uuid } from '@/db/util';
import { expiresAtFor, isAbandonedLayerTrack, statsOf, trackRecordFields } from './trackModel';

export interface StartTrackInput {
  mode: TrackMode;
  name: string;
  dogId: string | null;
  ownerId: string;
  ownerKind: 'user' | 'layer';
  visibility: TrackVisibility;
  laidTrackId?: string | null;
  exerciseId?: string | null;
  code?: string | null;
  firstPoint?: TrackPoint | null;
}

export async function createTrack(repo: Repository, input: StartTrackInput): Promise<Track> {
  const at = nowISO();
  const points = input.firstPoint ? [input.firstPoint] : [];
  return repo.upsert(
    'track',
    {
      id: uuid(),
      owner_user_id: input.ownerId,
      mode: input.mode,
      name: input.name,
      dog_id: input.dogId,
      laid_track_id: input.laidTrackId ?? null,
      visibility: input.visibility,
      points,
      pins: [],
      stats: statsOf(points),
      status: 'active',
      started_at: at,
      stopped_at: null,
      tz: deviceTimeZone(),
      expires_at: input.mode === 'training_lay' ? expiresAtFor(at) : null,
      owner_kind: input.ownerKind,
      exercise_id: input.exerciseId ?? null,
      deployment_id: null,
      code: input.code ?? null,
    },
    { actor_id: input.ownerKind === 'layer' ? 'layer' : input.ownerId, label: input.name },
  );
}

/** Silent flush of the breadcrumb buffer (called every few seconds while recording). */
export async function saveTrackPoints(repo: Repository, id: string, points: TrackPoint[], pins: TrackPin[], weather?: Weather | null): Promise<void> {
  await repo.upsert('track', { id, points, pins, stats: statsOf(points), saved_at: nowISO(), ...(weather ? { weather } : null) } as Partial<Track> & { id: string }, { silent: true });
}

export async function stopTrack(repo: Repository, id: string, points: TrackPoint[], pins: TrackPin[], weather?: Weather | null): Promise<Track> {
  return repo.upsert(
    'track',
    { id, points, pins, stats: statsOf(points), status: 'stopped', stopped_at: nowISO(), saved_at: nowISO(), ...(weather ? { weather } : null) } as Partial<Track> & { id: string },
    { label: 'Track stopped' },
  );
}

/**
 * Stop every laid track whose no-account runner walked away from the tab.
 *
 * Without this an abandoned layer track stays status:'active' forever, and an active track is
 * invisible to followableLaidTracks() — so the runner's code names a track no team can ever pick up
 * (PT-GPS-13). Stopping it is the honest outcome: the points that were recorded stay, and the track
 * becomes followable until it expires on its own three days later. Returns how many were stopped.
 */
export async function stopAbandonedLayerTracks(repo: Repository, tracks: Track[], now = Date.now()): Promise<number> {
  const stale = tracks.filter((t) => isAbandonedLayerTrack(t, now));
  for (const t of stale) {
    await repo.upsert(
      'track',
      { id: t.id, status: 'stopped', stopped_at: nowISO(), stats: statsOf(t.points || []) } as Partial<Track> & { id: string },
      { actor_id: 'layer', label: 'Laid track stopped — the runner left it unattended' },
    );
  }
  return stale.length;
}

export async function resumeTrack(repo: Repository, id: string): Promise<Track> {
  return repo.upsert('track', { id, status: 'active', stopped_at: null, saved_for_later: false }, { label: 'Track resumed' });
}

export async function discardTrack(repo: Repository, id: string): Promise<void> {
  await repo.upsert('track', { id, status: 'discarded', stopped_at: nowISO() }, { label: 'Track discarded' });
  await repo.remove('track', id);
}

/**
 * Did the handler already know where the track went? True only when the laid track they followed was
 * set Visible — that is the promise the visibility dialog makes, and the field it has to keep.
 * `null` when there was no laid track at all: the question was never asked, so it stays unanswered.
 */
async function locationKnownFor(repo: Repository, track: Track | null | undefined): Promise<boolean | null> {
  if (!track?.laid_track_id) return null;
  const laid = await repo.get('track', track.laid_track_id);
  if (!laid) return null;
  return laid.visibility === 'visible';
}

/**
 * Write a track's measurements into the completion it belongs to.
 *
 * The link alone is not the job: the record's TRACKING section is filled from the track's own stats,
 * so the handler is never asked to retype a distance the phone just measured. Existing hand-typed
 * values are overwritten deliberately — the measurement is better than the estimate, and the handler
 * chose to put this track on this record.
 */
async function writeCompletionSection(repo: Repository, track: Track, completionId: string, label: string): Promise<string | null | undefined> {
  const completion = await repo.get('completion', completionId);
  const known = await locationKnownFor(repo, track);
  const sections = { ...(completion?.sections || {}) };
  sections.Tracking = { ...(sections.Tracking || {}), ...trackRecordFields(track, { locationKnown: known }).completion };
  await repo.upsert('completion', { id: completionId, track_id: track.id, sections }, { label });
  return completion?.exercise_id;
}

/** Same for a deployment: the TRACKING section's required distance and duration come from the track. */
async function writeDeploymentSection(repo: Repository, track: Track, deploymentId: string, label: string): Promise<void> {
  const deployment = await repo.get('deployment', deploymentId);
  const sections = { ...(deployment?.sections || {}) };
  sections.Tracking = { ...(sections.Tracking || {}), ...trackRecordFields(track).deployment };
  // A tracking section nobody asked for helps no one — but a deployment carrying a GPS track is a
  // tracking deployment, so the type is added if the handler had not ticked it yet.
  const patrol_types = deployment && !deployment.patrol_types.includes('Tracking')
    ? [...deployment.patrol_types, 'Tracking']
    : deployment?.patrol_types;
  await repo.upsert(
    'deployment',
    { id: deploymentId, track_id: track.id, sections, ...(patrol_types ? { patrol_types } : null), ...(track.weather && !deployment?.weather ? { weather: track.weather } : null) },
    { label },
  );
}

/** Attach a stopped track to an open completion of the same handler. */
export async function attachTrackToCompletion(repo: Repository, trackId: string, completionId: string): Promise<void> {
  const track = await repo.get('track', trackId);
  if (!track) return;
  const exerciseId = await writeCompletionSection(repo, track, completionId, 'Track attached to exercise');
  await repo.upsert('track', { id: trackId, status: 'completed', saved_for_later: false, exercise_id: exerciseId ?? null }, { label: 'Track completed' });
}

export async function attachTrackToDeployment(repo: Repository, trackId: string, deploymentId: string): Promise<void> {
  const track = await repo.get('track', trackId);
  if (!track) return;
  await writeDeploymentSection(repo, track, deploymentId, 'Track attached to deployment');
  await repo.upsert('track', { id: trackId, status: 'completed', saved_for_later: false, deployment_id: deploymentId }, { label: 'Track completed' });
}

/**
 * Push the final numbers to a record the track ALREADY belongs to.
 *
 * A Deployment Track opens its deployment record the moment it starts, so it never passes through
 * "Complete Exercise" — without this the deployment it created would sit there asking for the
 * distance and the duration by hand, which is precisely the thing tracking exists to avoid. Called
 * on stop, and again if a resumed track is stopped a second time.
 */
export async function syncTrackToRecord(repo: Repository, trackId: string): Promise<void> {
  const track = await repo.get('track', trackId);
  if (!track || !(track.points || []).length) return;
  if (track.deployment_id) await writeDeploymentSection(repo, track, track.deployment_id, 'Track measurements written to the deployment');
  const completion = repo.snapshot('completion').find((cp) => cp.track_id === trackId && !cp.deleted_at);
  if (completion) await writeCompletionSection(repo, track, completion.id, 'Track measurements written to the exercise');
}

export async function markSavedForLater(repo: Repository, trackId: string): Promise<void> {
  await repo.upsert('track', { id: trackId, status: 'stopped', saved_for_later: true, saved_at: nowISO() }, { label: 'Track saved for later' });
}

/** A pin at the current position, optionally carrying a photo (stored as a Document row). */
export async function createPinPhoto(repo: Repository, trackId: string, file: { name: string; type: string; size: number; dataUri: string }): Promise<string> {
  const doc = await repo.upsert(
    'document',
    { owner_type: 'track_pin', owner_id: trackId, category: 'Track pin', kind: 'photo' as Document['kind'], name: file.name, uri: file.dataUri, mime: file.type, size_bytes: file.size },
    { label: file.name },
  );
  return doc.id;
}

/**
 * Deployment mode opens a deployment record straight away, so a supervisor watching the live track
 * already has the record it belongs to (bar §7.2 row 1).
 */
export async function createDeploymentForTrack(repo: Repository, input: { handlerId: string; dogId: string | null; trackId: string; trackName: string; lat: number | null; lng: number | null }): Promise<Deployment> {
  const at = nowISO();
  const dep = await repo.upsert(
    'deployment',
    {
      owner_user_id: input.handlerId,
      handler_id: input.handlerId,
      dog_id: input.dogId || '',
      occurred_at: at,
      tz: deviceTimeZone(),
      location: { name: 'Recorded by GPS track', address: '', address_line1: '', address_line2: '', city: '', region: '', postal_code: '', country: '', lat: input.lat, lng: input.lng },
      case_number: '',
      tags: [],
      requesting_unit: '',
      reason: '',
      request_fulfillment: 'deployed',
      kind: 'patrol',
      patrol_types: ['Tracking'],
      sections: {},
      people_found: null,
      people_unintentionally_bitten: null,
      arrests: [],
      detection: null,
      summary: '',
      weather: null,
      files: [],
      submitted_at: null,
      is_complete: false,
      review: 'not_reviewed',
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
      track_id: input.trackId,
    },
    { label: `Deployment started from ${input.trackName}` },
  );
  await repo.upsert('track', { id: input.trackId, deployment_id: dep.id }, { silent: true });
  return dep;
}
