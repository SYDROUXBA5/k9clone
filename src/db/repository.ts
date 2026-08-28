// The Repository interface — everything above the data layer talks to this and nothing else.
// LocalRepository (src/db/local.ts) implements it for local mode; SupabaseRepository (src/db/supabase.ts)
// is a stub until keys exist. The shape is outbox-ready: every write is (entity, row) with the
// repository, not the caller, stamping ids/timestamps and writing History (the "trigger").
import type { BaseRow, EntityMap, EntityName, HistoryEvent, UUID } from './types';

export type RowOf<E extends EntityName> = EntityMap[E];
export type Filter<T> = Partial<T> | ((row: T) => boolean);
export type Listener = (entity: EntityName) => void;

export interface WriteOptions {
  /** Actor written to History. Defaults to the repository's current actor. */
  actor_id?: UUID | null;
  /** Override the instant stamped on the row/History (seed uses this to back-date). */
  at?: string;
  /** Skip History (only the seed's system rows use this). */
  silent?: boolean;
  /** Human label stored on the HistoryEvent. */
  label?: string;
}

export interface Repository {
  readonly mode: 'local' | 'supabase';
  /** Resolves once persisted data is loaded into memory. */
  ready(): Promise<void>;
  isReady(): boolean;
  setActor(userId: UUID | null): void;
  getActor(): UUID | null;

  list<E extends EntityName>(entity: E, filter?: Filter<RowOf<E>>): Promise<RowOf<E>[]>;
  get<E extends EntityName>(entity: E, id: UUID): Promise<RowOf<E> | undefined>;
  count<E extends EntityName>(entity: E, filter?: Filter<RowOf<E>>): Promise<number>;
  upsert<E extends EntityName>(entity: E, row: Partial<RowOf<E>> & { id?: UUID }, opts?: WriteOptions): Promise<RowOf<E>>;
  remove<E extends EntityName>(entity: E, id: UUID, opts?: WriteOptions): Promise<void>;

  /** Synchronous snapshot for React hooks (stable reference until the entity changes). */
  snapshot<E extends EntityName>(entity: E): RowOf<E>[];
  getSync<E extends EntityName>(entity: E, id: UUID): RowOf<E> | undefined;
  subscribe(entity: EntityName | '*', cb: Listener): () => void;

  /** Query helpers */
  historyFor(userIds: UUID[], limit?: number): HistoryEvent[];
  /** Wipe everything (Reset demo data). */
  clear(): Promise<void>;
  /** Force a persist now (tests/dev). */
  flush(): Promise<void>;
  /** RELOAD DATA — re-read the persisted store (or re-fetch from the server) and re-render everything. */
  reload(): Promise<void>;
  /** Total row count across entities (dev). */
  countsByEntity(): Record<EntityName, number>;
}

export function matches<T extends BaseRow>(row: T, filter?: Filter<T>): boolean {
  if (!filter) return true;
  if (typeof filter === 'function') return filter(row);
  for (const k of Object.keys(filter) as (keyof T)[]) {
    if (row[k] !== filter[k]) return false;
  }
  return true;
}
