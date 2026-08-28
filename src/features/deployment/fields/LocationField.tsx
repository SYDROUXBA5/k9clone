// Location block: Location Name · Address Line 1 (Photon autocomplete + "Use my location") ·
// Address Line 2 · City · State/Region · Postal Code · Country · static map preview when pinned.
// Stores GeoLocation {name, address (composed), address_line1/2, city, region, postal_code, country, lat, lng}.
// Photon (komoot) needs no key; failures degrade to plain typing — nothing here is required
// (minimum-required-fields law).
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { GeoLocation } from '@/db/types';
import { Button, Muted, Row, Text, TextField, useColors, useIsDesktop, useToast, radius, space } from '@/ui';
import { MapPreview } from './MapPreview';

interface Suggestion { label: string; name: string; address_line1: string; city: string; region: string; postal_code: string; country: string; lat: number | null; lng: number | null }

/** One-line address from the parts (used for row titles, saved-location matching and older readers of `address`). */
export function composeAddress(v: Pick<GeoLocation, 'address_line1' | 'address_line2' | 'city' | 'region' | 'postal_code' | 'country'>): string {
  const cityLine = [v.city, [v.region, v.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [...new Set([v.address_line1, v.address_line2, cityLine, v.country].map((s) => (s || '').trim()).filter(Boolean))].join(', ');
}
/** Older rows only carry `address` — show it on Line 1 so nothing is lost. */
export function splitLegacy(v: GeoLocation): GeoLocation {
  if (v.address_line1 || v.city || v.country || v.region) return v;
  if (!v.address) return v;
  const parts = v.address.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const [line1, city, ...rest] = parts;
    const tail = rest.join(' ').replace(v.postal_code || '', '').trim();
    return { ...v, address_line1: line1, city, region: tail };
  }
  return { ...v, address_line1: v.address };
}

function photonToSuggestion(f: { properties: Record<string, string | undefined>; geometry: { coordinates: [number, number] } }): Suggestion {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const line1 = street || p.name || '';
  const city = p.city || p.town || p.village || p.district || '';
  const s: Suggestion = { label: '', name: p.name && p.name !== street ? p.name : '', address_line1: line1, city, region: p.state || '', postal_code: p.postcode || '', country: p.country || '', lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
  const composed = composeAddress(s);
  s.label = s.name && s.name !== line1 ? `${s.name} — ${composed}` : composed;
  return s;
}

export async function photonSearch(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6`, { signal });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const json = (await res.json()) as { features: Array<{ properties: Record<string, string>; geometry: { coordinates: [number, number] } }> };
  return (json.features || []).map(photonToSuggestion);
}
export async function photonReverse(lat: number, lng: number): Promise<Suggestion | null> {
  const res = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { features: Array<{ properties: Record<string, string>; geometry: { coordinates: [number, number] } }> };
  return json.features?.[0] ? photonToSuggestion(json.features[0]) : null;
}

export function LocationField({ value: raw, onChange, disabled, testID = 'location', errors = {} }: { value: GeoLocation; onChange: (v: GeoLocation) => void; disabled?: boolean; testID?: string; errors?: Record<string, string> }) {
  const c = useColors();
  const desktop = useIsDesktop();
  const toast = useToast();
  const repo = useRepo();
  const actor = repo.getActor();
  const value = splitLegacy(raw);
  const recent = useList('location', (l) => l.owner_user_id === actor).sort((a, b) => (b.use_count || 0) - (a.use_count || 0)).slice(0, 5);
  const [query, setQuery] = useState(value.address_line1 || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // keep the box in sync when the parent replaces the location (prefill / clear)
  const [seen, setSeen] = useState(value.address_line1 || '');
  if ((value.address_line1 || '') !== seen) { setSeen(value.address_line1 || ''); setQuery(value.address_line1 || ''); }

  useEffect(() => {
    if (!open || query.trim().length < 3 || query === value.address_line1) { setSuggestions([]); return; }
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    const t = setTimeout(() => {
      photonSearch(query.trim(), ctrl.signal).then((s) => { if (!ctrl.signal.aborted) setSuggestions(s); }).catch(() => { /* offline or blocked: keep typing */ });
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, open, value.address_line1]);

  /** Update parts + recompose `address`. Typing any address part un-pins the coordinates unless `keepPin`. */
  const setParts = (p: Partial<GeoLocation>, keepPin = false) => {
    const next: GeoLocation = { ...value, ...p };
    next.address = composeAddress(next);
    if (!keepPin) { next.lat = null; next.lng = null; }
    onChange(next);
  };
  const pick = (s: Suggestion) => {
    const next: GeoLocation = { ...value, name: value.name || s.name, address_line1: s.address_line1, address_line2: '', city: s.city, region: s.region, postal_code: s.postal_code || value.postal_code, country: s.country, lat: s.lat, lng: s.lng };
    next.address = composeAddress(next);
    onChange(next);
    setQuery(s.address_line1);
    setSeen(s.address_line1);
    setSuggestions([]);
    setOpen(false);
  };
  const useMyLocation = () => {
    const geo = (globalThis as { navigator?: { geolocation?: Geolocation } }).navigator?.geolocation;
    if (!geo) { toast.show('Location is not available on this device yet — type the address.', 'info'); return; }
    setLocating(true);
    geo.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const s = await photonReverse(latitude, longitude);
          if (s) pick({ ...s, lat: latitude, lng: longitude });
          else onChange({ ...value, lat: latitude, lng: longitude });
          toast.show('Location filled from GPS');
        } catch {
          onChange({ ...value, lat: latitude, lng: longitude });
          toast.show('GPS position saved; address lookup unavailable', 'info');
        } finally { setLocating(false); }
      },
      (err) => { setLocating(false); toast.show(`Could not get your location — ${err.message || 'permission denied'}`, 'error'); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };
  const showRecent = open && query.trim().length < 3 && recent.length > 0;
  const recentAsSuggestion = (l: GeoLocation): Suggestion => {
    const s = splitLegacy(l);
    return { label: [l.name, l.address].filter(Boolean).join(' — '), name: l.name, address_line1: s.address_line1 || '', city: s.city || '', region: s.region || '', postal_code: s.postal_code || '', country: s.country || '', lat: l.lat, lng: l.lng };
  };
  const pinned = value.lat != null && value.lng != null;
  const row = desktop ? { flexDirection: 'row' as const, gap: space.md, flexWrap: 'wrap' as const } : undefined;
  const col = desktop ? { flex: 1, minWidth: 160 } : undefined;
  return (
    <View testID={`block-${testID}`}>
      <TextField label="Location Name" value={value.name || ''} onChangeText={(v) => onChange({ ...value, name: v })} testID={`input-${testID}-name`} editable={!disabled} placeholder="e.g. Hidden Lake Apartments" maxLength={250} error={errors.name} />
      <TextField
        label="Address Line 1"
        value={query}
        onChangeText={(v) => { setQuery(v); setOpen(true); setSeen(v); setParts({ address_line1: v }); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        testID={`input-${testID}-address`}
        editable={!disabled}
        placeholder="Street and number — start typing for suggestions"
        help={pinned ? `Pinned at ${value.lat!.toFixed(5)}, ${value.lng!.toFixed(5)}` : 'Type at least 3 characters for address suggestions; picking one pins the map.'}
        error={errors.address}
        right={!disabled ? <Button title={locating ? 'Locating…' : 'Use my location'} variant="ghost" icon="locate-outline" onPress={useMyLocation} loading={locating} testID={`btn-${testID}-use-my-location`} style={{ minHeight: 36, paddingVertical: 4 }} /> : undefined}
        autoCorrect={false}
      />
      {(suggestions.length > 0 || showRecent) && !disabled ? (
        <View style={[styles.dropdown, { backgroundColor: c.surface, borderColor: c.borderStrong }]} testID={`list-${testID}-suggestions`}>
          {showRecent ? <Muted style={{ paddingHorizontal: space.md, paddingTop: space.sm }}>Recent locations</Muted> : null}
          {(showRecent ? recent.map(recentAsSuggestion) : suggestions).map((s, i) => (
            <Pressable key={`${s.label}-${i}`} accessibilityRole="button" accessibilityLabel={s.label} testID={`option-${testID}-${i}`} onPress={() => pick(s)} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.option, { backgroundColor: pressed || hovered ? c.surfaceAlt : 'transparent' }]}>
              <Ionicons name={showRecent ? 'time-outline' : 'location-outline'} size={20} color={c.muted} style={{ marginRight: space.sm }} />
              <Text style={{ flex: 1 }} numberOfLines={2}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <TextField label="Address Line 2" value={value.address_line2 || ''} onChangeText={(v) => setParts({ address_line2: v }, true)} testID={`input-${testID}-address2`} editable={!disabled} placeholder="Apartment, suite, building (optional)" maxLength={250} />
      <View style={row}>
        <TextField label="City" value={value.city || ''} onChangeText={(v) => setParts({ city: v })} testID={`input-${testID}-city`} editable={!disabled} maxLength={120} containerStyle={col} />
        <TextField label="State / Region" value={value.region || ''} onChangeText={(v) => setParts({ region: v })} testID={`input-${testID}-region`} editable={!disabled} maxLength={120} containerStyle={col} placeholder="e.g. OH" />
      </View>
      <View style={row}>
        <TextField label="Postal Code" value={value.postal_code || ''} onChangeText={(v) => setParts({ postal_code: v }, true)} testID={`input-${testID}-postal`} editable={!disabled} maxLength={12} containerStyle={col} placeholder="e.g. 43000" />
        <TextField label="Country" value={value.country || ''} onChangeText={(v) => setParts({ country: v })} testID={`input-${testID}-country`} editable={!disabled} maxLength={80} containerStyle={col} placeholder="e.g. United States" />
      </View>
      {pinned ? (
        <View style={{ marginBottom: space.md }}>
          <Row justify="space-between" style={{ marginBottom: 6 }}>
            <Text variant="label">Map</Text>
            {!disabled ? <Button title="Unpin" variant="ghost" icon="close-circle-outline" onPress={() => onChange({ ...value, lat: null, lng: null })} testID={`btn-${testID}-unpin`} style={{ minHeight: 36, paddingVertical: 4 }} /> : null}
          </Row>
          <MapPreview lat={value.lat!} lng={value.lng!} testID={`map-${testID}`} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dropdown: { borderWidth: 1, borderRadius: radius.md, marginTop: -space.sm, marginBottom: space.md, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 10, minHeight: 44 },
});
