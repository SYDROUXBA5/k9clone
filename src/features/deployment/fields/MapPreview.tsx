// Static map preview for a pinned location: a 3×2 mosaic of OpenStreetMap raster tiles positioned so the
// pin sits in the middle, with a marker on top. No map library, works on web and native (plain <Image>).
// Tiles: https://tile.openstreetmap.org (© OpenStreetMap contributors, ODbL). Never required — the
// preview simply hides when the location has no coordinates or the tiles fail to load.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Muted, useColors, radius } from '@/ui';

const TILE = 256;
const ZOOM = 15;

function tileXY(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

export function MapPreview({ lat, lng, height = 180, style, testID = 'map-preview' }: { lat: number; lng: number; height?: number; style?: StyleProp<ViewStyle>; testID?: string }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);
  const { x, y } = tileXY(lat, lng, ZOOM);
  const cx = Math.floor(x), cy = Math.floor(y);
  const px = (x - cx) * TILE, py = (y - cy) * TILE; // pin offset inside the centre tile
  const tiles: { dx: number; dy: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) tiles.push({ dx, dy });
  const originX = width / 2 - px, originY = height / 2 - py; // top-left of the centre tile
  return (
    <View
      testID={testID}
      accessibilityLabel={`Map preview centred on ${lat.toFixed(4)}, ${lng.toFixed(4)}`}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.box, { height, borderColor: c.border, backgroundColor: c.surfaceAlt }, style]}
    >
      {width > 0 && !failed ? tiles.map((t) => (
        <Image
          key={`${t.dx},${t.dy}`}
          source={{ uri: `https://tile.openstreetmap.org/${ZOOM}/${cx + t.dx}/${cy + t.dy}.png` }}
          onError={() => setFailed(true)}
          style={{ position: 'absolute', width: TILE, height: TILE, left: originX + t.dx * TILE, top: originY + t.dy * TILE }}
          accessibilityIgnoresInvertColors
        />
      )) : null}
      {failed ? <View style={styles.center}><Muted>Map tiles unavailable offline · {lat.toFixed(4)}, {lng.toFixed(4)}</Muted></View> : null}
      <View pointerEvents="none" style={[styles.center, { left: 0, right: 0, top: 0, bottom: 0, position: 'absolute' }]}>
        <Ionicons name="location" size={34} color={c.accent} style={{ marginTop: -30 }} />
      </View>
      <View style={[styles.attrib, { backgroundColor: 'rgba(255,255,255,0.85)' }]}><Muted style={{ fontSize: 16, lineHeight: 20, color: '#1E1E1C' }}>© OpenStreetMap contributors</Muted></View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', overflow: 'hidden', borderWidth: 1, borderRadius: radius.md, position: 'relative' },
  center: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  attrib: { position: 'absolute', right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 2, borderTopLeftRadius: 6 },
});
