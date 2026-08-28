// WEATHER block — auto-filled from Open-Meteo by event time + location; RELOAD WEATHER refetches;
// every field stays editable (manual edits set source 'manual'); shows source + fetched-at; graceful offline.
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { Weather } from '@/db/types';
import { cToF, fToC, kphToMph, mphToKph } from '@/db/util';
import { WEATHER_CONDITIONS, WIND_DIRECTIONS } from '@/db/vocab';
import { Button, Muted, Row, Text, TextField, VocabSelect, Select, fmtDateTime, space, useColors, radius } from '@/ui';
import { fetchWeather, weatherSummary } from './openMeteo';

export interface WeatherBlockProps {
  value: Weather | null;
  onChange: (w: Weather | null) => void;
  at: string | null;
  lat: number | null | undefined;
  lng: number | null | undefined;
  tz?: string;
  readOnly?: boolean;
  /** Fetch automatically when empty and time+place are known (default true). */
  auto?: boolean;
  testID?: string;
  title?: string;
}

const EMPTY: Weather = { temp_c: null, humidity: null, wind_kph: null, wind_dir: null, conditions: null, source: null, fetched_at: null };

export function WeatherBlock({ value, onChange, at, lat, lng, tz, readOnly, auto = true, testID = 'weather', title = 'WEATHER' }: WeatherBlockProps) {
  const c = useColors();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const lastKey = useRef<string>('');
  const canFetch = !!at && typeof lat === 'number' && typeof lng === 'number';

  const load = async () => {
    if (!canFetch) { setMessage('Set the date, time and a location with a map position, then press Reload.'); return; }
    setLoading(true);
    setMessage(null);
    const r = await fetchWeather(at!, lat as number, lng as number);
    setLoading(false);
    if (r.ok) { onChange(r.weather); setMessage(null); }
    else setMessage(r.message);
  };

  // Auto-fill once per (time, place) when the block is empty.
  useEffect(() => {
    if (!auto || readOnly || !canFetch) return;
    const key = `${at}|${lat}|${lng}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    if (value && (value.temp_c != null || value.conditions)) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, lat, lng, auto, readOnly, canFetch]);

  const w = value || EMPTY;
  const setField = (patch: Partial<Weather>) => onChange({ ...w, ...patch, source: 'manual' });
  const summary = weatherSummary(w);
  const sourceLine = w.source === 'open-meteo' ? `Source: Open-Meteo${w.fetched_at ? ` · fetched ${fmtDateTime(w.fetched_at, tz)}` : ''}` : w.source === 'manual' ? 'Source: entered manually' : w.source === 'seed' ? 'Source: demo data' : 'Not filled yet';

  return (
    <View testID={testID} style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surfaceAlt, padding: space.md, marginBottom: space.md }}>
      <Row justify="space-between" wrap>
        <Row gap={6}>
          <Ionicons name="cloud-outline" size={22} color={c.primary} />
          <Text variant="h3">{title}</Text>
        </Row>
        <Row>
          {!readOnly ? <Button title={loading ? 'Loading…' : 'Reload weather'} variant="ghost" icon="refresh" onPress={() => void load()} loading={loading} testID={`${testID}-reload`} accessibilityLabel="Reload weather" /> : null}
          <Button title={collapsed ? 'Expand' : 'Collapse'} variant="ghost" iconRight={collapsed ? 'chevron-down' : 'chevron-up'} onPress={() => setCollapsed((v) => !v)} testID={`${testID}-toggle`} />
        </Row>
      </Row>
      <Text testID={`${testID}-summary`} style={{ marginTop: 4 }}>{summary ? `Weather: ${summary}` : 'Weather: —'}</Text>
      <Muted testID={`${testID}-source`}>{sourceLine}</Muted>
      {message ? (
        <Row gap={6} style={{ marginTop: space.sm }}>
          <Ionicons name="cloud-offline-outline" size={20} color={c.warning} />
          <Text style={{ color: c.warning, flex: 1 }} testID={`${testID}-message`}>{message}</Text>
        </Row>
      ) : null}
      {!collapsed ? (
        <View style={{ marginTop: space.md }}>
          <VocabSelect label="General Conditions" customType="weather_condition" options={WEATHER_CONDITIONS} value={w.conditions || ''} onChange={(v) => setField({ conditions: v || null })} testID={`${testID}-conditions`} disabled={readOnly} clearable placeholder="e.g. Partly Cloudy" />
          <Row gap={space.sm} align="flex-start" wrap>
            <TextField label="Temperature (°F)" value={w.temp_c == null ? '' : String(cToF(w.temp_c))} onChangeText={(v) => setField({ temp_c: v.trim() === '' || Number.isNaN(Number(v)) ? null : fToC(Number(v)) })} keyboardType="numeric" testID={`${testID}-temp`} editable={!readOnly} containerStyle={{ flex: 1, minWidth: 140 }} placeholder="°F" />
            <TextField label="Humidity (%)" value={w.humidity == null ? '' : String(w.humidity)} onChangeText={(v) => setField({ humidity: v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v) })} keyboardType="numeric" testID={`${testID}-humidity`} editable={!readOnly} containerStyle={{ flex: 1, minWidth: 140 }} placeholder="%" />
          </Row>
          <Row gap={space.sm} align="flex-start" wrap>
            <TextField label="Wind Speed (mph)" value={w.wind_kph == null ? '' : String(kphToMph(w.wind_kph))} onChangeText={(v) => setField({ wind_kph: v.trim() === '' || Number.isNaN(Number(v)) ? null : mphToKph(Number(v)) })} keyboardType="numeric" testID={`${testID}-wind`} editable={!readOnly} containerStyle={{ flex: 1, minWidth: 140 }} placeholder="mph" />
            <Select label="Wind Direction" options={WIND_DIRECTIONS} value={w.wind_dir || ''} onChange={(v) => setField({ wind_dir: v || null })} testID={`${testID}-wind-dir`} disabled={readOnly} clearable containerStyle={{ flex: 1, minWidth: 140 }} placeholder="e.g. E" />
          </Row>
        </View>
      ) : null}
    </View>
  );
}
