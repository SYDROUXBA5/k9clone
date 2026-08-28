// Which laid track this device is in the middle of walking, remembered across reloads.
//
// A track layer has no account, so there is no session to hang this on: without a remembered id, a
// refresh (or a locked phone) drops the runner back on the empty "Lay a track" form while the row
// they started keeps recording invisibly, holding a code nobody can read any more (PT-GPS-13).
// The repository is the source of truth for the track itself — this stores only the pointer.
import { kv } from '@/db/storage';

const KEY = 'k9clone:tracking:layer-track:v1';

export async function rememberLayerTrack(id: string): Promise<void> {
  try { await kv().set(KEY, id); } catch { /* a lost pointer is recoverable — see the fallback scan */ }
}

export async function recallLayerTrack(): Promise<string | null> {
  try { return await kv().get(KEY); } catch { return null; }
}

export async function forgetLayerTrack(): Promise<void> {
  try { await kv().remove(KEY); } catch { /* ignore */ }
}
