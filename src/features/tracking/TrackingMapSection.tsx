// <TrackingMapSection/> — the TRACKING MAP card a record shows once a GPS track is attached to it.
//
// This is the far end of the unit: a handler walks a track on the phone, and the record they open
// afterwards has to show the map, the measurements and the pin photos without anyone retyping them.
// It draws the same static SVG the printed report uses (no tiles, no network, no map SDK), so a
// record read on a laptop, a phone, or a printed page shows the identical picture.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import { useList, useRecord } from '@/db/provider';
import { Button, Card, Divider, Muted, Row, Sheet, Text, fmtDateTime, radius, space, useColors, useIsDesktop } from '@/ui';
import { TrackImage } from './TrackImage';
import { fmtClock, fmtDistance, modeLabel, statsOf, toYards, haversineM, trackPath, trackStatusLabel } from './trackModel';

export interface TrackingMapSectionProps {
  /** The record's track_id — nothing renders when it is empty, so a caller can mount it always. */
  trackId?: string | null;
  /** Heading above the card; the deployment and completion views name it the same way. */
  title?: string;
  /**
   * Does the surrounding record actually render a TRACKING section? Left undefined the card works it
   * out from the record that owns the track, which is what every current caller relies on; a caller
   * that already knows (a report laying out its own sections) can say so and skip the lookup.
   */
  hasTrackingSection?: boolean;
  testID?: string;
}

export function TrackingMapSection({ trackId, title = 'TRACKING MAP', hasTrackingSection, testID = 'section-tracking-map' }: TrackingMapSectionProps) {
  const c = useColors();
  const desktop = useIsDesktop();
  const { width: winW, height: winH } = useWindowDimensions();
  const track = useRecord('track', trackId || null);
  const documents = useList('document');
  const completions = useList('completion');
  const deployments = useList('deployment');
  const exercises = useList('exercise');
  const [full, setFull] = useState(false);

  // Does the record this card sits on actually render a TRACKING section? A deployment shows one
  // when it is a Tracking patrol; a completion shows one when its exercise is. Saying "these values
  // filled the TRACKING section above" on a Building Search record is simply a false claim
  // (PT-GPS-15), so the sentence has to be earned rather than assumed.
  const owningDeployment = trackId ? deployments.find((d) => d.track_id === trackId) : undefined;
  const owningCompletion = trackId ? completions.find((cp) => cp.track_id === trackId) : undefined;
  const owningExercise = owningCompletion ? exercises.find((e) => e.id === owningCompletion.exercise_id) : undefined;
  const filledSection = hasTrackingSection ?? (
    owningDeployment
      ? owningDeployment.patrol_types.includes('Tracking')
      : owningExercise
        ? owningExercise.kind === 'patrol' && owningExercise.patrol_types.includes('Tracking')
        : false
  );

  // A record with no track keeps its own shape: this section simply is not there.
  if (!trackId || !track) return null;

  const stats = track.points?.length ? statsOf(track.points) : track.stats;
  const pins = track.pins || [];
  const path = trackPath(track);
  const w = desktop ? 460 : Math.max(240, Math.min(320, winW - 80));
  const fullW = Math.max(260, Math.min(desktop ? 900 : winW - 48, winW - 48));

  return (
    <Card style={{ marginBottom: space.md }} testID={testID}>
      <Row gap={6} style={{ marginBottom: space.sm }}>
        <Ionicons name="map-outline" size={20} color={c.primary} />
        <Text variant="h3" accessibilityRole="header" style={{ flex: 1, minWidth: 0 }}>{title}</Text>
        <Button
          title="Full screen"
          variant="secondary"
          icon="expand-outline"
          testID={`${testID}-full`}
          accessibilityLabel="Full screen track picture"
          onPress={() => setFull(true)}
        />
      </Row>

      <TrackImage track={track} width={w} height={desktop ? 260 : 200} testID={`${testID}-image`} />

      <View style={{ marginTop: space.sm, gap: 2 }}>
        <Text testID={`${testID}-stats`}>
          {fmtDistance(stats?.distance_m || 0)} · {fmtClock(stats?.duration_s || 0)} · {stats?.turns ?? 0} {stats?.turns === 1 ? 'turn' : 'turns'} · {pins.length} {pins.length === 1 ? 'pin' : 'pins'}
        </Text>
        <Muted testID={`${testID}-meta`}>
          {track.name} · {modeLabel(track.mode)} · {trackStatusLabel(track)}
          {track.started_at ? ` · ${fmtDateTime(track.started_at, track.tz)}` : ''}
        </Muted>
        <Muted testID={`${testID}-provenance`}>
          {filledSection
            ? 'These values filled the TRACKING section above; they came from the recorded track, not from typing.'
            : 'These measurements are held with the track itself — this record has no TRACKING section for them to fill.'}
        </Muted>
      </View>

      {pins.length ? (
        <>
          <Divider style={{ marginVertical: space.sm }} />
          <Text variant="bodyStrong" style={{ marginBottom: space.xs }}>Pins</Text>
          <View style={{ gap: space.sm }} testID={`${testID}-pins`}>
            {pins.map((p) => {
              const doc = documents.find((d) => d.id === p.photo_id);
              return (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }} testID={`${testID}-pin-${p.id}`}>
                  {doc?.uri ? (
                    <Image
                      source={{ uri: doc.uri }}
                      accessibilityLabel={`Photo at ${p.label}`}
                      style={{ width: 72, height: 72, borderRadius: radius.md, borderWidth: 1, borderColor: c.border }}
                    />
                  ) : (
                    <Ionicons name="location" size={24} color={c.accent} />
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong">{p.label}</Text>
                    <Muted>
                      {fmtDateTime(p.at, track.tz)}
                      {path.length ? ` · ${toYards(haversineM(path[0], p))} yards from the start` : ''}
                    </Muted>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <Sheet visible={full} onClose={() => setFull(false)} title={track.name} testID={`${testID}-sheet`} maxWidth={960}>
        <TrackImage track={track} width={fullW} height={Math.max(240, Math.min(560, winH * 0.5))} testID={`${testID}-image-full`} />
        <Muted style={{ marginTop: space.sm }}>
          {fmtDistance(stats?.distance_m || 0)} · {fmtClock(stats?.duration_s || 0)} · {stats?.turns ?? 0} {stats?.turns === 1 ? 'turn' : 'turns'}
        </Muted>
      </Sheet>
    </Card>
  );
}
