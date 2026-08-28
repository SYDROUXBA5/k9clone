// Notification delivery (local mode). One entry point — notify() — that every loop uses:
// respects the user's per-type preferences (system notifications always on unless the type is
// opt-in and not enabled; email per type, default on except opt-in types), writes the Notification
// row, and in local mode "sends" the email by logging `EMAIL → <address>` to the console and stamping
// email_sent on the row (docs/DECISIONS.md E6). Supabase mode will swap the email part for an Edge Function.
import type { Repository } from './repository';
import type { Notification, NotificationType, User, UUID } from './types';
import { deviceTimeZone, nowISO } from './util';
import { NOTIFICATION_PREF_GROUPS } from './vocab';

export interface NotifyInput {
  user_id: UUID;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  /** Force delivery even when the type is opt-in and not enabled (used for tests / system messages). */
  force?: boolean;
  /** Back-date (seed). */
  at?: string;
}

export const OPT_IN_TYPES: NotificationType[] = ['exercise_ready_for_supervisor_review', 'deployment_ready_for_supervisor_review', 'exercise_ready_for_comments'];

/** The pref group a type belongs to (Profile table row). */
export function prefGroupOf(type: NotificationType) {
  return NOTIFICATION_PREF_GROUPS.find((g) => (g.types as readonly string[]).includes(type)) || null;
}

/** Effective preference for a type: opt-in types default OFF, everything else ON; email follows the same default. */
export function effectivePref(user: Pick<User, 'notification_prefs'> | null | undefined, type: NotificationType): { in_app: boolean; email: boolean; mobile: boolean } {
  const optIn = OPT_IN_TYPES.includes(type);
  const group = prefGroupOf(type);
  // A pref may be stored under the concrete type or under the group key (the Profile toggles write the group key).
  const stored = user?.notification_prefs?.[type] || (group ? user?.notification_prefs?.[group.key as NotificationType] : undefined);
  const def = !optIn;
  return { in_app: stored?.in_app ?? def, email: stored?.email ?? def, mobile: stored?.mobile ?? def };
}

/** Deliver a notification (in-app row + local "email"). Returns the row, or null when the user opted out. */
export async function notify(repo: Repository, input: NotifyInput): Promise<Notification | null> {
  const user = repo.getSync('user', input.user_id);
  if (!user) return null;
  const pref = effectivePref(user, input.type);
  if (!pref.in_app && !input.force) return null;
  const at = input.at || nowISO();
  const emailSent = pref.email || !!input.force;
  const row = await repo.upsert('notification', {
    owner_user_id: user.id,
    user_id: user.id,
    type: input.type,
    title: input.title,
    body: input.body,
    read: false,
    link: input.link ?? null,
    tz: deviceTimeZone(),
    email_sent: emailSent,
    email_to: emailSent ? user.email : null,
    created_at: at,
  }, { silent: true, at, actor_id: 'system' });
  if (emailSent) {
    // Local mode has no mail transport: the console line IS the email (docs/DECISIONS.md E6).
    console.log(`EMAIL → ${user.name} <${user.email}> · ${input.title} — ${input.body}${input.link ? ` (${input.link})` : ''}`);
  }
  return row;
}

/** Fan-out helper: notify many users with the same message. */
export async function notifyAll(repo: Repository, userIds: UUID[], input: Omit<NotifyInput, 'user_id'>): Promise<number> {
  let n = 0;
  for (const id of new Set(userIds)) if (await notify(repo, { ...input, user_id: id })) n++;
  return n;
}
