// Developer "Simulate walk" — a synthetic GPS feed so tracking can be exercised on a desktop browser
// (and in headless verification) without moving. It produces ~200 yards of path with real turns at
// one point per second, plus a couple of deliberately inaccurate fixes so the accuracy filter is
// visible. Nothing here runs unless the developer switch is on; it never touches real records.
import { movePoint, type LatLng } from './trackModel';

/** Default origin — the demo department's training yard, so simulated follows land inside the 500 yd radius. */
export const SIM_ORIGIN: LatLng = { lat: 40.0812, lng: -82.9013 };

/** Metres covered per simulated second (a brisk tracking pace). */
export const SIM_SPEED_MPS = 5.6;

export interface SimFix {
  lat: number;
  lng: number;
  accuracy_m: number;
  heading: number;
}

/** Heading for each leg of the synthetic walk — every change is well over the 45° turn threshold. */
const LEG_HEADINGS = [20, 100, 25, 115, 200, 285, 190, 275];
const LEG_SECONDS = 7;

/**
 * The fix at simulated second `i`, starting from `origin`.
 * The path runs for LEG_HEADINGS.length × LEG_SECONDS seconds (≈ 220 yd) and then holds still,
 * so a long run does not wander off the map.
 */
export function simulatedFix(i: number, origin: LatLng = SIM_ORIGIN, seed = 0): SimFix {
  const total = LEG_HEADINGS.length * LEG_SECONDS;
  const steps = Math.min(Math.max(0, i), total);
  let p = origin;
  let heading = LEG_HEADINGS[0];
  for (let s = 0; s < steps; s++) {
    heading = LEG_HEADINGS[Math.floor(s / LEG_SECONDS)] ?? LEG_HEADINGS[LEG_HEADINGS.length - 1];
    // Wobble so the path is not a ruler line. `seed` differs per recording session, exactly as two
    // real walks over the same ground differ — otherwise a follow would sit perfectly on the laid
    // track and the deviation figure would always read zero.
    const wobble = ((s % 3) - 1) * 3 + Math.sin((s + seed * 11) * 0.9) * (4 + seed * 6);
    p = movePoint(p, heading + wobble, SIM_SPEED_MPS);
  }
  // two deliberately bad fixes: the accuracy filter must drop them
  const bad = i === 11 || i === 26;
  return {
    lat: p.lat + (bad ? 0.0009 : 0),
    lng: p.lng + (bad ? -0.0011 : 0),
    accuracy_m: bad ? 85 : 6 + ((i * 7) % 5),
    heading,
  };
}

/** Total seconds of movement in the synthetic path. */
export const SIM_DURATION_S = LEG_HEADINGS.length * LEG_SECONDS;
/** Approximate length of the synthetic path in yards (for the developer help line). */
export const SIM_LENGTH_YD = Math.round((SIM_DURATION_S * SIM_SPEED_MPS) / 0.9144);
