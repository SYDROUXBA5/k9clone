// Shared props for the live map so the web (Leaflet) and native (react-native-maps) implementations
// stay interchangeable.
import type { LatLng, MapLayer } from './trackModel';

export interface MapPath {
  id: string;
  points: LatLng[];
  color: string;
  /** Draw a large arrow at the last point (the live head of the track). */
  head?: boolean;
  dashed?: boolean;
  width?: number;
  label?: string;
}

export interface MapPinMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label: string;
  /** Single character drawn inside the marker (S = start, F = finish, ● = pin). */
  glyph?: string;
  big?: boolean;
}

export interface TrackMapProps {
  paths: MapPath[];
  pins: MapPinMarker[];
  center?: LatLng | null;
  /** Facing direction in degrees for the head arrow. */
  heading?: number | null;
  layer: MapLayer;
  height?: number;
  /** Keep the whole track in view (off when the user has panned deliberately). */
  fit?: boolean;
  testID?: string;
}
