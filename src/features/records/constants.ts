// Records hub constants — every window is a named number so a supervisor can be told what "late" means.

/** TO DO card and supervisor banners look back this many days ("LAST 90 DAYS" / "Last 3 Months"). */
export const TODO_WINDOW_DAYS = 90;
/** Vaccinations due within this many days (or overdue) count in TO DO. */
export const VACCINE_DUE_WINDOW_DAYS = 90;
/** [OURS] Late Records banner: a managed handler with no completed training record in this many days is "late". */
export const LATE_RECORDS_HANDLER_DAYS = 30;
/** Live Tracks banner counts Track rows active within this many days (parity: 3-day track expiry). */
export const LIVE_TRACKS_DAYS = 3;
/** Supervisor banner window label + months back. */
export const SUPERVISOR_WINDOW_MONTHS = 3;

export const DAY_MS = 86400000;
