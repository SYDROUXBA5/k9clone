// Formatting helpers for the Records hub — reference formats: `<location> - 12/8/2023 11:00 AM` (web),
// `12/8/2023 11:00 AM - <location>` (mobile). Dates render in the RECORD's IANA zone.
import { deviceTimeZone } from '@/db/util';
import { partsInZone } from '@/ui/datetime';

/** `8/12/2026 9:00 AM` in the given zone. */
export function fmtShortDateTime(iso: string | null | undefined, tz?: string): string {
  if (!iso) return '—';
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: tz || deviceTimeZone(), month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
    return s.replace(', ', ' ');
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** `8/12/2026` in the given zone. */
export function fmtShortDate(iso: string | null | undefined, tz?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz || deviceTimeZone(), month: 'numeric', day: 'numeric', year: 'numeric' }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}

/** YYYY-MM-DD of an instant in a zone (calendar key). */
export function dayKeyInZone(iso: string, tz: string): string {
  const p = partsInZone(iso, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** YYYY-MM of an instant in a zone (month grouping key). */
export function monthKeyInZone(iso: string, tz: string): string {
  return dayKeyInZone(iso, tz).slice(0, 7);
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
export function monthTitle(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

/** Long day label for a chip: `Aug 12, 2026`. */
export function fmtDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(y, (m || 1) - 1, d || 1));
  } catch {
    return dayKey;
  }
}

export function truncate(s: string, n = 90): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/** `June 2026` in the record's zone (vet row child title `Vet Visit - <Month YYYY>`). */
export function monthLabel(iso: string, tz: string): string {
  const key = monthKeyInZone(iso, tz);
  const [y, m] = key.split('-').map(Number);
  const t = MONTHS[(m || 1) - 1] || '';
  return `${t.charAt(0)}${t.slice(1).toLowerCase()} ${y}`;
}
