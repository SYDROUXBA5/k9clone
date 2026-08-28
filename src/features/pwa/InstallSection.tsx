// "Install K9CLONE" — the desktop-app half of the product (docs/DECISIONS.md decision 4: the desktop
// app IS the PWA). Rendered on Profile and offered from the account menu.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { APP_NAME } from '@/config';
import { Button, Muted, Text, space, useColors, useToast } from '@/ui';
import { useInstall } from './install';

/** How this browser gets the app onto the machine when it has no install prompt of its own. */
function manualHint(): string {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  if (iOS) return 'On iPhone and iPad: tap Share, then "Add to Home Screen".';
  if (safari) return 'In Safari: File → "Add to Dock".';
  if (/Firefox/.test(ua)) return 'Firefox on desktop cannot install web apps — use Chrome, Edge or Safari.';
  return 'In Chrome or Edge: open the ⋮ menu → Cast, save and share → "Install page as app".';
}

export function InstallSection({ testID = 'section-install' }: { testID?: string }) {
  const { canInstall, installed, swState, swError, install } = useInstall();
  const c = useColors();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const outcome = await install();
      if (outcome === 'accepted') toast.show(`${APP_NAME} installed`);
      else if (outcome === 'dismissed') toast.show('Install cancelled — nothing changed');
      else toast.show('This browser has no install prompt right now', 'error');
    } finally {
      setBusy(false);
    }
  };

  const offlineLine =
    swState === 'registered'
      ? 'Offline ready — the app and every record on this device open with no network.'
      : swState === 'failed'
        ? `Offline storage could not start${swError ? ` (${swError})` : ''}. The app still works while you are online.`
        : swState === 'registering'
          ? 'Preparing offline storage…'
          : 'This browser does not support offline storage.';

  return (
    <View testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
        <Ionicons name={installed ? 'checkmark-circle' : 'desktop-outline'} size={24} color={installed ? c.success : c.primary} style={{ marginRight: space.sm }} />
        <Text variant="bodyStrong" testID="text-install-state" style={{ flex: 1 }}>
          {installed ? `${APP_NAME} is installed on this device` : `Install ${APP_NAME} as an app`}
        </Text>
      </View>
      <Muted style={{ marginBottom: space.sm }} testID="text-install-help">
        {installed
          ? 'It opens in its own window from the Dock, Start menu or Home screen — no browser bar, and it starts on your Records.'
          : `Installing puts ${APP_NAME} in your Dock, Start menu or Home screen and opens it in its own window, without a browser address bar.`}
      </Muted>
      {canInstall ? (
        <Button title={`Install ${APP_NAME}`} icon="download-outline" onPress={() => void run()} loading={busy} testID="btn-install-app" style={{ alignSelf: 'flex-start' }} />
      ) : installed ? null : (
        <Muted testID="text-install-manual">{manualHint()}</Muted>
      )}
      <Muted style={{ marginTop: space.sm }} testID="text-offline-state">{offlineLine}</Muted>
    </View>
  );
}
