import { Redirect } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AUTO_LOGIN_EMAIL, DEMO_PASSWORD } from '@/config';
import { useAuth } from '@/features/auth/AuthProvider';
import { useColors } from '@/ui';

export default function Index() {
  const { status, signIn } = useAuth();
  const c = useColors();
  const attempted = useRef(false);
  const [autoLoginFailed, setAutoLoginFailed] = useState(false);

  // Sign-in is switched off for now (config.AUTO_LOGIN_EMAIL): opening the app authenticates as the
  // demo handler and lands on the Records hub.
  //
  // This also releases a stuck "track layer" session. Choosing "Skip login — track layers only" sets
  // a session that persists in the browser, and every route then redirects to /track-layer — INCLUDING
  // /records — so there is no way back into the app except the Sign in button in that screen's own top
  // bar. Signing in replaces that session, so the trap cannot outlive a reload any more.
  useEffect(() => {
    if (!AUTO_LOGIN_EMAIL || attempted.current) return;
    if (status !== 'signed_out' && status !== 'layer') return;
    attempted.current = true;
    void (async () => {
      const res = await signIn(AUTO_LOGIN_EMAIL, DEMO_PASSWORD);
      // Never spin forever: if the demo account is missing (an emptied store, a custom seed), fall
      // through to the real sign-in screen rather than showing a spinner with no way out.
      if (!res.ok) setAutoLoginFailed(true);
    })();
  }, [status, signIn]);

  if (status === 'signed_in') return <Redirect href="/records" />;

  const autoLoginActive = !!AUTO_LOGIN_EMAIL && !autoLoginFailed;
  if (!autoLoginActive) {
    if (status === 'layer') return <Redirect href="/tracking" />;
    if (status === 'signed_out') return <Redirect href="/sign-in" />;
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }} testID="screen-boot">
      <ActivityIndicator color={c.primary} />
    </View>
  );
}
