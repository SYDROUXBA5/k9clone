// SupabaseRepository — stub. Activates only when EXPO_PUBLIC_DATA_MODE=supabase and keys exist
// (docs/SETUP.md §B). Not implemented in local mode; every method throws 'not configured'.
import { DATA_MODE, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config';
import type { Repository } from './repository';
import type { EntityName } from './types';

export function supabaseConfigured(): boolean {
  return DATA_MODE === 'supabase' && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

const NOT_CONFIGURED = 'SupabaseRepository is not configured — set EXPO_PUBLIC_DATA_MODE=supabase and the URL/anon key in .env (docs/SETUP.md §B).';

function fail(): never {
  throw new Error(NOT_CONFIGURED);
}

export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;
  constructor() {
    if (!supabaseConfigured()) fail();
    // TODO(M1b): @supabase/supabase-js client, RLS grants, History via DB triggers.
    fail();
  }
  ready(): Promise<void> { return fail(); }
  isReady() { return false; }
  setActor() { fail(); }
  getActor() { return null; }
  list(): never { return fail(); }
  get(): never { return fail(); }
  count(): never { return fail(); }
  upsert(): never { return fail(); }
  remove(): never { return fail(); }
  snapshot(): never { return fail(); }
  getSync(): never { return fail(); }
  subscribe(): never { return fail(); }
  historyFor(): never { return fail(); }
  clear(): never { return fail(); }
  flush(): never { return fail(); }
  reload(): never { return fail(); }
  countsByEntity(): Record<EntityName, number> { return fail(); }
}
