// Live map, native build — react-native-maps (bundled in Expo Go). Same props as TrackMap.web.tsx.
// NOTE: not verifiable in this environment (no simulator on this machine); the web build is the one
// exercised by the screenshots.
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, UrlTile } from 'react-native-maps';
import { Text, radius, useColors } from '@/ui';
import { boundsOf, type LatLng } from './trackModel';
import type { TrackMapProps } from './mapTypes';

const SAT_TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export function TrackMap({ paths, pins, center, layer, height = 320, fit = true, testID = 'track-map' }: TrackMapProps) {
  const c = useColors();
  const ref = useRef<MapView | null>(null);

  useEffect(() => {
    if (!fit) return;
    const b = boundsOf(paths.map((p) => p.points as LatLng[]));
    if (!b || !ref.current) return;
    ref.current.fitToCoordinates(
      [{ latitude: b.south, longitude: b.west }, { latitude: b.north, longitude: b.east }],
      { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true },
    );
  }, [paths, fit]);

  const initial = center || paths.find((p) => p.points.length)?.points[0] || { lat: 40.0812, lng: -82.9013 };

  return (
    <View testID={testID} style={{ height, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
      <MapView
        ref={ref}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        accessibilityLabel="Track map"
        initialRegion={{ latitude: initial.lat, longitude: initial.lng, latitudeDelta: 0.004, longitudeDelta: 0.004 }}
      >
        {layer === 'satellite' ? <UrlTile urlTemplate={SAT_TILE} maximumZ={19} zIndex={-1} /> : null}
        {paths.filter((p) => p.points.length > 1).map((p) => (
          <Polyline
            key={p.id}
            coordinates={p.points.map((q) => ({ latitude: q.lat, longitude: q.lng }))}
            strokeColor={p.color}
            strokeWidth={p.width ?? 5}
            lineDashPattern={p.dashed ? [8, 8] : undefined}
          />
        ))}
        {pins.map((pin) => (
          <Marker key={pin.id} coordinate={{ latitude: pin.lat, longitude: pin.lng }} title={pin.label} accessibilityLabel={pin.label}>
            <View style={{ width: pin.big ? 30 : 22, height: pin.big ? 30 : 22, borderRadius: 20, backgroundColor: pin.color, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 16, lineHeight: 18, fontWeight: '700' }}>{pin.glyph || ''}</Text>
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}
