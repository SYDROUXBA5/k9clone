// Live map, web build — Leaflet with OpenStreetMap raster tiles, an Esri World Imagery satellite
// layer and an OpenTopoMap terrain layer. No API key, no map SDK account. The native build resolves
// TrackMap.tsx (react-native-maps) with the same props.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { unstable_createElement } from 'react-native-web';
import type * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Text, radius, space, useColors } from '@/ui';
import { boundsOf, compass, type LatLng } from './trackModel';
import type { TrackMapProps } from './mapTypes';

const TILE_ROAD = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_TERRAIN = 'https://tile.opentopomap.org/{z}/{x}/{y}.png';
const ATTR_ROAD = '© OpenStreetMap contributors';
const ATTR_SAT = 'Imagery © Esri, Maxar, Earthstar Geographics';
const ATTR_TERRAIN = '© OpenStreetMap contributors, SRTM · style © OpenTopoMap (CC-BY-SA)';

const tileFor = (layer: string) => (layer === 'satellite' ? TILE_SAT : layer === 'terrain' ? TILE_TERRAIN : TILE_ROAD);
const attrFor = (layer: string) => (layer === 'satellite' ? ATTR_SAT : layer === 'terrain' ? ATTR_TERRAIN : ATTR_ROAD);
/**
 * Deepest zoom each source actually serves. OpenTopoMap stops at 17 and answers deeper requests with
 * a "max zoom" placeholder tile; telling Leaflet the real limit makes it upscale the last real tile
 * instead, so a track zoomed in on terrain still shows ground rather than error text.
 */
const maxNativeFor = (layer: string) => (layer === 'terrain' ? 17 : 19);

/**
 * Above Leaflet's panes (200–700) and its zoom / attribution controls (1000). Without this the map's
 * own controls paint over the Recenter and Return To Track buttons and they are invisible.
 */
const MAP_OVERLAY_Z = 1200;

/** Smallest type allowed on a capture screen — Leaflet's own chrome defaults below this. */
const MIN_TEXT_PX = 16;
const STYLE_ID = 'k9clone-map-type-scale';
/**
 * Leaflet ships 11–12px attribution and zoom glyphs. Tracking is a field screen read at arm's
 * length in daylight, where the house rule is that nothing drops under 16px — so the map's own
 * chrome is scaled up to match the rest of the screen instead of being exempt from it.
 */
function ensureMapTypeScale() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.leaflet-container { font-size: ${MIN_TEXT_PX}px; }
.leaflet-control-attribution, .leaflet-control-attribution a { font-size: ${MIN_TEXT_PX}px; line-height: 1.4; }
.leaflet-control-attribution { padding: 2px 6px; }
.leaflet-control-zoom a { font-size: 20px; line-height: 30px; }
.leaflet-tooltip { font-size: ${MIN_TEXT_PX}px; }
`;
  document.head.appendChild(style);
}

interface Handles {
  map: L.Map;
  tiles: L.TileLayer;
  layerGroup: L.LayerGroup;
  /** Attribution string currently registered, so switching layers replaces it instead of stacking. */
  attribution: string;
}

export function TrackMap({ paths, pins, center, heading, layer, height = 320, fit = true, testID = 'track-map' }: TrackMapProps) {
  const c = useColors();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handles = useRef<Handles | null>(null);
  const fitted = useRef(false);
  /**
   * Once the handler drags the map they are looking at something on purpose — a road, a fence line,
   * the next street over. Re-fitting to the track every second would yank the view back out from
   * under them, so auto-fit stops and an explicit way back is offered instead.
   */
  const [panned, setPanned] = useState(false);
  const pannedRef = useRef(false);
  pannedRef.current = panned;

  const boundsNow = useCallback(
    () => boundsOf(paths.map((p) => p.points as LatLng[]).concat(pins.map((p) => [{ lat: p.lat, lng: p.lng }]))),
    [paths, pins],
  );

  const fitToTrack = useCallback(() => {
    const h = handles.current;
    const b = boundsNow();
    if (!h || !b) return;
    h.map.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [40, 40], maxZoom: 18 });
    setPanned(false);
  }, [boundsNow]);

  const recenter = useCallback(() => {
    const h = handles.current;
    if (!h) return;
    const head = center || paths.find((p) => p.points.length)?.points.slice(-1)[0] || null;
    if (!head) { fitToTrack(); return; }
    h.map.setView([head.lat, head.lng], Math.max(h.map.getZoom(), 17));
    setPanned(false);
  }, [center, paths, fitToTrack]);

  // create the map once
  useEffect(() => {
    const host = hostRef.current;
    if (!host || handles.current) return;
    let cancelled = false;
    const Lmod = require('leaflet') as typeof L;
    if (cancelled) return;
    ensureMapTypeScale();
    // SVG renderer (Leaflet's default): the canvas renderer keeps a pending frame alive after the
    // map is removed on navigation and throws inside clearRect.
    const map = Lmod.map(host, { zoomControl: true, attributionControl: true, preferCanvas: false }).setView([center?.lat ?? 40.0812, center?.lng ?? -82.9013], 17);
    const tiles = Lmod.tileLayer(tileFor(layer), { maxZoom: 19, maxNativeZoom: maxNativeFor(layer), attribution: attrFor(layer) }).addTo(map);
    const layerGroup = Lmod.layerGroup().addTo(map);
    handles.current = { map, tiles, layerGroup, attribution: attrFor(layer) };
    // Only a human drag/zoom counts as panning away; programmatic fitBounds must not trip it.
    map.on('dragstart', () => setPanned(true));
    // Leaflet measures the container on creation; the RN View may size a tick later.
    setTimeout(() => map.invalidateSize(), 60);
    setTimeout(() => map.invalidateSize(), 400);
    return () => {
      cancelled = true;
      map.remove();
      handles.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // base layer switch
  useEffect(() => {
    const h = handles.current;
    if (!h) return;
    h.tiles.options.maxNativeZoom = maxNativeFor(layer);
    h.tiles.setUrl(tileFor(layer));
    h.map.attributionControl.setPrefix('');
    // The tile layer keeps its original attribution after setUrl, so the credit is swapped by hand —
    // showing Esri's credit over OpenTopoMap's tiles would be a licence problem, not a cosmetic one.
    const next = attrFor(layer);
    if (next !== h.attribution) {
      h.map.attributionControl.removeAttribution(h.attribution);
      h.map.attributionControl.addAttribution(next);
      h.attribution = next;
    }
  }, [layer]);

  // redraw paths + pins
  useEffect(() => {
    const h = handles.current;
    if (!h || !h.map.getContainer()) return;
    const Lmod = require('leaflet') as typeof L;
    h.layerGroup.clearLayers();

    for (const p of paths) {
      if (p.points.length < 2) continue;
      const latlngs = p.points.map((q) => [q.lat, q.lng] as [number, number]);
      Lmod.polyline(latlngs, { color: p.color, weight: p.width ?? 5, opacity: 0.9, dashArray: p.dashed ? '8 8' : undefined }).addTo(h.layerGroup);
      // direction arrows every few points, plus a bigger head arrow
      for (let i = 6; i < p.points.length; i += 8) {
        const a = p.points[i - 1];
        const b = p.points[i];
        const ang = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
        Lmod.marker([b.lat, b.lng], { icon: arrowIcon(Lmod, p.color, ang, 12), interactive: false, keyboard: false }).addTo(h.layerGroup);
      }
      if (p.head && p.points.length >= 2) {
        const last = p.points[p.points.length - 1];
        const prev = p.points[p.points.length - 2];
        const ang = heading ?? (Math.atan2(last.lng - prev.lng, last.lat - prev.lat) * 180) / Math.PI;
        // The live head: a facing cone under a bold arrow, so which way the team is pointing right
        // now is readable at a glance rather than inferred from the shape of the line.
        Lmod.marker([last.lat, last.lng], { icon: facingIcon(Lmod, p.color, ang), interactive: false, keyboard: false, zIndexOffset: 400 }).addTo(h.layerGroup);
        Lmod.marker([last.lat, last.lng], { icon: arrowIcon(Lmod, p.color, ang, 20), interactive: false, keyboard: false, zIndexOffset: 500 }).addTo(h.layerGroup);
      }
    }

    for (const pin of pins) {
      Lmod.marker([pin.lat, pin.lng], { icon: dotIcon(Lmod, pin.color, pin.glyph || '', pin.big ? 30 : 22), title: pin.label, alt: pin.label })
        .addTo(h.layerGroup)
        .bindTooltip(pin.label, { direction: 'top' });
    }

    const b = boundsNow();
    if (pannedRef.current) return; // the handler is looking somewhere on purpose
    if (b && fit && !fitted.current) {
      h.map.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [40, 40], maxZoom: 18 });
      fitted.current = true;
    } else if (b && fit) {
      h.map.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [40, 40], maxZoom: 18, animate: false });
    } else if (center) {
      h.map.setView([center.lat, center.lng], h.map.getZoom());
    }
  }, [paths, pins, center, heading, fit, boundsNow]);

  const host = unstable_createElement('div', {
    ref: hostRef,
    'data-testid': `${testID}-canvas`,
    'aria-label': 'Track map',
    role: 'img',
    style: { position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#DDE6E3' },
  });

  // Attribution is drawn by Leaflet's own control (bottom right) — no second copy here.
  return (
    <View testID={testID} style={{ height, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceAlt }}>
      {host}

      {heading != null ? (
        <View
          pointerEvents="none"
          testID={`${testID}-facing`}
          accessibilityLabel={`Facing ${compass(heading)}, ${Math.round(heading)} degrees`}
          style={{ position: 'absolute', top: space.sm, left: 56, zIndex: MAP_OVERLAY_Z, backgroundColor: 'rgba(30,30,28,0.82)', borderRadius: radius.md, paddingHorizontal: space.sm, paddingVertical: 4 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Facing {compass(heading)} · {Math.round(heading)}°</Text>
        </View>
      ) : null}

      <View style={{ position: 'absolute', right: space.sm, bottom: 44, zIndex: MAP_OVERLAY_Z, gap: space.sm, alignItems: 'flex-end' }}>
        {panned ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Return to track"
            testID={`${testID}-return`}
            onPress={fitToTrack}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: '#F2C200', borderWidth: 1, borderColor: '#8A6D00' }}
          >
            <Text style={{ color: '#1E1E1C', fontWeight: '700' }}>Return To Track</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recenter map"
          testID={`${testID}-recenter`}
          onPress={recenter}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong }}
        >
          <Text style={{ color: c.primary, fontWeight: '700' }}>Recenter</Text>
        </Pressable>
      </View>
    </View>
  );
}

function arrowIcon(Lmod: typeof L, color: string, angleDeg: number, size: number): L.DivIcon {
  return Lmod.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;transform:rotate(${angleDeg}deg);display:flex;align-items:center;justify-content:center;">
      <div style="width:0;height:0;border-left:${size / 3}px solid transparent;border-right:${size / 3}px solid transparent;border-bottom:${size / 1.6}px solid ${color};filter:drop-shadow(0 0 1px rgba(255,255,255,0.9));"></div>
    </div>`,
  });
}

/** Translucent cone pointing where the team is facing right now. */
function facingIcon(Lmod: typeof L, color: string, angleDeg: number): L.DivIcon {
  const size = 72;
  return Lmod.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;transform:rotate(${angleDeg}deg);opacity:0.35;">
      <div style="width:0;height:0;margin:0 auto;border-left:${size / 3}px solid transparent;border-right:${size / 3}px solid transparent;border-bottom:${size / 2}px solid ${color};"></div>
    </div>`,
  });
}

function dotIcon(Lmod: typeof L, color: string, glyph: string, size: number): L.DivIcon {
  // The glyph never drops below the screen's minimum type size, so the circle is widened to hold it.
  const fontPx = Math.max(MIN_TEXT_PX, Math.round(size * 0.55));
  const box = Math.max(size, fontPx + 12);
  return Lmod.divIcon({
    className: '',
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
    html: `<div style="width:${box}px;height:${box}px;border-radius:${box}px;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:${fontPx}px;font-weight:700;line-height:1;">${glyph}</div>`,
  });
}
