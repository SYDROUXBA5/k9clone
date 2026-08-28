// Weather block (General Conditions · Temperature · Wind Speed · Wind Direction) auto-filled from
// Open-Meteo for the record's time + place (once, on a new record, when a pinned location + date exist),
// with RELOAD WEATHER; every field stays editable. Storage is metric (temp_c, wind_kph); display is
// °F / mph. Forecast API only for the last 5 days (its `past_days` window is reliable there); the
// archive (ERA5) endpoint for anything older. A response with no usable values never overwrites what
// the handler already has.
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { GeoLocation, Weather } from '@/db/types';
import { WEATHER_CONDITIONS, WIND_DIRECTIONS } from '@/db/vocab';
import { cToF, fToC, kphToMph, mphToKph } from '@/db/util';
import { Button, Muted, Row, Select, VocabSelect, useIsDesktop, useToast, space } from '@/ui';
import { NumberField } from './NumberField';

const WMO: Record<number, string> = { 0: 'Clear', 1: 'Mainly clear', 2: 'Partly Cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Rain', 71: 'Snow', 73: 'Snow', 75: 'Snow', 80: 'Rain showers', 81: 'Rain showers', 82: 'Rain showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
const compass = (deg: number) => WIND_DIRECTIONS[Math.round(deg / 45) % 8];

export async function fetchWeather(loc: GeoLocation, iso: string): Promise<Weather> {
  if (loc.lat == null || loc.lng == null) throw new Error('Pin a location first (address suggestion or Use my location)');
  const day = iso.slice(0, 10);
  const ageDays = (Date.now() - new Date(iso).getTime()) / 86400000;
  const base = ageDays > 5 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  const url = `${base}?latitude=${loc.lat}&longitude=${loc.lng}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&start_date=${day}&end_date=${day}&timezone=UTC`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather service ${res.status}`);
  const j = (await res.json()) as { hourly?: { time: string[]; temperature_2m: (number | null)[]; relative_humidity_2m: (number | null)[]; wind_speed_10m: (number | null)[]; wind_direction_10m: (number | null)[]; weather_code: (number | null)[] } };
  const h = j.hourly;
  if (!h || !h.time?.length) throw new Error('No weather data for that date');
  const target = new Date(iso).getTime();
  let best = 0;
  for (let i = 0; i < h.time.length; i++) if (Math.abs(new Date(h.time[i] + 'Z').getTime() - target) < Math.abs(new Date(h.time[best] + 'Z').getTime() - target)) best = i;
  const code = h.weather_code?.[best];
  if (h.temperature_2m?.[best] == null && h.wind_speed_10m?.[best] == null && code == null) throw new Error('No weather data for that date and place yet');
  return {
    temp_c: h.temperature_2m?.[best] ?? null, humidity: h.relative_humidity_2m?.[best] ?? null, wind_kph: h.wind_speed_10m?.[best] ?? null,
    wind_dir: h.wind_direction_10m?.[best] != null ? compass(h.wind_direction_10m[best]!) : null,
    conditions: code != null ? WMO[code] || `Code ${code}` : null, source: 'open-meteo', fetched_at: new Date().toISOString(),
  };
}

const hasWeather = (w: Weather | null) => !!w && (w.temp_c != null || w.wind_kph != null || !!w.conditions || !!w.wind_dir);

export function WeatherBlock({ value, onChange, location, occurredAt, disabled, autoFill = false, testID = 'weather' }: { value: Weather | null; onChange: (w: Weather | null) => void; location: GeoLocation; occurredAt: string | null; disabled?: boolean; autoFill?: boolean; testID?: string }) {
  const toast = useToast();
  const desktop = useIsDesktop();
  const [loading, setLoading] = useState(false);
  const w: Weather = value || { temp_c: null, humidity: null, wind_kph: null, wind_dir: null, conditions: null, source: null };
  const set = (patch: Partial<Weather>) => onChange({ ...w, ...patch, source: 'manual' });
  const reload = async () => {
    if (!occurredAt) { toast.show('Enter the date and time first.', 'error'); return; }
    setLoading(true);
    try { onChange(await fetchWeather(location, occurredAt)); toast.show('Weather loaded'); }
    catch (err) { toast.show(`Weather not loaded — ${err instanceof Error ? err.message : 'unknown error'}`, 'error'); }
    finally { setLoading(false); }
  };
  // auto-fill once per pin+day on a new record while the block is still empty
  const autoKey = location.lat != null && location.lng != null && occurredAt ? `${location.lat.toFixed(4)},${location.lng.toFixed(4)}@${occurredAt.slice(0, 10)}` : '';
  const triedRef = useRef('');
  const filled = hasWeather(value);
  useEffect(() => {
    if (!autoFill || disabled || !autoKey || filled || triedRef.current === autoKey) return;
    triedRef.current = autoKey;
    let alive = true;
    setLoading(true);
    fetchWeather(location, occurredAt!).then((res) => { if (alive) { onChange(res); toast.show('Weather added for the pinned location'); } })
      .catch(() => { /* leave the fields blank; RELOAD WEATHER stays available */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [autoFill, disabled, autoKey, filled]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View testID={testID}>
      <Row justify="space-between" wrap style={{ marginBottom: space.sm }}>
        <Muted style={{ flex: 1, minWidth: 200 }}>{autoFill ? 'Weather for the deployment\'s time and place is added automatically once the location is pinned (address suggestion or Use my location).' : 'Weather is fetched for the deployment\'s time and pinned place with RELOAD WEATHER.'} If it is wrong, edit the fields by hand.</Muted>
        {!disabled ? <Button title={loading ? 'Loading…' : 'RELOAD WEATHER'} variant="secondary" icon="refresh-outline" onPress={() => void reload()} loading={loading} testID={`btn-${testID}-reload`} /> : null}
      </Row>
      <View style={desktop ? { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' } : undefined}>
        <VocabSelect label="General Conditions" customType="weather_condition" options={WEATHER_CONDITIONS} value={w.conditions || ''} onChange={(v) => set({ conditions: v })} disabled={disabled} clearable testID={`select-${testID}-conditions`} containerStyle={desktop ? { flex: 2, minWidth: 220 } : undefined} />
        <NumberField label="Temperature" value={w.temp_c == null ? null : cToF(w.temp_c)} onChange={(v) => set({ temp_c: v == null ? null : fToC(v) })} editable={!disabled} testID={`input-${testID}-temp`} suffix="°F" containerStyle={desktop ? { flex: 1, minWidth: 120 } : undefined} />
        <NumberField label="Wind Speed" value={w.wind_kph == null ? null : kphToMph(w.wind_kph)} onChange={(v) => set({ wind_kph: v == null ? null : mphToKph(v) })} editable={!disabled} testID={`input-${testID}-wind`} suffix="mph" containerStyle={desktop ? { flex: 1, minWidth: 120 } : undefined} />
        <Select label="Wind Direction" options={WIND_DIRECTIONS} value={w.wind_dir || ''} onChange={(v) => set({ wind_dir: v })} disabled={disabled} clearable testID={`select-${testID}-wind-dir`} containerStyle={desktop ? { flex: 1, minWidth: 140 } : undefined} />
      </View>
      {w.source === 'open-meteo' && w.fetched_at ? <Muted>Auto-filled from Open-Meteo.</Muted> : null}
    </View>
  );
}
