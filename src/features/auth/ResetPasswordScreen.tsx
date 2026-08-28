import { Link } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Text, TextField, space } from '@/ui';
import { AuthFrame } from './SignInScreen';
import { useAuth } from './AuthProvider';

export function ResetPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setResult(await requestPasswordReset(email));
    setBusy(false);
  };
  return (
    <AuthFrame title="Reset password" subtitle="Enter the email on your account and we will send a reset link.">
      {result ? <Banner tone={result.ok ? 'success' : 'danger'} body={result.message} testID="banner-reset-result" /> : null}
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" testID="input-email" onSubmitEditing={submit} />
      <Button title="Send reset link" onPress={submit} loading={busy} testID="btn-send-reset" size="lg" fullWidth />
      <View style={{ height: space.md }} />
      <Link href="/sign-in" asChild>
        <Text color="primary" accessibilityRole="link" align="center" testID="link-back-sign-in" style={{ textDecorationLine: 'underline', paddingVertical: 8 }}>Back to sign in</Text>
      </Link>
    </AuthFrame>
  );
}
