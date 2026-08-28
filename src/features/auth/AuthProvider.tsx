// Local-mode auth: sign in against the seeded users (password "demo"), session persisted per device,
// role switcher with last role remembered per device, "track layers only" session without an account.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useRepo } from '@/db/provider';
import { kv } from '@/db/storage';
import type { Role, Seat, User } from '@/db/types';
import { nowISO } from '@/db/util';
import { TRIAL_DAYS } from '@/db/vocab';
import { usePrefs } from '@/features/prefs/PrefsProvider';

const SESSION_KEY = 'k9clone:session:v1';
type SessionRecord = { kind: 'user'; userId: string } | { kind: 'layer' };

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in' | 'layer';
/** `signupPlan` (U7 / PT-BIL-02): what a new handler starts on. 'none' is the read-only-from-day-one
 *  account — it exists so a department can keep old records without paying, and it is the only way to
 *  reach the read-only state without first burning a trial. */
export type SignupPlan = 'trial' | 'monthly' | 'annual' | 'none';
export interface SignUpInput { first_name: string; last_name: string; email: string; password: string; department: string; roles: Role[]; signupPlan?: SignupPlan }

interface AuthCtx {
  status: AuthStatus;
  user: User | null;
  role: Role | null;
  roles: Role[];
  seat: Seat | null;
  seatExpired: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string; field?: 'email' | 'password' }>;
  signUp: (input: SignUpInput) => Promise<{ ok: true } | { ok: false; error: string; field?: string }>;
  signOut: () => Promise<void>;
  setRole: (role: Role) => void;
  skipLoginLayer: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; message: string }>;
}
const Ctx = createContext<AuthCtx | null>(null);

const ROLE_ORDER: Role[] = ['handler', 'trainer', 'supervisor', 'billing_manager'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const repo = useRepo();
  const { prefs, update } = usePrefs();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRoleState] = useState<Role | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => repo.subscribe('user', () => setTick((t) => t + 1)), [repo]);
  void tick;
  const user = userId ? repo.getSync('user', userId) ?? null : null;
  const roles = useMemo(() => (user ? ROLE_ORDER.filter((r) => user.roles.includes(r)) : []), [user]);

  // restore session
  useEffect(() => {
    let alive = true;
    (async () => {
      const raw = await kv().get(SESSION_KEY);
      if (!alive) return;
      if (raw) {
        try {
          const s = JSON.parse(raw) as SessionRecord;
          if (s.kind === 'layer') { setStatus('layer'); return; }
          const u = repo.getSync('user', s.userId);
          if (u) {
            repo.setActor(u.id);
            setUserId(u.id);
            const remembered = prefs.lastRoleByUser[u.id];
            setRoleState(remembered && u.roles.includes(remembered) ? remembered : pickDefaultRole(u.roles));
            setStatus('signed_in');
            return;
          }
        } catch { /* fall through */ }
      }
      setStatus('signed_out');
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  const persist = (s: SessionRecord | null) => (s ? kv().set(SESSION_KEY, JSON.stringify(s)) : kv().remove(SESSION_KEY));

  // "Name or Email": matches the email, the full name, or "First Last" / "first.last" spellings.
  const signIn = useCallback<AuthCtx['signIn']>(async (email, password) => {
    const e = email.trim().toLowerCase();
    if (!e) return { ok: false, error: 'Enter your name or email address.', field: 'email' };
    if (!password) return { ok: false, error: 'Enter your password.', field: 'password' };
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9@]+/g, ' ').trim();
    const q = norm(e);
    const users = await repo.list('user', (u) => u.email.toLowerCase() === e || norm(u.name) === q || norm(`${u.first_name} ${u.last_name}`) === q);
    const u = users[0];
    if (!u) return { ok: false, error: 'No account with that name or email. Demo logins are in docs/DEMO-LOGINS.md.', field: 'email' };
    if ((u.password || 'demo') !== password) return { ok: false, error: 'Wrong password. The demo password is "demo".', field: 'password' };
    repo.setActor(u.id);
    const remembered = prefs.lastRoleByUser[u.id];
    const r = remembered && u.roles.includes(remembered) ? remembered : pickDefaultRole(u.roles);
    setUserId(u.id);
    setRoleState(r);
    setStatus('signed_in');
    await persist({ kind: 'user', userId: u.id });
    void repo.upsert('user', { id: u.id, ...(Platform.OS === 'web' ? { last_web_login_at: nowISO() } : { last_app_login_at: nowISO() }) }, { silent: true });
    return { ok: true };
  }, [repo, prefs.lastRoleByUser]);

  const signUp = useCallback<AuthCtx['signUp']>(async (input) => {
    const email = input.email.trim().toLowerCase();
    if (!input.first_name.trim()) return { ok: false, error: 'First name is required.', field: 'first_name' };
    if (!input.last_name.trim()) return { ok: false, error: 'Last name is required.', field: 'last_name' };
    if (!email) return { ok: false, error: 'Email is required.', field: 'email' };
    if (!input.password) return { ok: false, error: 'Password is required.', field: 'password' };
    if (!input.department.trim()) return { ok: false, error: 'Please enter a department name', field: 'department' };
    if (!input.roles.length) return { ok: false, error: 'Pick at least one role.', field: 'roles' };
    const dup = await repo.list('user', (u) => u.email.toLowerCase() === email);
    if (dup.length) return { ok: false, error: 'An account with that email already exists.', field: 'email' };
    const now = nowISO();
    const u = await repo.upsert('user', {
      email, first_name: input.first_name.trim(), last_name: input.last_name.trim(),
      name: `${input.first_name.trim()} ${input.last_name.trim()}`, agency_id: null,
      department: input.department.trim(), roles: input.roles, password: input.password,
      demographics_in_reports: true, dark_mode: false,
    }, { silent: true, actor_id: 'system' });
    await repo.upsert('user', { id: u.id, owner_user_id: u.id }, { silent: true, actor_id: u.id });
    for (const r of input.roles) await repo.upsert('role_assignment', { owner_user_id: u.id, user_id: u.id, role: r, granted_at: now }, { silent: true, actor_id: u.id });
    const plan = input.signupPlan ?? 'trial';
    if (input.roles.includes('handler') && plan !== 'none') {
      const start = new Date();
      const ends = plan === 'trial'
        ? new Date(start.getTime() + TRIAL_DAYS * 86400000).toISOString()
        : plan === 'monthly'
          ? new Date(new Date(start).setMonth(start.getMonth() + 1)).toISOString()
          : new Date(new Date(start).setFullYear(start.getFullYear() + 1)).toISOString();
      await repo.upsert('seat', { owner_user_id: u.id, user_id: u.id, plan, starts: now, ends, paid_by: null, status: 'active' }, { silent: true, actor_id: u.id });
    }
    // plan === 'none' deliberately writes no seat row: describeSeat() reports 'No subscription', the
    // gate makes every form read-only, and Billing offers the two plans.
    return signIn(email, input.password);
  }, [repo, signIn]);

  const signOut = useCallback(async () => {
    repo.setActor(null);
    setUserId(null);
    setRoleState(null);
    setStatus('signed_out');
    await persist(null);
  }, [repo]);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    if (userId) update((p) => ({ ...p, lastRoleByUser: { ...p.lastRoleByUser, [userId]: r } }));
  }, [userId, update]);

  const skipLoginLayer = useCallback(async () => {
    repo.setActor(null);
    setUserId(null);
    setRoleState(null);
    setStatus('layer');
    await persist({ kind: 'layer' });
  }, [repo]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const e = email.trim().toLowerCase();
    if (!e) return { ok: false, message: 'Enter your email address.' };
    // Local mode has no email delivery; behave like the real thing (never reveal whether the account exists).
    return { ok: true, message: 'If an account exists for that email, a reset link has been sent. (Local mode: password stays "demo".)' };
  }, []);

  const seat = useMemo(() => {
    if (!user) return null;
    const seats = repo.snapshot('seat').filter((s) => s.user_id === user.id).sort((a, b) => (a.ends < b.ends ? 1 : -1));
    return seats[0] || null;
  }, [user, repo, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const seatExpired = !!(user && user.roles.includes('handler') && (!seat || seat.status !== 'active' || new Date(seat.ends).getTime() < Date.now()));

  const value = useMemo<AuthCtx>(() => ({ status, user, role, roles, seat, seatExpired, signIn, signUp, signOut, setRole, skipLoginLayer, requestPasswordReset }), [status, user, role, roles, seat, seatExpired, signIn, signUp, signOut, setRole, skipLoginLayer, requestPasswordReset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function pickDefaultRole(roles: Role[]): Role {
  return ROLE_ORDER.find((r) => roles.includes(r)) || 'handler';
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}

/** Ids whose data the current role may see: self, plus managed handlers for supervisors/trainers. */
export function useVisibleUserIds(): string[] {
  const { user, role } = useAuth();
  const repo = useRepo();
  const [tick, setTick] = useState(0);
  useEffect(() => repo.subscribe('management_group', () => setTick((t) => t + 1)), [repo]);
  void tick;
  return useMemo(() => {
    if (!user) return [];
    const ids = new Set<string>([user.id]);
    if (role === 'supervisor' || role === 'trainer') {
      for (const g of repo.snapshot('management_group')) {
        if (g.manager_id === user.id && g.type === role) g.members.forEach((m) => ids.add(m));
      }
    }
    return [...ids];
  }, [user, role, repo, tick]); // eslint-disable-line react-hooks/exhaustive-deps
}
