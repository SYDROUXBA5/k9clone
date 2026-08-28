// PWA install + service-worker state, read from the bootstrap in public/index.html.
//
// The browser fires `beforeinstallprompt` long before React mounts, so index.html catches it and
// parks it on window.__k9pwa. This module is the app's view of that object: it never fires the
// prompt itself, it only reports whether one is available and forwards the user's decision.
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type SwState = 'unsupported' | 'registering' | 'registered' | 'failed';

interface InstallPromptEvent {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
interface PwaBridge {
  prompt: InstallPromptEvent | null;
  listeners: Array<() => void>;
  installed: boolean;
  swState: SwState;
  swError?: string;
  registration?: unknown;
  notify?: () => void;
}

function bridge(): PwaBridge | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return ((window as unknown as { __k9pwa?: PwaBridge }).__k9pwa) ?? null;
}

/** True when the page is already running as an installed app (standalone display mode). */
export function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const ios = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(mq || ios);
}

export interface InstallState {
  /** The browser has an install prompt ready for us. */
  canInstall: boolean;
  /** Already installed, or running inside the installed window. */
  installed: boolean;
  /** Service-worker registration state, for the diagnostics row on Profile. */
  swState: SwState;
  swError?: string;
  /** Fire the browser's own install dialog. Resolves with what the user chose. */
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

/** Subscribes to the install bridge; re-renders when a prompt arrives or the app is installed. */
export function useInstall(): InstallState {
  const [, setTick] = useState(0);
  const [standalone, setStandalone] = useState(() => isStandalone());

  useEffect(() => {
    const b = bridge();
    if (!b) return;
    const cb = () => setTick((t) => t + 1);
    b.listeners.push(cb);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onMq = () => setStandalone(isStandalone());
    mq?.addEventListener?.('change', onMq);
    return () => {
      const i = b.listeners.indexOf(cb);
      if (i >= 0) b.listeners.splice(i, 1);
      mq?.removeEventListener?.('change', onMq);
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const b = bridge();
    if (!b?.prompt) return 'unavailable';
    const evt = b.prompt;
    b.prompt = null;
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === 'accepted') b.installed = true;
    b.notify?.();
    return choice.outcome;
  }, []);

  const b = bridge();
  return {
    canInstall: Boolean(b?.prompt) && !standalone,
    installed: Boolean(b?.installed) || standalone,
    swState: b?.swState ?? 'unsupported',
    swError: b?.swError,
    install,
  };
}
