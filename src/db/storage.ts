// Key-value persistence behind the local repository.
// web / PWA: IndexedDB via idb-keyval. native: one JSON file per key in the app document directory.
import { Platform } from 'react-native';

export interface KVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

function webStore(): KVStore {
  // idb-keyval falls back gracefully; guard for environments without IndexedDB (SSR / tests).
  const hasIDB = typeof indexedDB !== 'undefined';
  if (!hasIDB) {
    const mem = new Map<string, string>();
    return {
      async get(k) { return mem.get(k) ?? null; },
      async set(k, v) { mem.set(k, v); },
      async remove(k) { mem.delete(k); },
    };
  }
  const idb = require('idb-keyval') as typeof import('idb-keyval');
  return {
    async get(k) { const v = await idb.get<string>(k); return v ?? null; },
    async set(k, v) { await idb.set(k, v); },
    async remove(k) { await idb.del(k); },
  };
}

function nativeStore(): KVStore {
  const fs = require('expo-file-system') as typeof import('expo-file-system');
  const safe = (k: string) => k.replace(/[^a-zA-Z0-9._-]/g, '_') + '.json';
  const fileFor = (k: string) => new fs.File(fs.Paths.document, safe(k));
  return {
    async get(k) {
      try {
        const f = fileFor(k);
        if (!f.exists) return null;
        return await f.text();
      } catch {
        return null;
      }
    },
    async set(k, v) {
      const f = fileFor(k);
      if (!f.exists) f.create();
      f.write(v);
    },
    async remove(k) {
      try {
        const f = fileFor(k);
        if (f.exists) f.delete();
      } catch {
        /* ignore */
      }
    },
  };
}

let _store: KVStore | null = null;
export function kv(): KVStore {
  if (!_store) _store = Platform.OS === 'web' ? webStore() : nativeStore();
  return _store;
}
