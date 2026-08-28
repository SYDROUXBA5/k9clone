// GPS tracking — pure model. No React, no platform APIs: geometry, stats, vocabularies and the
// windows the tracking feature is built on (500 yd pickup radius, 3-day laid-track expiry,
// 4-hour supervisor tactical window, 3-day Live Tracks window).
// Units: metric storage (metres), imperial display (yards, switching to miles past 1 mile).
import type { Track, TrackMode, TrackPoint, TrackStats, TrackVisibility, User } from '@/db/types';

// ---------- windows & limits (bar §7.3) ----------
/** A follower must start within this many yards of a laid track's start. */
export const FOLLOW_RADIUS_YD = 500;
export const FOLLOW_RADIUS_M = FOLLOW_RADIUS_YD * 0.9144;
/** Laid tracks disappear after 3 days if nobody follows them. [VERIFY] — vendor sentence, no UI countdown evidenced. */
export const LAID_TRACK_EXPIRY_DAYS = 3;
/** Supervisor tactical map window — "last 4 hours". [VERIFY] — 4 h (tactical map) vs 3 days (Live Tracks banner). */
export const SUPERVISOR_MAP_HOURS = 4;
/** Live Tracks banner window (matches src/features/records/constants.ts LIVE_TRACKS_DAYS). */
export const LIVE_TRACKS_DAYS = 3;
/** Points less accurate than this are dropped before they reach the track. */
export const ACCURACY_LIMIT_M = 30;
/**
 * A track laid without an account is stopped for the layer after this long with nothing written to
 * it. A runner who closes the tab mid-walk must not strand the track: an 'active' row is invisible
 * to every follower's picker, so "abandoned" would otherwise mean "lost forever" (PT-GPS-13).
 * A live recording flushes every few seconds, so this window never catches a walk in progress.
 */
export const LAYER_ABANDON_MINUTES = 15;
/** A heading change larger than this counts as a turn. */
export const TURN_DEGREES = 45;
export const HOUR_MS = 3600000;
export const DAY_MS = 86400000;

// ---------- vocabularies ----------
export const TRACK_MODES: { value: TrackMode; label: string; short: string; help: string }[] = [
  {
    value: 'deployment',
    label: 'Deployment Track',
    short: 'Deployment',
    help: 'You and your dog are on a call. A deployment record is started for you and your supervisors can watch the track while it is being made.',
  },
  {
    value: 'training_lay',
    label: 'Training Lay Track',
    short: 'Training Lay',
    help: 'You are the runner laying a track for a K9 team. Walk the track, then stop — any team that starts within 500 yards in the next 3 days can follow it.',
  },
  {
    value: 'training_follow',
    label: 'Training Follow',
    short: 'Training Follow',
    help: 'You and your dog follow a laid track. Pick a nearby laid track or follow without one; the start of a laid track must be within 500 yards of you.',
  },
];

export const TRACK_VISIBILITIES: { value: TrackVisibility; label: string; help: string }[] = [
  { value: 'hidden', label: 'Hidden', help: 'The follower sees nothing until the exercise is finished.' },
  { value: 'start_only', label: 'Start Location', help: 'The follower sees only where the track begins.' },
  { value: 'visible', label: 'Visible', help: 'The follower sees the whole laid path and its pins — the record will show the handler knew the track.' },
];

export const MAP_LAYERS = [
  { value: 'road', label: 'Road' },
  { value: 'satellite', label: 'Satellite' },
  { value: 'terrain', label: 'Terrain' },
] as const;
export type MapLayer = (typeof MAP_LAYERS)[number]['value'];
/** Satellite first: a tracking team reads ground cover, not street names. */
export const DEFAULT_MAP_LAYER: MapLayer = 'satellite';

// ---------- geometry ----------
const R_EARTH_M = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export interface LatLng { lat: number; lng: number }

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing a→b in degrees (0 = north). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest signed difference between two bearings, in degrees (−180…180). */
export function bearingDelta(from: number, to: number): number {
  let d = ((to - from + 540) % 360) - 180;
  if (d === -180) d = 180;
  return d;
}

/** Move `metres` from a point along a bearing. Used by the walk simulator. */
export function movePoint(from: LatLng, bearing: number, metres: number): LatLng {
  const br = toRad(bearing);
  const d = metres / R_EARTH_M;
  const la1 = toRad(from.lat);
  const lo1 = toRad(from.lng);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: toDeg(la2), lng: ((toDeg(lo2) + 540) % 360) - 180 };
}

/** Local metres-per-degree factors around a latitude (equirectangular projection, fine at track scale). */
function metresPerDeg(lat: number): { mx: number; my: number } {
  return { mx: 111320 * Math.cos(toRad(lat)), my: 110540 };
}

/** Shortest distance in metres from a point to a segment. */
export function distanceToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  const { mx, my } = metresPerDeg(p.lat);
  const px = (p.lng - a.lng) * mx;
  const py = (p.lat - a.lat) * my;
  const bx = (b.lng - a.lng) * mx;
  const by = (b.lat - a.lat) * my;
  const len2 = bx * bx + by * by;
  if (len2 === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Shortest distance in metres from a point to a polyline (0 points → null). */
export function distanceToPathM(p: LatLng, path: LatLng[]): number | null {
  if (!path.length) return null;
  if (path.length === 1) return haversineM(p, path[0]);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, distanceToSegmentM(p, path[i - 1], path[i]));
  return best;
}

// ---------- stats ----------
/** A fix is kept only when its reported accuracy is usable (unknown accuracy is trusted). */
export function isAccurate(accuracy_m: number | null | undefined, limit = ACCURACY_LIMIT_M): boolean {
  return accuracy_m == null || accuracy_m <= limit;
}

export function pathDistanceM(points: LatLng[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineM(points[i - 1], points[i]);
  return d;
}

/** Heading changes smaller than this are GPS wobble, not steering: they reset the turn accumulator. */
export const TURN_NOISE_DEGREES = 12;

/**
 * Turns = sustained heading changes greater than TURN_DEGREES, measured over legs long enough to
 * have a heading.
 *
 * A walker never turns between two fixes: an 80° corner arrives as a run of smaller changes spread
 * over several legs. Comparing only *consecutive* leg bearings therefore misses most real corners —
 * 80° split as 40°+40° falls under the threshold twice and is never counted. So heading change is
 * accumulated while it keeps going the same way, and one turn is counted each time the running total
 * passes the threshold. The accumulator resets when the track runs straight again (a change under
 * TURN_NOISE_DEGREES) or when the walker starts bending the other way, which keeps GPS wobble — a
 * jitter that flips sign every leg — from ever adding up to a phantom turn.
 */
export function countTurns(points: LatLng[], minLegM = 12, threshold = TURN_DEGREES): number {
  const legs: number[] = [];
  let anchor = points[0];
  for (let i = 1; i < points.length; i++) {
    if (haversineM(anchor, points[i]) >= minLegM) {
      legs.push(bearingDeg(anchor, points[i]));
      anchor = points[i];
    }
  }
  let turns = 0;
  let acc = 0;
  for (let i = 1; i < legs.length; i++) {
    const d = bearingDelta(legs[i - 1], legs[i]);
    if (Math.abs(d) < TURN_NOISE_DEGREES) { acc = 0; continue; }
    if (acc !== 0 && Math.sign(d) !== Math.sign(acc)) acc = 0;
    acc += d;
    if (Math.abs(acc) > threshold) { turns++; acc = 0; }
  }
  return turns;
}

export function statsOf(points: TrackPoint[], uploaded = points.length): TrackStats {
  const first = points[0];
  const last = points[points.length - 1];
  const duration_s = first && last ? Math.max(0, Math.round((new Date(last.at).getTime() - new Date(first.at).getTime()) / 1000)) : 0;
  return {
    distance_m: pathDistanceM(points),
    duration_s,
    turns: countTurns(points),
    points_uploaded: uploaded,
    points_total: points.length,
  };
}

/** Head bearing of the track (last usable leg), or null when the track is too short. */
export function headingOf(points: LatLng[], minLegM = 5): number | null {
  for (let i = points.length - 1; i > 0; i--) {
    if (haversineM(points[i - 1], points[i]) >= minLegM) return bearingDeg(points[i - 1], points[i]);
  }
  return points.length >= 2 ? bearingDeg(points[0], points[points.length - 1]) : null;
}

// ---------- formatting (imperial display) ----------
export const M_PER_YD = 0.9144;
export const M_PER_MILE = 1609.344;

/** "182 yards" up to a mile, then "1.24 miles". */
export function fmtDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return '0 yards';
  if (metres >= M_PER_MILE) return `${(metres / M_PER_MILE).toFixed(2)} miles`;
  const yd = Math.round(metres / M_PER_YD);
  return `${yd} ${yd === 1 ? 'yard' : 'yards'}`;
}
export const toYards = (metres: number) => Math.round(metres / M_PER_YD);

/** "0:42" / "12:05" / "1:04:12" */
export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** "7m ago" / "2h ago" / "3d ago" — the age shown beside a laid track. */
export function fmtAge(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'unknown age';
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 'unknown age';
  if (ms < 60000) return 'just now';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const compass = (deg: number | null | undefined): string => {
  if (deg == null || Number.isNaN(deg)) return '';
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
};

// ---------- track helpers ----------
export const trackPath = (t: Pick<Track, 'points'>): LatLng[] => (t.points || []).map((p) => ({ lat: p.lat, lng: p.lng }));
export const trackStart = (t: Pick<Track, 'points'>): LatLng | null => (t.points && t.points.length ? { lat: t.points[0].lat, lng: t.points[0].lng } : null);
export const trackEnd = (t: Pick<Track, 'points'>): LatLng | null => (t.points && t.points.length ? { lat: t.points[t.points.length - 1].lat, lng: t.points[t.points.length - 1].lng } : null);

export function expiresAtFor(startedISO: string, days = LAID_TRACK_EXPIRY_DAYS): string {
  return new Date(new Date(startedISO).getTime() + days * DAY_MS).toISOString();
}

export function isExpired(t: Pick<Track, 'expires_at'>, now = Date.now()): boolean {
  return !!t.expires_at && new Date(t.expires_at).getTime() < now;
}

/** Ids of laid tracks some follow track already picked up — a track is followed once, then it is spent. */
export function followedLaidTrackIds(tracks: Track[]): Set<string> {
  const out = new Set<string>();
  for (const t of tracks) if (t.laid_track_id && t.status !== 'discarded') out.add(t.laid_track_id);
  return out;
}

/** Last moment anything was written to a track — the clock an abandoned layer session is judged by. */
export function lastActivityAt(t: Pick<Track, 'saved_at' | 'points' | 'started_at' | 'created_at'>): number {
  const pts = t.points || [];
  const candidates = [t.saved_at, pts.length ? pts[pts.length - 1].at : null, t.started_at, t.created_at];
  for (const iso of candidates) {
    const ms = iso ? new Date(iso).getTime() : NaN;
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

/**
 * An 'active' track laid by a no-account runner that has had nothing written to it for
 * LAYER_ABANDON_MINUTES — the tab was closed mid-walk. It is stopped rather than left recording
 * forever; see stopAbandonedLayerTracks() in trackStore.
 */
export function isAbandonedLayerTrack(t: Track, now = Date.now(), minutes = LAYER_ABANDON_MINUTES): boolean {
  if (t.owner_kind !== 'layer' || t.mode !== 'training_lay' || t.status !== 'active') return false;
  return now - lastActivityAt(t) > minutes * 60000;
}

/**
 * The ONE answer to "can this laid track be followed?", so the picker and the pickup-code box can
 * never disagree about the same track (PT-GPS-13 fix 4). Distance is deliberately NOT part of it:
 * the picker hides out-of-range tracks while the code box selects one and warns, and both need the
 * same verdict on everything else.
 */
export type Followability = { ok: true } | { ok: false; reason: string };
export function followability(t: Track, followed: Set<string>, now = Date.now()): Followability {
  if (t.mode !== 'training_lay') return { ok: false, reason: `${t.name} is not a laid track.` };
  if (t.status === 'discarded') return { ok: false, reason: `${t.name} was discarded by the runner.` };
  if (t.status === 'not_started') return { ok: false, reason: `${t.name} was never started.` };
  if (t.status === 'active') return { ok: false, reason: `${t.name} is still being laid — it can be followed once the runner presses Stop Track.` };
  if (followed.has(t.id)) return { ok: false, reason: `${t.name} has already been followed.` };
  if (isExpired(t, now)) return { ok: false, reason: `${t.name} has expired — laid tracks last ${LAID_TRACK_EXPIRY_DAYS} days.` };
  if (!trackStart(t)) return { ok: false, reason: `${t.name} recorded no points, so there is nothing to follow.` };
  return { ok: true };
}

/**
 * Laid tracks a follower standing at `here` may pick up: laid, finished, unexpired, within 500 yd —
 * and not already followed. A laid track is walked once: leaving a spent track in the picker is how
 * a team ends up re-running yesterday's exercise by accident.
 */
export function followableLaidTracks(tracks: Track[], here: LatLng | null, now = Date.now()): { track: Track; distance_m: number }[] {
  const out: { track: Track; distance_m: number }[] = [];
  const followed = followedLaidTrackIds(tracks);
  for (const t of tracks) {
    if (!followability(t, followed, now).ok) continue;
    const start = trackStart(t)!;
    const d = here ? haversineM(here, start) : 0;
    if (here && d > FOLLOW_RADIUS_M) continue;
    out.push({ track: t, distance_m: d });
  }
  // Nearest first; ties broken by the most recently laid track.
  return out.sort((a, b) => (a.distance_m - b.distance_m) || ((b.track.started_at || '').localeCompare(a.track.started_at || '')));
}

/** How closely a follower stayed on the laid path: average and worst deviation in metres. */
export interface DeviationStats { avg_m: number; max_m: number; compared: number }
export function deviationFrom(laid: LatLng[], followed: LatLng[]): DeviationStats | null {
  if (laid.length < 2 || followed.length === 0) return null;
  let sum = 0;
  let max = 0;
  let n = 0;
  for (const p of followed) {
    const d = distanceToPathM(p, laid);
    if (d == null) continue;
    sum += d;
    max = Math.max(max, d);
    n++;
  }
  if (!n) return null;
  return { avg_m: sum / n, max_m: max, compared: n };
}

// ---------- track → record ----------
/** Wall clock "HH:MM" in the track's own zone — the shape the Track Followed Time field expects. */
export function wallClock(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(11, 16);
  }
}

/**
 * What a finished track puts into the record it is attached to.
 *
 * This is the point of the whole unit: the handler walked the track, so the record must not then ask
 * them to type the distance and the duration back in by hand. The deployment's TRACKING section and
 * the training completion's TRACKING section use different field names for the same measurements, so
 * both key sets are derived here from one set of stats and the caller merges the one it needs.
 *
 * Metric is stored (metres), imperial is displayed — `track_distance` is the yard figure the
 * deployment form shows beside its unit select, `track_distance_m` is the truth underneath it.
 */
export interface TrackRecordFields {
  deployment: Record<string, unknown>;
  completion: Record<string, unknown>;
}
export function trackRecordFields(t: Pick<Track, 'name' | 'points' | 'stats' | 'started_at' | 'tz'>, opts: { locationKnown?: boolean | null } = {}): TrackRecordFields {
  const stats = t.points && t.points.length ? statsOf(t.points) : t.stats;
  const metres = Math.round(stats?.distance_m || 0);
  // Minute resolution, but a track that actually ran never reports "0 minutes": on a required field
  // that reads as missing data rather than as a short track.
  const seconds = Math.max(0, stats?.duration_s || 0);
  const minutes = seconds === 0 ? 0 : Math.max(1, Math.round(seconds / 60));
  const turns = stats?.turns ?? 0;
  const followedAt = wallClock(t.started_at, t.tz || 'UTC');
  return {
    deployment: {
      gps_found: true,
      track_name: t.name,
      track_distance: toYards(metres),
      track_distance_unit: 'Yards',
      track_distance_m: metres,
      tracking_duration_min: minutes,
      track_turns: turns,
      track_followed_time: followedAt,
    },
    completion: {
      track_name: t.name,
      track_distance_m: metres,
      track_distance_m_unit: 'Yards',
      track_duration_min: minutes,
      track_turns: turns,
      track_followed_time: followedAt,
      // Only written when we actually know: an unanswered Yes/No must never be filled in as "No".
      ...(opts.locationKnown == null ? null : { track_location_known: opts.locationKnown ? 'Yes' : 'No' }),
    },
  };
}

/** `<Surname> Track <n>` — the auto-name a layer gets, editable afterwards. */
export function autoTrackName(lastName: string, existing: Track[]): string {
  const surname = (lastName || 'Track').trim() || 'Track';
  let n = existing.filter((t) => t.mode === 'training_lay').length + 1;
  const taken = new Set(existing.map((t) => t.name));
  while (taken.has(`${surname} Track ${n}`)) n++;
  return `${surname} Track ${n}`;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — read aloud over a radio
/** 6-character pickup code handed to a track layer who has no account. */
export function makeTrackCode(taken: Set<string> = new Set(), rnd: () => number = Math.random): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let s = '';
    for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
    if (!taken.has(s)) return s;
  }
  return `T${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

// ---------- supervisor surfaces ----------
export function isLiveTrack(t: Track, now = Date.now(), days = LIVE_TRACKS_DAYS): boolean {
  if (t.status === 'discarded' || t.status === 'not_started') return false;
  if (t.status === 'active') return true;
  const at = t.started_at ? new Date(t.started_at).getTime() : new Date(t.created_at).getTime();
  return Number.isFinite(at) && at >= now - days * DAY_MS;
}

/**
 * Live Tracks count for a supervisor's banner — tracks of the handlers they manage that are active
 * now or were started in the last 3 days. Same rule as the Records hub banner
 * (src/features/records/supervisor.ts), exported here so the tracking screens and the banner agree.
 */
export function getLiveTracksCount(input: { user?: Pick<User, 'id'> | null; managedIds: string[]; tracks: Track[]; now?: number }): number {
  const now = input.now ?? Date.now();
  const managed = new Set(input.managedIds.filter((id) => id !== input.user?.id));
  return input.tracks.filter((t) => managed.has(t.owner_user_id) && isLiveTrack(t, now)).length;
}

/** Tracks drawn on the supervisor tactical map: managed handlers, last 4 hours. */
export function tacticalTracks(tracks: Track[], managedIds: string[], now = Date.now(), hours = SUPERVISOR_MAP_HOURS): Track[] {
  const managed = new Set(managedIds);
  const cut = now - hours * HOUR_MS;
  return tracks
    .filter((t) => managed.has(t.owner_user_id) && t.status !== 'discarded' && (t.points || []).length > 0)
    .filter((t) => {
      const at = new Date(t.stopped_at || t.started_at || t.created_at).getTime();
      return Number.isFinite(at) && (t.status === 'active' || at >= cut);
    })
    .sort((a, b) => (a.started_at || '') < (b.started_at || '') ? 1 : -1);
}

/** Stable colour per track on an overlaid map (three teams must not share a colour). */
export const TEAM_COLORS = ['#C62828', '#1F5F8B', '#B26A00', '#2E7D32', '#6A1B9A', '#00838F'];
export function teamColor(index: number): string {
  return TEAM_COLORS[index % TEAM_COLORS.length];
}

// ---------- SVG / thumbnail projection ----------
export interface Projected { x: number; y: number }
/** Normalise a set of paths into a width×height box, preserving aspect ratio. */
export function projectToBox(paths: LatLng[][], width: number, height: number, pad = 6): { project: (p: LatLng) => Projected; empty: boolean } {
  const all = paths.flat();
  if (!all.length) return { project: () => ({ x: width / 2, y: height / 2 }), empty: true };
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of all) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
  }
  const { mx, my } = metresPerDeg((minLat + maxLat) / 2);
  const w = Math.max((maxLng - minLng) * mx, 1);
  const h = Math.max((maxLat - minLat) * my, 1);
  const scale = Math.min((width - pad * 2) / w, (height - pad * 2) / h);
  const offX = (width - w * scale) / 2;
  const offY = (height - h * scale) / 2;
  return {
    empty: false,
    project: (p: LatLng) => ({
      x: offX + (p.lng - minLng) * mx * scale,
      y: height - offY - (p.lat - minLat) * my * scale,
    }),
  };
}

/** Bounding box of every path, padded, for fitting a live map. */
export function boundsOf(paths: LatLng[][]): { south: number; west: number; north: number; east: number } | null {
  const all = paths.flat();
  if (!all.length) return null;
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const p of all) {
    south = Math.min(south, p.lat); north = Math.max(north, p.lat);
    west = Math.min(west, p.lng); east = Math.max(east, p.lng);
  }
  return { south, west, north, east };
}

// ---------- labels ----------
export const modeLabel = (m: TrackMode): string => TRACK_MODES.find((x) => x.value === m)?.label || m;
export const visibilityLabel = (v: TrackVisibility): string => TRACK_VISIBILITIES.find((x) => x.value === v)?.label || v;

export function trackStatusLabel(t: Pick<Track, 'status'> & Partial<Pick<Track, 'saved_for_later'>>): string {
  switch (t.status) {
    case 'active': return 'Active';
    // A track the handler explicitly kept is not the same as one merely stopped: "Stopped" reads as
    // unfinished business, "Saved for later" reads as a decision already taken.
    case 'stopped': return t.saved_for_later ? 'Saved for later' : 'Stopped';
    case 'completed': return 'Completed';
    case 'discarded': return 'Discarded';
    default: return 'Not Started';
  }
}

/** What the follower is allowed to see of a laid track before the exercise is finished. */
export function visiblePortion(laid: Track, finished: boolean): { path: LatLng[]; start: LatLng | null; showPins: boolean; note: string } {
  const path = trackPath(laid);
  const start = trackStart(laid);
  if (finished || laid.visibility === 'visible') return { path, start, showPins: true, note: laid.visibility === 'visible' ? 'The laid track is visible — this is recorded on the exercise.' : 'The exercise is finished, so the whole laid track is shown.' };
  if (laid.visibility === 'start_only') return { path: [], start, showPins: false, note: 'Only the start location of the laid track is shown.' };
  return { path: [], start: null, showPins: false, note: 'The laid track is hidden until the exercise is finished.' };
}
