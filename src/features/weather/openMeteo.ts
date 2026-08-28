// Weather auto-fill — Open-Meteo (no key). Forecast endpoint with past_days for events ≤ 92 days back,
// archive endpoint older. Picks the hourly row nearest the event instant. Stored metric (°C, km/h),
// displayed imperial (°F, mph). Failure-tolerant: every error becomes a { ok:false, message } result.
import type { Weather } from '@/db/types';
import { cToF, kphToMph, nowISO } from '@/db/util';

export const FORECAST_WINDOW_DAYS = 92;
const HOURLY = 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code';

export type WeatherResult = { ok: true; weather: Weather; endpoint: 'forecast' | 'archive' } | { ok: false; message: string };

/** WMO weather code → General Conditions label. */
export function conditionsFromCode(code: number | null | undefined): string | null {
  if (code == null || Number.isNaN(code)) return null;
  if (code === 0) return 'Clear';
  if (code === 1) return 'Sunny';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Snow';
  if (code >= 95) return 'Thunderstorm';
  return 'Overcast';
}

export function compassFromDegrees(deg: number | null | undefined): string | null {
  if (deg == null || Number.isNaN(deg)) return null;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function dateOnlyUTC(iso: string): string {
  return iso.slice(0, 10);
}

/** Fetch weather for an instant at lat/lng. `fetchImpl` is injectable for tests. */
export async function fetchWeather(at: string, lat: number, lng: number, fetchImpl: typeof fetch = fetch): Promise<WeatherResult> {
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return { ok: false, message: 'Set the event date and time first.' };
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) return { ok: false, message: 'Pick a location with a map position first.' };
  const ageDays = (Date.now() - t) / 86400000;
  const useArchive = ageDays > FORECAST_WINDOW_DAYS - 2;
  const day = dateOnlyUTC(new Date(t).toISOString());
  const url = useArchive
    ? `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${day}&end_date=${day}&hourly=${HOURLY}&timezone=UTC`
    : `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=${HOURLY}&past_days=${Math.min(FORECAST_WINDOW_DAYS, Math.max(1, Math.ceil(ageDays) + 1))}&forecast_days=${ageDays < 0 ? Math.min(16, Math.ceil(-ageDays) + 1) : 1}&timezone=UTC`;
  let res: Response;
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : null;
    res = await fetchImpl(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (timer) clearTimeout(timer);
  } catch (e) {
    return { ok: false, message: 'Weather service unreachable — check your connection and press Reload.' };
  }
  if (!res.ok) return { ok: false, message: `Weather service returned ${res.status}. Press Reload to try again.` };
  let json: { hourly?: { time?: string[]; temperature_2m?: (number | null)[]; relative_humidity_2m?: (number | null)[]; wind_speed_10m?: (number | null)[]; wind_direction_10m?: (number | null)[]; weather_code?: (number | null)[] } };
  try { json = await res.json(); } catch { return { ok: false, message: 'Weather service sent an unreadable answer.' }; }
  const h = json.hourly;
  if (!h || !h.time || !h.time.length) return { ok: false, message: 'No weather data for that time and place.' };
  // nearest hourly row
  let best = -1, bestDiff = Infinity;
  for (let i = 0; i < h.time.length; i++) {
    const ti = Date.parse(h.time[i] + (h.time[i].endsWith('Z') ? '' : 'Z'));
    const d = Math.abs(ti - t);
    if (d < bestDiff) { bestDiff = d; best = i; }
  }
  if (best < 0 || bestDiff > 3 * 3600000) return { ok: false, message: 'No weather data for that time and place.' };
  const num = (arr?: (number | null)[]) => (arr && typeof arr[best] === 'number' ? (arr[best] as number) : null);
  const temp = num(h.temperature_2m);
  if (temp == null) return { ok: false, message: 'Weather data for that hour is not available yet.' };
  const weather: Weather = {
    temp_c: temp,
    humidity: num(h.relative_humidity_2m),
    wind_kph: num(h.wind_speed_10m),
    wind_dir: compassFromDegrees(num(h.wind_direction_10m)),
    conditions: conditionsFromCode(num(h.weather_code)),
    source: 'open-meteo',
    fetched_at: nowISO(),
  };
  return { ok: true, weather, endpoint: useArchive ? 'archive' : 'forecast' };
}

/** "Partly Cloudy and 71°F, 6 mph E wind" — the vendor-style one-line summary. */
export function weatherSummary(w: Weather | null | undefined): string {
  if (!w || (w.temp_c == null && !w.conditions)) return '';
  const parts: string[] = [];
  const cond = w.conditions || '';
  const temp = w.temp_c != null ? `${cToF(w.temp_c)}°F` : '';
  if (cond && temp) parts.push(`${cond} and ${temp}`);
  else if (cond || temp) parts.push(cond || temp);
  if (w.wind_kph != null) parts.push(`${kphToMph(w.wind_kph)} mph${w.wind_dir ? ` ${w.wind_dir}` : ''} wind`);
  return parts.join(', ');
}
