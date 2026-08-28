// Location Name with saved-location dropdown, resolved address beneath, Photon address autocomplete
// (no key, failure tolerant) and "Use my location" (navigator.geolocation on web; native arrives with U8).
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { GeoLocation } from '@/db/types';
import { Button, FieldShell, Muted, Row, Sheet, Text, TextField, space, useColors, radius } from '@/ui';

interface PhotonHit { name: string; address: string; postal_code: string; lat: number; lng: number }

export async function photonSearch(q: string, fetchImpl: typeof fetch = fetch): Promise<PhotonHit[]> {
  const query = q.trim();
  if (query.length < 3) return [];
  try {
    const res = await fetchImpl(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`);
    if (!res.ok) return [];
    const json = (await res.json()) as { features?: Array<{ properties: Record<string, string | undefined>; geometry: { coordinates: [number, number] } }> };
    return (json.features || []).map((f) => {
      const p = f.properties || {};
      const street = [p.housenumber, p.street].filter(Boolean).join(' ');
      const cityLine = [p.city || p.town || p.village || p.district, p.state, p.postcode].filter(Boolean).join(', ');
      const name = p.name || street || cityLine;
      const address = [street && street !== name ? street : '', cityLine, p.country].filter(Boolean).join(', ');
      return { name, address, postal_code: p.postcode || '', lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
    });
  } catch {
    return [];
  }
}

export async function reverseGeocode(lat: number, lng: number, fetchImpl: typeof fetch = fetch): Promise<Partial<PhotonHit> | null> {
  try {
    const res = await fetchImpl(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: Array<{ properties: Record<string, string | undefined> }> };
    const p = json.features?.[0]?.properties;
    if (!p) return null;
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const cityLine = [p.city || p.town || p.village || p.district, p.state, p.postcode].filter(Boolean).join(', ');
    return { name: p.name || street || cityLine, address: [street, cityLine].filter(Boolean).join(', '), postal_code: p.postcode || '' };
  } catch {
    return null;
  }
}

export function LocationField({ value, onChange, readOnly, testID = 'location', label = 'Location Name', required }: { value: GeoLocation; onChange: (v: GeoLocation) => void; readOnly?: boolean; testID?: string; label?: string; required?: boolean }) {
  const c = useColors();
  const repo = useRepo();
  const actor = repo.getActor();
  const saved = useList('location', (l) => l.owner_user_id === actor).sort((a, b) => (b.use_count || 0) - (a.use_count || 0) || a.name.localeCompare(b.name));
  const [hits, setHits] = useState<PhotonHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNext = useRef(false);

  const q = value.name || '';
  useEffect(() => {
    if (!focused || readOnly) return;
    if (skipNext.current) { skipNext.current = false; return; }
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 3) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      const r = await photonSearch(q);
      setSearching(false);
      setHits(r);
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, focused, readOnly]);

  const pick = (h: { name: string; address?: string; postal_code?: string; lat: number | null; lng: number | null }) => {
    skipNext.current = true;
    onChange({ name: h.name, address: h.address || '', postal_code: h.postal_code || '', lat: h.lat, lng: h.lng });
    setHits([]);
    setShowSaved(false);
    setLocMsg(null);
  };

  const useMyLocation = () => {
    const geo = (globalThis as { navigator?: { geolocation?: { getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number } }) => void, err: (e: { message?: string }) => void, opts?: object) => void } } }).navigator?.geolocation;
    if (!geo) { setLocMsg(Platform.OS === 'web' ? 'Location is not available in this browser.' : 'Device location arrives with the GPS tracking unit — type the address for now.'); return; }
    setLocating(true);
    setLocMsg(null);
    geo.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const rev = await reverseGeocode(latitude, longitude);
      setLocating(false);
      pick({ name: rev?.name || value.name || 'My location', address: rev?.address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, postal_code: rev?.postal_code || '', lat: latitude, lng: longitude });
    }, (err) => {
      setLocating(false);
      setLocMsg(`Could not get your position${err?.message ? ` (${err.message})` : ''}. Type the address instead.`);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  };

  const hasPos = typeof value.lat === 'number' && typeof value.lng === 'number';

  /** EVT-03 `ADD NEW LOCATION` — saves what is on screen (or the fields in the sheet) to the handler's saved locations. */
  const [addOpen, setAddOpen] = useState(false);
  const [newLoc, setNewLoc] = useState<GeoLocation>({ name: '', address: '', postal_code: '', lat: null, lng: null });
  const [addError, setAddError] = useState<string | null>(null);
  const openAdd = () => {
    setNewLoc({ name: value.name || '', address: value.address || '', postal_code: value.postal_code || '', lat: value.lat ?? null, lng: value.lng ?? null });
    setAddError(null);
    setAddOpen(true);
  };
  const saveNewLocation = async () => {
    const name = (newLoc.name || '').trim();
    if (!name) { setAddError('Location Name is required — name the place you train at.'); return; }
    if (!actor) { setAddError('Sign in again to save a location.'); return; }
    const existing = (await repo.list('location', (l) => l.owner_user_id === actor && l.name.toLowerCase() === name.toLowerCase()))[0];
    if (existing) {
      await repo.upsert('location', { id: existing.id, address: newLoc.address || existing.address, postal_code: newLoc.postal_code || existing.postal_code, lat: newLoc.lat ?? existing.lat, lng: newLoc.lng ?? existing.lng }, { label: name });
    } else {
      await repo.upsert('location', { owner_user_id: actor, name, address: newLoc.address || '', postal_code: newLoc.postal_code || '', lat: newLoc.lat ?? null, lng: newLoc.lng ?? null, use_count: 0, last_used_at: new Date().toISOString() }, { label: name });
    }
    setAddOpen(false);
    pick({ ...newLoc, name });
  };
  return (
    <View testID={testID}>
      <TextField
        label={label}
        required={required}
        value={value.name}
        onChangeText={(t) => onChange({ ...value, name: t, ...(t.trim() === '' ? { lat: null, lng: null, address: '' } : {}) })}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        placeholder="e.g. 3400 Aircraft Dr or Training Yard"
        testID={`${testID}-name`}
        editable={!readOnly}
        autoCapitalize="words"
        right={!readOnly && saved.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Saved locations" accessibilityState={{ expanded: showSaved }} testID={`${testID}-saved-toggle`} onPress={() => setShowSaved((v) => !v)} style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text color="primary" variant="label">Saved locations</Text>
            <Ionicons name={showSaved ? 'chevron-up' : 'chevron-down'} size={18} color={c.primary} />
          </Pressable>
        ) : undefined}
        containerStyle={{ marginBottom: 6 }}
      />
      {showSaved && !readOnly ? (
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surface, marginBottom: space.sm }} testID={`${testID}-saved-list`}>
          {saved.slice(0, 8).map((l) => (
            <Pressable key={l.id} accessibilityRole="menuitem" accessibilityLabel={l.name} testID={`${testID}-saved-${l.id}`} onPress={() => pick(l)} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [{ paddingHorizontal: space.md, paddingVertical: 10, minHeight: 44, backgroundColor: pressed || hovered ? c.surfaceAlt : 'transparent' }]}>
              <Text>{l.name}</Text>
              {l.address ? <Muted>{l.address}</Muted> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {hits.length && focused && !readOnly ? (
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surface, marginBottom: space.sm }} testID={`${testID}-suggestions`}>
          {hits.map((h, i) => (
            <Pressable key={`${h.lat}-${h.lng}-${i}`} accessibilityRole="menuitem" accessibilityLabel={`${h.name}, ${h.address}`} testID={`${testID}-suggestion-${i}`} onPress={() => pick(h)} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [{ paddingHorizontal: space.md, paddingVertical: 10, minHeight: 44, backgroundColor: pressed || hovered ? c.surfaceAlt : 'transparent' }]}>
              <Text>{h.name}</Text>
              <Muted>{h.address}</Muted>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Row wrap justify="space-between" style={{ marginBottom: space.md }}>
        <View style={{ flex: 1, minWidth: 180 }}>
          {value.address ? <Muted testID={`${testID}-address`}>{value.address}{value.postal_code && !value.address.includes(value.postal_code) ? ` ${value.postal_code}` : ''}</Muted> : null}
          {hasPos ? <Muted testID={`${testID}-coords`}>{`${(value.lat as number).toFixed(4)}, ${(value.lng as number).toFixed(4)}`}</Muted> : value.name ? <Muted testID={`${testID}-nopos`}>No map position yet — pick a suggestion or use your location for weather.</Muted> : null}
          {searching ? <Muted>Searching addresses…</Muted> : null}
          {locMsg ? <Text color="danger" testID={`${testID}-message`}>{locMsg}</Text> : null}
        </View>
        {!readOnly ? (
          <Row wrap justify="flex-end" style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
            <Button title="Add new location" variant="ghost" icon="add-circle-outline" onPress={openAdd} testID={`${testID}-add-new`} accessibilityLabel="Add new location" />
            <Button title={locating ? 'Locating…' : 'Use my location'} variant="secondary" icon="locate-outline" onPress={useMyLocation} loading={locating} testID={`${testID}-use-mine`} />
          </Row>
        ) : null}
      </Row>
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Add new location" testID={`${testID}-add-sheet`} maxWidth={480}>
        <Muted style={{ marginBottom: space.sm }}>Saved locations are yours; they appear in the Saved locations list on every record.</Muted>
        <TextField label="Location Name" required value={newLoc.name} onChangeText={(v) => setNewLoc({ ...newLoc, name: v })} placeholder="e.g. County Training Yard" testID={`${testID}-add-name`} error={addError} />
        <TextField label="Address" value={newLoc.address || ''} onChangeText={(v) => setNewLoc({ ...newLoc, address: v })} placeholder="Street, city, state" testID={`${testID}-add-address`} />
        <TextField label="Postal code" value={newLoc.postal_code || ''} onChangeText={(v) => setNewLoc({ ...newLoc, postal_code: v })} testID={`${testID}-add-postal`} containerStyle={{ maxWidth: 220 }} />
        <Muted testID={`${testID}-add-position`}>{typeof newLoc.lat === 'number' && typeof newLoc.lng === 'number' ? `Map position ${(newLoc.lat as number).toFixed(4)}, ${(newLoc.lng as number).toFixed(4)} — used for weather.` : 'No map position — pick a suggestion in the field above or use your location first, so weather can be fetched.'}</Muted>
        <Row justify="flex-end" style={{ marginTop: space.md }}>
          <Button title="Cancel" variant="secondary" onPress={() => setAddOpen(false)} testID={`${testID}-add-cancel`} />
          <Button title="Save location" onPress={() => void saveNewLocation()} testID={`${testID}-add-save`} />
        </Row>
      </Sheet>
    </View>
  );
}
