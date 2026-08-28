// Repository provider + hooks. useList/useRecord subscribe to the repository so screens re-render
// on every write (optimistic UI — the local repo is the source of truth).
import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { DATA_MODE } from '@/config';
import { LocalRepository } from './local';
import { matches, type Filter, type Repository, type RowOf } from './repository';
import { supabaseConfigured, SupabaseRepository } from './supabase';
import type { EntityName, UUID } from './types';

let singleton: Repository | null = null;
export function getRepository(): Repository {
  if (!singleton) {
    singleton = DATA_MODE === 'supabase' && supabaseConfigured() ? new SupabaseRepository() : new LocalRepository();
  }
  return singleton;
}

const RepoContext = createContext<Repository | null>(null);

export function RepoProvider({ children }: { children: React.ReactNode }) {
  const [repo] = useState(() => getRepository());
  const [ready, setReady] = useState(repo.isReady());
  useEffect(() => {
    let alive = true;
    repo.ready().then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [repo]);
  return <RepoContext.Provider value={repo}>{ready ? children : null}</RepoContext.Provider>;
}

export function useRepo(): Repository {
  const r = useContext(RepoContext);
  if (!r) throw new Error('useRepo must be used inside <RepoProvider>');
  return r;
}

const noop = () => {};

/** Live list of an entity, optionally filtered. Re-renders when the entity changes. */
export function useList<E extends EntityName>(entity: E, filter?: Filter<RowOf<E>>): RowOf<E>[] {
  const repo = useRepo();
  const rows = useSyncExternalStore(
    (cb) => repo.subscribe(entity, cb),
    () => repo.snapshot(entity),
    () => repo.snapshot(entity),
  );
  if (!filter) return rows;
  return rows.filter((r) => matches(r, filter));
}

/** Live single record. */
export function useRecord<E extends EntityName>(entity: E, id: UUID | null | undefined): RowOf<E> | undefined {
  const repo = useRepo();
  return useSyncExternalStore(
    (cb) => (id ? repo.subscribe(entity, cb) : noop),
    () => (id ? repo.getSync(entity, id) : undefined),
    () => (id ? repo.getSync(entity, id) : undefined),
  );
}

/** Live counts per entity (Developer section). */
export function useEntityCounts() {
  const repo = useRepo();
  const [tick, setTick] = useState(0);
  useEffect(() => repo.subscribe('*', () => setTick((t) => t + 1)), [repo]);
  void tick;
  return repo.countsByEntity();
}
