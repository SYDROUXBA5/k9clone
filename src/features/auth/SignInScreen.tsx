import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { APP_NAME } from '@/config';
import { Banner, Button, Card, H1, Muted, Sheet, Text, TextField, useColors, useIsDesktop, space } from '@/ui';
import { GlowBackdrop } from '@/ui/GlowBackdrop';
import { useAuth } from './AuthProvider';

export function AuthFrame({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  const c = useColors();
  const desktop = useIsDesktop();
  return (
    // The ground is the app's own background with the ambient glow behind it — the same surface every
    // signed-in screen sits on. It used to be `c.primary`, which worked only while the brand colour
    // was a dark teal: once that became a light cyan the whole page flooded, and the white brand text,
    // the white logo glyph and every cyan link on it disappeared into the background.
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <GlowBackdrop />
      <ScrollView contentContainerStyle={[styles.center, { padding: desktop ? space.xl : space.md }]} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 440 }}>
          <View style={styles.brand}>
            <View style={[styles.logo, { backgroundColor: c.accentSolid }]}>
              {/* accentText, not white: the tile is a light cyan and its ink has to be near-black. */}
              <Ionicons name="paw" size={28} color={c.accentText} />
            </View>
            <Text variant="h1" style={{ color: c.text, letterSpacing: 1 }} testID="text-app-name">{APP_NAME}</Text>
          </View>
          <Card style={{ padding: desktop ? space.lg : space.md }}>
            <H1 style={{ marginBottom: 4 }}>{title}</H1>
            {subtitle ? <Muted style={{ marginBottom: space.md }}>{subtitle}</Muted> : <View style={{ height: space.md }} />}
            {children}
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function SignInScreen() {
  const { signIn, skipLoginLayer } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ message: string; field?: 'email' | 'password' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [subInfo, setSubInfo] = useState(false);
  const c = useColors();

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await signIn(email, password);
    setBusy(false);
    if (!res.ok) { setError({ message: res.error, field: res.field }); return; }
    router.replace('/records');
  };

  return (
    <AuthFrame title="Sign in" subtitle="Handlers need a subscription · trainers, supervisors and billing managers are free">
      {error && !error.field ? <Banner tone="danger" body={error.message} testID="banner-signin-error" /> : null}
      <TextField
        label="Name or Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        autoComplete="email"
        placeholder="name@agency.gov"
        testID="input-email"
        error={error?.field === 'email' ? error.message : null}
        onSubmitEditing={submit}
        returnKeyType="next"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="password"
        placeholder="••••••"
        testID="input-password"
        error={error?.field === 'password' ? error.message : null}
        onSubmitEditing={submit}
        returnKeyType="go"
      />
      <Button title="Sign in" onPress={submit} loading={busy} testID="btn-sign-in" size="lg" fullWidth />
      <Text
        color="primary"
        accessibilityRole="button"
        accessibilityLabel="Subscription Required — more information"
        testID="link-subscription-required"
        align="center"
        style={[styles.link, { marginTop: space.sm }]}
        onPress={() => setSubInfo(true)}
      >
        Subscription Required
      </Text>
      <Sheet visible={subInfo} onClose={() => setSubInfo(false)} title="Subscription Required" testID="sheet-subscription-required" maxWidth={420}>
        <Text style={{ marginBottom: space.sm }}>This app requires a subscription to the {APP_NAME} service for the Handler role. Trainer, Supervisor and Billing Manager roles are free.</Text>
        <Muted style={{ marginBottom: space.sm }}>Handler seats are $14 / month or $140 / year after a 30-day free trial and cover all of your dogs.</Muted>
        <Button title="Get it on the App Store" variant="secondary" icon="logo-apple" testID="btn-store-ios" fullWidth onPress={() => setSubInfo(false)} accessibilityLabel="Get it on the App Store (placeholder link)" style={{ marginBottom: space.sm }} />
        <Button title="Get it on Google Play" variant="secondary" icon="logo-google-playstore" testID="btn-store-android" fullWidth onPress={() => setSubInfo(false)} accessibilityLabel="Get it on Google Play (placeholder link)" style={{ marginBottom: space.sm }} />
        <Muted>Store links are placeholders until the app is published.</Muted>
      </Sheet>
      <View style={{ height: space.md }} />
      <Button title="Sign in with Microsoft" variant="secondary" disabled icon="logo-microsoft" testID="btn-sign-in-microsoft" fullWidth accessibilityLabel="Sign in with Microsoft (coming later)" />
      <Muted align="center" style={{ marginTop: 4 }}>Microsoft sign-in arrives with the hosted backend.</Muted>
      <View style={[styles.links, { borderTopColor: c.border }]}>
        <Link href="/reset-password" asChild>
          <Text color="primary" accessibilityRole="link" testID="link-forgot-password" style={styles.link}>Forgot your password?</Text>
        </Link>
        <Link href="/sign-up" asChild>
          <Text color="primary" accessibilityRole="link" testID="link-sign-up" style={styles.link}>Sign up</Text>
        </Link>
        <Text
          color="primary"
          accessibilityRole="link"
          testID="link-skip-login"
          style={styles.link}
          onPress={async () => { await skipLoginLayer(); router.replace('/tracking'); }}
        >
          Skip login — track layers only
        </Text>
      </View>
      <Muted align="center" style={{ marginTop: space.md }}>Demo: mia@demo.k9 / demo (see docs/DEMO-LOGINS.md)</Muted>
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginBottom: space.lg },
  logo: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  links: { marginTop: space.lg, paddingTop: space.md, borderTopWidth: 1, gap: space.sm, alignItems: 'center' },
  link: { minHeight: 32, textDecorationLine: 'underline', paddingVertical: 4 },
});
