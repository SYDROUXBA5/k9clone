// Public route: lay a track without an account. Reachable signed-out (from the sign-in page's
// "Skip login — track layers only") and from a layer session.
import React from 'react';
import { LayerShell } from '@/features/nav/LayerShell';
import { TrackLayerScreen } from '@/features/tracking';

export default function Route() {
  return (
    <LayerShell>
      <TrackLayerScreen />
    </LayerShell>
  );
}
