// Passcode login (bar §2.16 row 5 / PT-PRO-04) — mobile only, so on the web it appears when
// "Simulate phone" is on. Two pieces:
//   • <PasscodeSection/> — the Profile control: enable, set / change the 4-digit code, turn it off.
//   • <PasscodeGate/> — wraps the app and asks for the code once per launch.
// The code is a convenience lock on this device, not a second factor: it is stored with the account
// and the screen says so, so nobody mistakes it for encryption.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRepo } from '@/db/provider';
import { useAuth } from '@/features/auth/AuthProvider';
import { useIsPhoneMode } from '@/features/nav/Shell';
import { Banner, Button, Card, H2, Muted, Row, Screen, Switch, Text, TextField, useToast, space } from '@/ui';

const FOUR_DIGITS = /^\d{4}$/;

// "Once per app launch" = module state, not storage: a page reload (or a fresh app start) clears it,
// while navigating around inside the running app does not.
let sessionUnlocked = false;
const listeners = new Set<() => void>();
export function markPasscodeUnlocked(v = true) {
  sessionUnlocked = v;
  listeners.forEach((l) => l());
}
function usePasscodeUnlocked(): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return sessionUnlocked;
}

export function PasscodeSection({ testID = 'section-passcode' }: { testID?: string }) {
  const { user } = useAuth();
  const repo = useRepo();
  const toast = useToast();
  const phoneMode = useIsPhoneMode();
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const enabled = !!user?.passcode;

  const save = async () => {
    if (!FOUR_DIGITS.test(code)) { setError('The passcode must be exactly 4 digits.'); return; }
    if (code !== confirm) { setError('The two codes do not match.'); return; }
    if (!user) return;
    await repo.upsert('user', { id: user.id, passcode: code }, { silent: true });
    markPasscodeUnlocked(true);
    setCode(''); setConfirm(''); setError(null);
    toast.show('Passcode saved — the app will ask for it next time it opens.');
  };
  const disable = async () => {
    if (!user) return;
    await repo.upsert('user', { id: user.id, passcode: null }, { silent: true });
    markPasscodeUnlocked(true);
    toast.show('Passcode login turned off.');
  };

  return (
    <View testID={testID}>
      <Switch
        label="Enable Passcode Login"
        help="Replaces email and password with a 4-digit code when the app opens on this phone."
        value={enabled}
        onChange={(v) => { if (!v) void disable(); }}
        testID="switch-enable-passcode"
      />
      {!phoneMode ? (
        <Banner
          tone="info"
          testID="banner-passcode-mobile-only"
          style={{ marginTop: space.sm }}
          body="Passcode login is a phone feature. Turn on Simulate phone in the Developer section below to set and test it here in the browser."
        />
      ) : null}
      <View style={{ marginTop: space.sm }}>
        <TextField
          label={enabled ? 'New 4-digit passcode' : '4-digit passcode'}
          value={code}
          onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 4)); setError(null); }}
          keyboardType="number-pad"
          inputMode="numeric"
          secureTextEntry
          maxLength={4}
          testID="input-passcode"
          placeholder="0000"
          help="Four digits, asked for each time the app comes back to the foreground on this phone. It is a shortcut past the sign-in screen, not a second password — your account password still works."
        />
        <TextField
          label="Confirm passcode"
          help="Type the same four digits again — a passcode you cannot repeat is a passcode you will be locked out by."
          value={confirm}
          onChangeText={(v) => { setConfirm(v.replace(/\D/g, '').slice(0, 4)); setError(null); }}
          keyboardType="number-pad"
          inputMode="numeric"
          secureTextEntry
          maxLength={4}
          testID="input-passcode-confirm"
          error={error}
          placeholder="0000"
        />
        <Row wrap>
          <Button title={enabled ? 'Change passcode' : 'Set passcode'} onPress={() => void save()} testID="btn-save-passcode" />
          {enabled ? <Button title="Turn off" variant="secondary" onPress={() => void disable()} testID="btn-disable-passcode" /> : null}
        </Row>
      </View>
      <Muted style={{ marginTop: space.sm }}>
        The code unlocks this device only and is not a replacement for your password — you can always sign in with email and password instead.
      </Muted>
    </View>
  );
}

/**
 * Asks for the passcode once per app launch. The unlock lives in module state, so a reload asks
 * again while moving between screens inside the running app does not.
 */
export function PasscodeGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const phoneMode = useIsPhoneMode();
  const unlocked = usePasscodeUnlocked();
  const [entry, setEntry] = useState('');
  const [error, setError] = useState<string | null>(null);

  const needed = !!user?.passcode && phoneMode && !unlocked;
  if (!needed) return <>{children}</>;

  const submit = () => {
    if (entry === user!.passcode) { markPasscodeUnlocked(true); setEntry(''); setError(null); return; }
    setError('Unknown passcode. Please login with your username and password.');
  };

  return (
    <Screen testID="screen-passcode-gate">
      <Card style={{ maxWidth: 420, alignSelf: 'center', marginTop: space.xl }}>
        <H2 accessibilityRole="header">Enter Passcode</H2>
        <Muted style={{ marginTop: space.xs, marginBottom: space.md }}>Signed in as {user?.name}. Enter your 4-digit code to continue.</Muted>
        <TextField
          label="Passcode"
          help="The four digits you set in Profile. Forgotten it? Sign out and sign in with your password to set a new one."
          value={entry}
          onChangeText={(v) => { setEntry(v.replace(/\D/g, '').slice(0, 4)); setError(null); }}
          keyboardType="number-pad"
          inputMode="numeric"
          secureTextEntry
          maxLength={4}
          autoFocus
          onSubmitEditing={submit}
          testID="input-passcode-entry"
          error={error}
          placeholder="0000"
        />
        <Button title="Unlock" onPress={submit} testID="btn-passcode-unlock" fullWidth />
        <Button
          title="Login with Email Instead"
          variant="ghost"
          onPress={() => { markPasscodeUnlocked(false); void signOut(); }}
          testID="btn-passcode-signout"
          style={{ marginTop: space.sm }}
          fullWidth
        />
        <Text color="muted" style={{ marginTop: space.sm }}>The code was set on this account in Profile → Passcode.</Text>
      </Card>
    </Screen>
  );
}
