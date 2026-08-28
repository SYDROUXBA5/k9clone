// Date/time helpers shared by DateTimeField and screens. Instants are ISO UTC; display uses the
// record's IANA zone (falls back to the device zone). Imperial/US formats (M/D/YYYY h:mm AM).
import { deviceTimeZone } from '@/db/util';

export interface Instant { at: string | null; tz: string }

export function partsInZone(iso: string, tz: string): { y: number; m: number; d: number; hh: number; mm: number } {
  const d = new Date(iso);
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute };
  } catch {
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), hh: d.getHours(), mm: d.getMinutes() };
  }
}

/** Build an ISO instant from wall-clock parts in a zone (iterative offset correction). */
export function instantFromParts(y: number, m: number, d: number, hh: number, mm: number, tz: string): string {
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 3; i++) {
    const p = partsInZone(new Date(guess).toISOString(), tz);
    const wall = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
    const target = Date.UTC(y, m - 1, d, hh, mm);
    const diff = target - wall;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess).toISOString();
}

export function toDateInput(iso: string | null, tz: string): string {
  if (!iso) return '';
  const p = partsInZone(iso, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}
export function toTimeInput(iso: string | null, tz: string): string {
  if (!iso) return '';
  const p = partsInZone(iso, tz);
  return `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
}
export function fromInputs(date: string, time: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date.trim());
  if (!m) return null;
  const t = /^(\d{1,2}):(\d{2})/.exec(time.trim()) || ['', '0', '0'];
  return instantFromParts(+m[1], +m[2], +m[3], +t[1], +t[2], tz);
}

export function fmtDate(iso: string | null | undefined, tz?: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz || deviceTimeZone(), ...opts }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}
export function fmtDateTime(iso: string | null | undefined, tz?: string): string {
  return fmtDate(iso, tz, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function fmtTime(iso: string | null | undefined, tz?: string): string {
  return fmtDate(iso, tz, { hour: 'numeric', minute: '2-digit' });
}
export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(iso);
}
export function fmtDuration(min: number | null | undefined): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`;
}
export function tzShort(tz: string, iso?: string | null): string {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' });
    const part = f.formatToParts(iso ? new Date(iso) : new Date()).find((p) => p.type === 'timeZoneName');
    return part?.value || tz;
  } catch {
    return tz;
  }
}
export function ageFromDob(dob: string | null | undefined): string {
  if (!dob) return '';
  const b = new Date(dob);
  if (isNaN(b.getTime())) return '';
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  let months = now.getMonth() - b.getMonth();
  if (months < 0) { years--; months += 12; }
  return years > 0 ? `${years} yr${months ? ` ${months} mo` : ''}` : `${months} mo`;
}
