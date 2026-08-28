// Small helpers shared by the db layer.

export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // RFC4122 v4 fallback (non-crypto) — only used where crypto.randomUUID is unavailable.
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += ((Math.random() * 4) | 8).toString(16);
    else s += ((Math.random() * 16) | 0).toString(16);
  }
  return s;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Shallow field diff between two plain objects (JSON-comparable values). */
export function diffFields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  ignore: string[] = ['updated_at', 'created_at'],
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after)]);
  for (const k of keys) {
    if (ignore.includes(k)) continue;
    const a = before ? before[k] : undefined;
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: a, to: b };
  }
  return out;
}

/** Deterministic PRNG (mulberry32) so the demo seed is stable across runs. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Unit conversion — imperial display, metric storage.
export const cToF = (c: number) => Math.round((c * 9) / 5 + 32);
export const fToC = (f: number) => Math.round((((f - 32) * 5) / 9) * 10) / 10;
export const kphToMph = (k: number) => Math.round(k * 0.621371);
export const mphToKph = (m: number) => Math.round(m * 1.609344 * 10) / 10;
export const mToYards = (m: number) => Math.round(m * 1.09361);
export const mToMiles = (m: number) => Math.round((m / 1609.344) * 100) / 100;
