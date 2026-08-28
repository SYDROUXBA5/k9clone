// Turning stored record values into printed strings: imperial display over metric storage, tri-state
// booleans that never print an unanswered question as "No", and readable labels for section keys.
import type { Weather } from '@/db/types';
import { cToF, kphToMph, mToMiles, mToYards } from '@/db/util';
import { fmtDate, fmtDateTime, fmtTime } from '@/ui/datetime';

export const EM = '—';

export function yesNo(v: unknown): string {
  if (v === true || v === 'Yes' || v === 'yes') return 'Yes';
  if (v === false || v === 'No' || v === 'no') return 'No';
  return EM; // never print an unanswered question as "No"
}

/** DECISIONS E14 — the blind flag is tri-state. An unanswered box is NOT "No", and on a court
 *  record it must not read like one, so it prints in words. */
export function blindLabel(v: boolean | null | undefined): string {
  return v === true ? 'Yes' : v === false ? 'No' : 'Not answered';
}

/** `Partly Cloudy and 72°F, 6 mph E wind` — the one-line weather sentence reports print. */
export function weatherLine(w: Weather | null | undefined): string {
  if (!w) return EM;
  const bits: string[] = [];
  const temp = w.temp_c != null ? `${cToF(w.temp_c)}°F` : '';
  if (w.conditions && temp) bits.push(`${w.conditions} and ${temp}`);
  else if (w.conditions) bits.push(w.conditions);
  else if (temp) bits.push(temp);
  if (w.humidity != null) bits.push(`${w.humidity}% humidity`);
  return bits.join(', ') || EM;
}

export function windLine(w: Weather | null | undefined): string {
  if (!w || (w.wind_kph == null && !w.wind_dir)) return EM;
  const mph = w.wind_kph != null ? `${kphToMph(w.wind_kph)} mph` : '';
  return [mph, w.wind_dir ? `${w.wind_dir} wind` : ''].filter(Boolean).join(' ') || EM;
}

export function longDateTime(iso: string | null | undefined, tz?: string): string {
  if (!iso) return EM;
  return fmtDate(iso, tz, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function longDate(iso: string | null | undefined, tz?: string): string {
  if (!iso) return EM;
  return fmtDate(iso, tz, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
export function mediumDate(iso: string | null | undefined, tz?: string): string {
  if (!iso) return EM;
  return fmtDate(iso, tz, { month: 'long', day: 'numeric', year: 'numeric' });
}
export { fmtDateTime, fmtTime };

export function hoursLabel(minutes: number | null | undefined): string {
  if (minutes == null) return EM;
  const h = minutes / 60;
  return `${h.toFixed(h >= 10 ? 1 : 2)} h`;
}

// A record that carries a GPS track prints these three figures TWICE on one sheet: once in the
// Tracking section, as the handler typed them, and once in the TRACKING MAP block, as measured from
// the recorded points. The two rarely agree (1286 yd typed vs 452 yd recorded on the demo record), so
// printing both under the identical label reads as a contradiction on a document that goes to court.
// Only the report disambiguates them — in the form there is no GPS block beside the field, so the
// plain label is the right one there.
const HANDLER_ENTERED: Record<string, string> = {
  track_distance_m: 'Track Distance (handler estimate)',
  track_turns: 'Track Turns (handler estimate)',
  track_duration_min: 'Track Duration (handler estimate)',
  tracking_duration_min: 'Tracking Duration (handler estimate)',
};

/**
 * The printed label for a stored section field. Falls back to the form's own label unless this record
 * carries a GPS track AND the field is one the track also reports — then it says whose number it is.
 */
export function handlerEnteredLabel(key: string, formLabel: string, hasTrack: boolean): string {
  return hasTrack ? (HANDLER_ENTERED[key] || formLabel) : formLabel;
}

/** `track_distance_m` → `Track Distance`; `area_size_sq_yd` → `Area Size`. */
export function humanKey(key: string): string {
  return key
    .replace(/_(m2|m|sq_yd|min|ft|kph|c)$/i, '')
    .split('_')
    .filter(Boolean)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Print one stored section value with its unit, converting metric storage to imperial display. */
export function sectionValue(key: string, raw: unknown): string {
  if (raw == null || raw === '') return EM;
  if (Array.isArray(raw)) return raw.length ? raw.map((x) => String(x)).join(', ') : EM;
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (typeof raw === 'number') {
    if (/_m$/.test(key)) return raw >= 1609 ? `${mToMiles(raw)} Miles` : `${mToYards(raw)} Yards`;
    if (/_m2$/.test(key)) return `${Math.round(raw * 1.19599)} Square yards`;
    if (/_min$/.test(key)) return `${raw} minutes`;
    if (/_sq_yd$/.test(key)) return `${raw} Square yards`;
    return String(raw);
  }
  const s = String(raw);
  if (/^(yes|no)$/i.test(s)) return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return s;
}

/** Section objects print in a stable, readable order: named keys first, then whatever else is stored. */
export function sectionEntries(data: Record<string, unknown> | undefined): { key: string; label: string; value: string }[] {
  if (!data) return [];
  return Object.keys(data)
    .filter((k) => {
      const v = data[k];
      return !(v == null || v === '' || (Array.isArray(v) && v.length === 0));
    })
    .map((k) => ({ key: k, label: humanKey(k), value: sectionValue(k, data[k]) }));
}
