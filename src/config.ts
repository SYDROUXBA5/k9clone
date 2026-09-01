// App-wide constants driven by environment. Never hard-code the app name elsewhere.
export const APP_NAME: string = process.env.EXPO_PUBLIC_APP_NAME || 'K9CLONE';
export const DATA_MODE: 'local' | 'supabase' =
  process.env.EXPO_PUBLIC_DATA_MODE === 'supabase' ? 'supabase' : 'local';
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
// Placeholder build hash — U9 replaces this with the git short sha baked at start (scripts/build-hash).
export const BUILD_HASH: string = process.env.EXPO_PUBLIC_BUILD_HASH || 'dev-local';
export const DEMO_PASSWORD = 'demo';
/**
 * Sign-in is switched OFF for now: opening the app authenticates as this demo account and lands on
 * the Records hub. Set EXPO_PUBLIC_AUTO_LOGIN to an empty string to put the sign-in screen back —
 * the screens themselves are untouched and still reachable at /sign-in when this is off.
 */
export const AUTO_LOGIN_EMAIL: string =
  process.env.EXPO_PUBLIC_AUTO_LOGIN !== undefined ? process.env.EXPO_PUBLIC_AUTO_LOGIN : 'mia@demo.k9';
