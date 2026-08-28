// Device preferences (persisted per device, not per account): last role per user, simulate-phone
// toggle for verifying mobile-only features on web, theme choice.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { kv } from '@/db/storage';
import type { Role } from '@/db/types';

const KEY = 'k9clone:prefs:v1';

export interface Prefs {
  simulatePhone: boolean;
  lastRoleByUser: Record<string, Role>;
  scheme: 'light' | 'dark';
  /** U7: light / dark / follow the system (the default). `scheme` is kept in step for older callers. */
  themePref: 'system' | 'light' | 'dark';
}
const DEFAULT: Prefs = { simulatePhone: false, lastRoleByUser: {}, scheme: 'light', themePref: 'system' };

interface PrefsCtx {
  prefs: Prefs;
  loaded: boolean;
  update: (patch: Partial<Prefs> | ((p: Prefs) => Prefs)) => void;
}
const Ctx = createContext<PrefsCtx>({ prefs: DEFAULT, loaded: false, update: () => {} });

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    kv().get(KEY).then((raw) => {
      if (!alive) return;
      if (raw) {
        try { setPrefs({ ...DEFAULT, ...(JSON.parse(raw) as Partial<Prefs>) }); } catch { /* ignore */ }
      }
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);
  const update = useCallback((patch: Partial<Prefs> | ((p: Prefs) => Prefs)) => {
    setPrefs((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      void kv().set(KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const value = useMemo(() => ({ prefs, loaded, update }), [prefs, loaded, update]);
  return <Ctx.Provider value={value}>{loaded ? children : null}</Ctx.Provider>;
}

export function usePrefs() {
  return useContext(Ctx);
}
