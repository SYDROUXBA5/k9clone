// LocalRepository — in-memory collections persisted as one JSON document through the KV store
// (IndexedDB on web, a file in the document directory on native). Every upsert/remove writes a
// HistoryEvent with a field diff: this is the repository-level "trigger" that keeps History complete.
import { kv } from './storage';
import { matches, type Filter, type Listener, type Repository, type RowOf, type WriteOptions } from './repository';
import { ENTITY_NAMES, type BaseRow, type EntityMap, type EntityName, type HistoryEvent, type UUID } from './types';
import { deviceTimeZone, diffFields, nowISO, uuid } from './util';

const STORE_KEY = 'k9clone:store:v1';
const NO_HISTORY: EntityName[] = ['history_event', 'notification'];

type Table<E extends EntityName> = Map<UUID, RowOf<E>>;
type Persisted = Partial<Record<EntityName, BaseRow[]>>;

function labelFor(entity: EntityName, row: Record<string, unknown>): string {
  const r = row as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return (
    s(r.name) || s(r.title) || s(r.case_number) || s(r.value) || s(r.email) ||
    (entity === 'completion' ? 'Completion' : null) ||
    (entity === 'deployment' ? 'Deployment' : null) ||
    entity
  );
}

export class LocalRepository implements Repository {
  readonly mode = 'local' as const;
  private tables = new Map<EntityName, Table<EntityName>>();
  private snapshots = new Map<EntityName, BaseRow[]>();
  private listeners = new Map<EntityName | '*', Set<Listener>>();
  private actor: UUID | null = null;
  private readyPromise: Promise<void> | null = null;
  private _ready = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persisting: Promise<void> | null = null;
  private dirty = false;

  constructor() {
    for (const e of ENTITY_NAMES) this.tables.set(e, new Map());
  }

  // ----- lifecycle -----
  ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        try {
          const raw = await kv().get(STORE_KEY);
          if (raw) {
            const data = JSON.parse(raw) as Persisted;
            for (const e of ENTITY_NAMES) {
              const rows = data[e] || [];
              const t = this.tables.get(e)!;
              for (const r of rows) t.set(r.id, r as RowOf<EntityName>);
            }
          }
        } catch (err) {
          console.warn('[repo] failed to load store, starting empty', err);
        }
        this._ready = true;
        this.emit('*');
      })();
    }
    return this.readyPromise;
  }
  isReady() { return this._ready; }
  setActor(userId: UUID | null) { this.actor = userId; }
  getActor() { return this.actor; }

  // ----- reads -----
  private table<E extends EntityName>(entity: E): Table<E> {
    return this.tables.get(entity) as Table<E>;
  }
  snapshot<E extends EntityName>(entity: E): RowOf<E>[] {
    let s = this.snapshots.get(entity);
    if (!s) {
      s = [...this.table(entity).values()].filter((r) => !r.deleted_at);
      this.snapshots.set(entity, s);
    }
    return s as RowOf<E>[];
  }
  getSync<E extends EntityName>(entity: E, id: UUID): RowOf<E> | undefined {
    const r = this.table(entity).get(id);
    return r && !r.deleted_at ? r : undefined;
  }
  async list<E extends EntityName>(entity: E, filter?: Filter<RowOf<E>>): Promise<RowOf<E>[]> {
    await this.ready();
    return this.snapshot(entity).filter((r) => matches(r, filter));
  }
  async get<E extends EntityName>(entity: E, id: UUID) {
    await this.ready();
    return this.getSync(entity, id);
  }
  async count<E extends EntityName>(entity: E, filter?: Filter<RowOf<E>>) {
    return (await this.list(entity, filter)).length;
  }
  countsByEntity(): Record<EntityName, number> {
    const out = {} as Record<EntityName, number>;
    for (const e of ENTITY_NAMES) out[e] = this.snapshot(e).length;
    return out;
  }
  historyFor(userIds: UUID[], limit = 500): HistoryEvent[] {
    const set = new Set(userIds);
    return this.snapshot('history_event')
      .filter((h) => set.has(h.actor_id) || set.has(h.owner_user_id))
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, limit);
  }

  // ----- writes -----
  async upsert<E extends EntityName>(entity: E, row: Partial<RowOf<E>> & { id?: UUID }, opts: WriteOptions = {}): Promise<RowOf<E>> {
    await this.ready();
    const at = opts.at || nowISO();
    const t = this.table(entity);
    const id = row.id || uuid();
    const before = t.get(id) as (RowOf<E> & Record<string, unknown>) | undefined;
    const actor = opts.actor_id === undefined ? this.actor : opts.actor_id;
    const next = {
      ...(before || {}),
      ...row,
      id,
      owner_user_id: (row as Partial<BaseRow>).owner_user_id || before?.owner_user_id || actor || 'system',
      created_at: before?.created_at || (row as Partial<BaseRow>).created_at || at,
      updated_at: at,
      deleted_at: (row as Partial<BaseRow>).deleted_at ?? null,
    } as RowOf<E> & Record<string, unknown>;
    t.set(id, next);
    if (!opts.silent && !NO_HISTORY.includes(entity)) {
      const diff = diffFields(before as Record<string, unknown> | undefined, next as Record<string, unknown>);
      if (before || Object.keys(diff).length) {
        this.writeHistory({
          actor_id: actor || 'system',
          owner_user_id: next.owner_user_id,
          action: before ? 'modify' : 'add',
          entity,
          entity_id: id,
          label: opts.label || labelFor(entity, next),
          diff: before ? diff : summarizeAdd(next),
          at,
        });
      }
    }
    this.touch(entity);
    return next;
  }

  async remove<E extends EntityName>(entity: E, id: UUID, opts: WriteOptions = {}): Promise<void> {
    await this.ready();
    const t = this.table(entity);
    const before = t.get(id);
    if (!before || before.deleted_at) return;
    const at = opts.at || nowISO();
    const actor = opts.actor_id === undefined ? this.actor : opts.actor_id;
    const next = { ...before, deleted_at: at, updated_at: at } as RowOf<E>;
    t.set(id, next);
    if (!opts.silent && !NO_HISTORY.includes(entity)) {
      this.writeHistory({
        actor_id: actor || 'system',
        owner_user_id: before.owner_user_id,
        action: 'delete',
        entity,
        entity_id: id,
        label: opts.label || labelFor(entity, before as unknown as Record<string, unknown>),
        diff: { deleted_at: { from: null, to: at } },
        at,
      });
    }
    this.touch(entity);
  }

  private writeHistory(h: Omit<HistoryEvent, keyof BaseRow | 'tz'> & { owner_user_id: UUID }) {
    const id = uuid();
    const ev: HistoryEvent = {
      id,
      owner_user_id: h.owner_user_id,
      created_at: h.at,
      updated_at: h.at,
      deleted_at: null,
      actor_id: h.actor_id,
      action: h.action,
      entity: h.entity,
      entity_id: h.entity_id,
      label: h.label,
      diff: h.diff,
      at: h.at,
      tz: deviceTimeZone(),
    };
    this.table('history_event').set(id, ev);
    this.touch('history_event');
  }

  async clear(): Promise<void> {
    for (const e of ENTITY_NAMES) this.tables.get(e)!.clear();
    this.snapshots.clear();
    this.dirty = true;
    await this.flush();
    this.emit('*');
  }

  /** Re-read the persisted store from disk/IndexedDB (RELOAD DATA). Pending writes are flushed first. */
  async reload(): Promise<void> {
    await this.flush();
    try {
      const raw = await kv().get(STORE_KEY);
      const data = raw ? (JSON.parse(raw) as Persisted) : {};
      for (const e of ENTITY_NAMES) {
        const t = this.tables.get(e)!;
        t.clear();
        for (const r of data[e] || []) t.set(r.id, r as RowOf<EntityName>);
      }
      this.snapshots.clear();
    } catch (err) {
      console.warn('[repo] reload failed, keeping in-memory data', err);
    }
    this.emit('*');
  }

  // ----- change tracking / persistence -----
  private touch(entity: EntityName) {
    this.snapshots.delete(entity);
    this.dirty = true;
    this.schedulePersist();
    this.emit(entity);
  }
  private emit(entity: EntityName | '*') {
    if (entity !== '*') this.listeners.get(entity)?.forEach((cb) => cb(entity));
    this.listeners.get('*')?.forEach((cb) => cb(entity as EntityName));
    if (entity === '*') {
      for (const [k, set] of this.listeners) if (k !== '*') set.forEach((cb) => cb(k as EntityName));
    }
  }
  subscribe(entity: EntityName | '*', cb: Listener): () => void {
    let set = this.listeners.get(entity);
    if (!set) { set = new Set(); this.listeners.set(entity, set); }
    set.add(cb);
    return () => { set!.delete(cb); };
  }
  private schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => { void this.flush(); }, 250);
  }
  async flush(): Promise<void> {
    if (this.persistTimer) { clearTimeout(this.persistTimer); this.persistTimer = null; }
    if (this.persisting) await this.persisting;
    if (!this.dirty) return;
    this.dirty = false;
    const data: Persisted = {};
    for (const e of ENTITY_NAMES) data[e] = [...this.tables.get(e)!.values()];
    const json = JSON.stringify(data);
    this.persisting = kv().set(STORE_KEY, json).catch((err) => {
      console.warn('[repo] persist failed', err);
      this.dirty = true;
    }).finally(() => { this.persisting = null; });
    await this.persisting;
  }
}

function summarizeAdd(row: Record<string, unknown>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(row)) {
    if (['id', 'created_at', 'updated_at', 'deleted_at', 'owner_user_id', 'password'].includes(k)) continue;
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = { from: undefined, to: v };
  }
  return out;
}

export type { EntityMap };
