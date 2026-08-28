// Backup & restore — the only way to get the same records onto two devices when there is no server.
//
// Everything lives in this device's own storage, so a handler's laptop and phone hold completely
// separate databases. A backup file is the bridge: export on one, import on the other. It is also the
// answer to the more frightening question — the browser owns that storage and can clear it, so a file
// the user holds is the only copy that survives a wiped profile or a new phone.
//
// The file is the store exactly as it is persisted, wrapped in a header that says what it is. Reading
// it back is therefore a straight swap plus repo.reload(), the same path "Reset demo data" already
// uses, rather than a second import routine that could drift from how the app actually loads.
import { ENTITY_NAMES, type EntityName } from '@/db/types';
import type { Repository } from '@/db/repository';
import { kv } from '@/db/storage';

const STORE_KEY = 'k9clone:store:v1';
export const BACKUP_FORMAT = 'k9clone.backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  app: string;
  /** Row counts at export time — shown before an import so nobody replaces 300 records with 3. */
  counts: Record<string, number>;
  total: number;
  data: Record<string, unknown[]>;
}

export interface BackupSummary {
  exported_at: string | null;
  total: number;
  counts: Record<string, number>;
}

/** Filename that sorts chronologically and says which device it came from. */
export function backupFilename(now: Date, label?: string): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  const who = (label || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `k9clone-backup-${stamp}${who ? '-' + who : ''}.json`;
}

/** Serialise everything on this device. Flushes first so nothing typed a second ago is missed. */
export async function buildBackup(repo: Repository, appName: string): Promise<{ json: string; summary: BackupSummary }> {
  await repo.flush();
  const raw = await kv().get(STORE_KEY);
  const data = raw ? (JSON.parse(raw) as Record<string, unknown[]>) : {};
  const counts: Record<string, number> = {};
  let total = 0;
  for (const e of ENTITY_NAMES) {
    const n = (data[e] || []).length;
    if (n) { counts[e] = n; total += n; }
  }
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    app: appName,
    counts,
    total,
    data,
  };
  return { json: JSON.stringify(file), summary: { exported_at: file.exported_at, total, counts } };
}

export class BackupError extends Error {}

/**
 * Validate a file before it is allowed anywhere near the store. The messages are written for a
 * handler holding the wrong file, not for a developer reading a stack trace.
 */
export function parseBackup(text: string): { file: BackupFile; summary: BackupSummary } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('That file is not a K9CLONE backup — it is not readable as JSON.');
  }
  if (!parsed || typeof parsed !== 'object') throw new BackupError('That file is empty or not a K9CLONE backup.');
  const f = parsed as Partial<BackupFile>;
  if (f.format !== BACKUP_FORMAT) {
    throw new BackupError('That file is not a K9CLONE backup. Export one from Profile → Backup on the other device.');
  }
  if (typeof f.version !== 'number' || f.version > BACKUP_VERSION) {
    throw new BackupError(`That backup was written by a newer version of the app (file version ${String(f.version)}, this app reads ${BACKUP_VERSION}). Update this device first.`);
  }
  if (!f.data || typeof f.data !== 'object') throw new BackupError('That backup has no records in it.');

  // Count what is actually there rather than trusting the header — a truncated download would
  // otherwise import silently and look complete.
  const counts: Record<string, number> = {};
  let total = 0;
  for (const e of ENTITY_NAMES) {
    const rows = (f.data as Record<string, unknown[]>)[e];
    if (!rows) continue;
    if (!Array.isArray(rows)) throw new BackupError(`That backup is damaged — its "${e}" section is not a list.`);
    if (rows.length) { counts[e] = rows.length; total += rows.length; }
  }
  if (!total) throw new BackupError('That backup contains no records at all. Nothing was changed.');
  if (!counts.user) throw new BackupError('That backup has no user accounts in it, so there would be no way to sign in after restoring. Nothing was changed.');

  return { file: f as BackupFile, summary: { exported_at: f.exported_at ?? null, total, counts } };
}

/**
 * Replace this device's data with the backup. Returns whether the signed-in user survived, so the
 * caller can keep the session or send them back to sign-in rather than leaving them as a ghost.
 */
export async function applyBackup(repo: Repository, file: BackupFile, currentUserId: string | null): Promise<{ userSurvived: boolean }> {
  const clean: Record<string, unknown[]> = {};
  for (const e of ENTITY_NAMES) clean[e] = Array.isArray(file.data[e]) ? file.data[e] : [];
  await kv().set(STORE_KEY, JSON.stringify(clean));
  // reload() is how the app already re-reads the store after a reset, so an import cannot diverge
  // from the normal load path.
  await repo.reload();
  const userSurvived = !!(currentUserId && repo.getSync('user' as EntityName, currentUserId));
  if (userSurvived && currentUserId) repo.setActor(currentUserId);
  return { userSurvived };
}
