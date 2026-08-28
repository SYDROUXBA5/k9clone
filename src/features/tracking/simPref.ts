// The "Simulate walk" developer switch, persisted per device. It lives in its own tiny store rather
// than in the shared prefs so the tracking unit owns its own developer state.
import { useSyncExternalStore } from 'react';
import { kv } from '@/db/storage';

const KEY = 'k9clone:tracking:simulate:v1';

let value = false;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (loaded) return;
  loaded = true;
  void kv().get(KEY).then((raw) => {
    const next = raw === '1';
    if (next !== value) { value = next; emit(); }
  });
}

export function setSimulateWalk(next: boolean) {
  value = next;
  loaded = true;
  void kv().set(KEY, next ? '1' : '0');
  emit();
}

export function getSimulateWalk(): boolean {
  return value;
}

/** Live read of the developer switch. */
export function useSimulateWalk(): [boolean, (v: boolean) => void] {
  load();
  const v = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => value,
    () => value,
  );
  return [v, setSimulateWalk];
}
