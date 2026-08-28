// Live position feed. One hook, three sources:
//   • the developer walk simulator (any platform, 1 fix/second)
//   • navigator.geolocation.watchPosition on web
//   • expo-location watchPositionAsync (foreground) on native
// Every failure becomes a plain-language message — geolocation being off must never crash a screen.
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { SIM_ORIGIN, simulatedFix } from './simulate';
import type { LatLng } from './trackModel';

export interface Fix {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  heading: number | null;
  at: string;
  simulated: boolean;
}

export type GeoState = 'idle' | 'starting' | 'live' | 'denied' | 'unavailable' | 'error';

export interface LivePosition {
  fix: Fix | null;
  state: GeoState;
  /** Plain-language explanation when state is not `live`. */
  message: string | null;
  simulated: boolean;
}

const DENIED_MESSAGE =
  'Location permission is off, so this track cannot record. Allow location for this app in your device or browser settings, then press Start again. You can also turn on Simulate walk to try tracking without moving.';
const UNAVAILABLE_MESSAGE =
  'This device has no location service available. Tracking needs GPS; turn on Simulate walk to try the screen without it.';

/**
 * Watch the device position while `enabled`. When `simulate` is true a synthetic walk is fed instead,
 * starting from `origin` (default: the demo training yard).
 */
export function useLivePosition({ enabled, simulate, origin = SIM_ORIGIN }: { enabled: boolean; simulate: boolean; origin?: LatLng }): LivePosition {
  const [fix, setFix] = useState<Fix | null>(null);
  const [state, setState] = useState<GeoState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const tick = useRef(0);

  useEffect(() => {
    if (!enabled) { setState('idle'); return; }
    setState('starting');
    setMessage(null);

    // ---- simulator ----
    if (simulate) {
      tick.current = 0;
      const seed = Math.random();
      const push = () => {
        const s = simulatedFix(tick.current, origin, seed);
        setFix({ lat: s.lat, lng: s.lng, accuracy_m: s.accuracy_m, heading: s.heading, at: new Date().toISOString(), simulated: true });
        setState('live');
        tick.current += 1;
      };
      push();
      const id = setInterval(push, 1000);
      return () => clearInterval(id);
    }

    // ---- web geolocation ----
    if (Platform.OS === 'web') {
      const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
      if (!geo) { setState('unavailable'); setMessage(UNAVAILABLE_MESSAGE); return; }
      let id: number | null = null;
      try {
        id = geo.watchPosition(
          (pos) => {
            setFix({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy_m: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
              heading: typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : null,
              at: new Date(pos.timestamp || Date.now()).toISOString(),
              simulated: false,
            });
            setState('live');
            setMessage(null);
          },
          (err) => {
            if (err && err.code === 1) { setState('denied'); setMessage(DENIED_MESSAGE); }
            else if (err && err.code === 2) { setState('unavailable'); setMessage(UNAVAILABLE_MESSAGE); }
            else { setState('error'); setMessage('The location service is not answering. Move somewhere with a clearer view of the sky and press Start again, or turn on Simulate walk.'); }
          },
          { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
        );
      } catch {
        setState('unavailable');
        setMessage(UNAVAILABLE_MESSAGE);
      }
      return () => { if (id != null && geo) geo.clearWatch(id); };
    }

    // ---- native (expo-location, foreground only) ----
    let cancelled = false;
    let sub: { remove: () => void } | null = null;
    (async () => {
      try {
        const Location = require('expo-location') as typeof import('expo-location');
        const perm = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (!perm.granted) { setState('denied'); setMessage(DENIED_MESSAGE); return; }
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 },
          (pos) => {
            setFix({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy_m: pos.coords.accuracy ?? null,
              heading: pos.coords.heading ?? null,
              at: new Date(pos.timestamp || Date.now()).toISOString(),
              simulated: false,
            });
            setState('live');
            setMessage(null);
          },
        );
      } catch {
        if (!cancelled) { setState('unavailable'); setMessage(UNAVAILABLE_MESSAGE); }
      }
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [enabled, simulate, origin.lat, origin.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return { fix, state, message, simulated: simulate };
}
