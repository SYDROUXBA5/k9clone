// Event read view (EVT-13) — the "opened event" a handler sees before editing: big date line
// `<Mon DD, YYYY h:mm am>` / `<n> Hours`, address + postal code, Forecast, a map thumbnail with a pin,
// the attendee list with green checks, and `CREATED BY <name>, <date time>` as the screen subtitle.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, View } from 'react-native';
import type { TrainingEvent, User } from '@/db/types';
import { ATTENDANCE_ANSWERS } from '@/db/vocab';
import { Card, Muted, Row, Text, fmtDateTime, fmtDuration, space, useColors, radius } from '@/ui';
import { weatherSummary } from '@/features/weather/openMeteo';

const TILE = 256;
/** Slippy-map tiles around a position: a 3×3 OpenStreetMap mosaic and the pin's pixel offset inside it. */
export function tileFor(lat: number, lng: number, zoom = 15): { urls: string[][]; dx: number; dy: number; size: number } {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const fx = ((lng + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  const wrap = (v: number) => ((v % n) + n) % n;
  const urls = [-1, 0, 1].map((dy) => [-1, 0, 1].map((dx) => `https://tile.openstreetmap.org/${zoom}/${wrap(x + dx)}/${Math.min(Math.max(y + dy, 0), n - 1)}.png`));
  // pin offset inside the 3×3 mosaic (the centre tile starts one tile in)
  return { urls, dx: TILE + (fx - x) * TILE, dy: TILE + (fy - y) * TILE, size: TILE * 3 };
}

export function EventReadView({ event, users, testID = 'event-read' }: { event: TrainingEvent; users: User[]; testID?: string }) {
  const c = useColors();
  const loc = event.location || { name: '', address: '', postal_code: '', lat: null, lng: null };
  const hasPos = typeof loc.lat === 'number' && typeof loc.lng === 'number';
  const tile = hasPos ? tileFor(loc.lat as number, loc.lng as number) : null;
  const respLabel = (r: string) => ATTENDANCE_ANSWERS.find((a) => a.value === r)?.label || r;

  return (
    <View testID={testID}>
      <Card style={{ marginBottom: space.md }}>
        {event.name ? <Text variant="h3" testID={`${testID}-name`}>{event.name}</Text> : null}
        <Text variant="h2" testID={`${testID}-when`}>{fmtDateTime(event.starts_at, event.tz)}</Text>
        <Text testID={`${testID}-duration`}>{event.duration_min ? fmtDuration(event.duration_min) : 'Duration not recorded'}</Text>
        <View style={{ height: space.sm }} />
        <Row gap={6} align="flex-start">
          <Ionicons name="location-outline" size={20} color={c.primary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text testID={`${testID}-location`}>{loc.name || 'No location'}</Text>
            {loc.address ? <Muted testID={`${testID}-address`}>{loc.address}{loc.postal_code && !loc.address.includes(loc.postal_code) ? ` ${loc.postal_code}` : ''}</Muted> : null}
          </View>
        </Row>
        <Row gap={6} align="flex-start" style={{ marginTop: space.sm }}>
          <Ionicons name="partly-sunny-outline" size={20} color={c.primary} />
          <Text style={{ flex: 1, minWidth: 0 }} testID={`${testID}-forecast`}>Forecast: {event.forecast && weatherSummary(event.forecast) ? weatherSummary(event.forecast) : 'not recorded'}</Text>
        </Row>
      </Card>

      <Card style={{ marginBottom: space.md, padding: 0, overflow: 'hidden' }} testID={`${testID}-map`}>
        {tile ? (
          <View style={{ height: 220, backgroundColor: c.surfaceAlt }} accessibilityLabel={`Map of ${loc.name || 'the training location'}`}>
            <View style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -tile.dx, marginTop: -tile.dy, width: tile.size, height: tile.size }}>
              {tile.urls.map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row' }}>
                  {row.map((u, ci) => <Image key={ci} source={{ uri: u }} style={{ width: 256, height: 256 }} />)}
                </View>
              ))}
            </View>
            <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -14, marginTop: -28 }}>
              <Ionicons name="location" size={28} color={c.accent} />
            </View>
            <Muted style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 16, backgroundColor: c.surface, paddingHorizontal: 4, borderRadius: radius.sm }}>© OpenStreetMap</Muted>
          </View>
        ) : (
          <View style={{ height: 120, alignItems: 'center', justifyContent: 'center', padding: space.md }}>
            <Ionicons name="map-outline" size={28} color={c.muted} />
            <Muted style={{ textAlign: 'center' }} testID={`${testID}-map-empty`}>No map position was saved with this event.</Muted>
          </View>
        )}
      </Card>

      <Card testID={`${testID}-attendees`}>
        <Text variant="h3" style={{ marginBottom: space.sm }}>INVITED MEMBERS</Text>
        {(event.invitees || []).map((i) => {
          const u = users.find((x) => x.id === i.user_id);
          const attending = i.is_mandatory || i.response === 'attend' || i.attended;
          return (
            <View key={i.user_id} testID={`${testID}-attendee-${i.user_id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Ionicons name={attending ? 'checkmark-circle' : i.response === 'decline' ? 'close-circle' : 'help-circle-outline'} size={22} color={attending ? c.success : i.response === 'decline' ? c.danger : c.muted} />
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.primary, fontWeight: '700' }}>{(u?.first_name?.[0] || '?') + (u?.last_name?.[0] || '')}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1}>{u?.name || i.user_id}{i.is_leader ? ' · Leader' : ''}</Text>
                <Muted numberOfLines={1}>{u?.email || ''}</Muted>
                <Muted>{i.is_mandatory ? 'Attending (mandatory)' : respLabel(i.response)}</Muted>
              </View>
            </View>
          );
        })}
        {(event.invitees || []).length === 0 ? <Muted>No invited members.</Muted> : null}
      </Card>
    </View>
  );
}
