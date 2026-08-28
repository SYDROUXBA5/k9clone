// Root layout — providers (theme, repository, prefs, auth, toast) + a headerless Stack.
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { APP_NAME } from '@/config';
import { RepoProvider, useRepo } from '@/db/provider';
import { seedDemo } from '@/db/seed';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { PrefsProvider, usePrefs } from '@/features/prefs/PrefsProvider';
import { BottomInsetProvider, FieldHelpProvider, ThemeProvider, ToastProvider, useColors } from '@/ui';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <ThemedRoot />
      </PrefsProvider>
    </SafeAreaProvider>
  );
}

function ThemedRoot() {
  const { prefs, update } = usePrefs();
  return (
    <ThemeProvider preference={prefs.themePref} onPreferenceChange={(p) => update({ themePref: p, scheme: p === 'dark' ? 'dark' : 'light' })}>
      <ToastProvider>
        <FieldHelpProvider>
        <BottomInsetProvider>
        <RepoProvider>
          <SeedGate>
            <AuthProvider>
              <Stack screenOptions={{ headerShown: false, title: APP_NAME }} />
            </AuthProvider>
          </SeedGate>
        </RepoProvider>
        </BottomInsetProvider>
        </FieldHelpProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

/** First run: seed the demo department when the store is empty. */
function SeedGate({ children }: { children: React.ReactNode }) {
  const repo = useRepo();
  const c = useColors();
  const [ready, setReady] = useState(() => repo.snapshot('user').length > 0);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (repo.snapshot('user').length === 0) await seedDemo(repo, 40);
      if (alive) setReady(true);
      SplashScreen.hideAsync().catch(() => {});
    })();
    return () => { alive = false; };
  }, [repo]);
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }
  return <>{children}</>;
}
