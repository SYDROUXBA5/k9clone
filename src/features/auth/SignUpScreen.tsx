import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import type { Role } from '@/db/types';
import { ROLE_LABEL } from '@/db/types';
import { PRICE_ANNUAL_USD, PRICE_MONTHLY_USD, TRIAL_DAYS } from '@/db/vocab';
import { Banner, Button, Checkbox, FieldShell, Muted, Segmented, Text, TextField, space } from '@/ui';
import { AuthFrame } from './SignInScreen';
import { useAuth, type SignupPlan } from './AuthProvider';

const ROLES: Role[] = ['handler', 'supervisor', 'trainer', 'billing_manager'];

export function SignUpScreen() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', password: '', confirm: '', department: '' });
  const [roles, setRoles] = useState<Role[]>(['handler']);
  const [plan, setPlan] = useState<SignupPlan>('trial');
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const submitWith = async (chosen: SignupPlan) => {
    setError(null);
    if (f.password !== f.confirm) { setError({ message: 'Passwords do not match', field: 'confirm' }); return; }
    setBusy(true);
    const res = await signUp({ ...f, roles, signupPlan: chosen });
    setBusy(false);
    if (!res.ok) { setError({ message: res.error, field: res.field }); return; }
    router.replace('/records');
  };
  const submit = () => void submitWith(plan);
  const err = (k: string) => (error?.field === k ? error.message : null);
  return (
    <AuthFrame title="Sign up" subtitle="Handlers get a 30-day free trial. Supervisor, trainer and billing manager roles are free.">
      {error && !error.field ? <Banner tone="danger" body={error.message} /> : null}
      <TextField label="First Name" value={f.first_name} onChangeText={set('first_name')} required testID="input-first-name" error={err('first_name')} autoComplete="given-name" />
      <TextField label="Last Name" value={f.last_name} onChangeText={set('last_name')} required testID="input-last-name" error={err('last_name')} autoComplete="family-name" />
      <TextField label="Email" value={f.email} onChangeText={set('email')} required testID="input-email" error={err('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <TextField label="Password" value={f.password} onChangeText={set('password')} required secureTextEntry testID="input-password" error={err('password')} help="8–20 characters with upper case, lower case and a number (local demo mode does not enforce this)." />
      <TextField label="Confirm Password" value={f.confirm} onChangeText={set('confirm')} required secureTextEntry testID="input-confirm-password" error={err('confirm')} />
      <TextField label="Department" value={f.department} onChangeText={set('department')} required testID="input-department" error={err('department')} help="Free text — e.g. Ashcombe PD. Groups and sharing cross department lines." />
      <FieldShell label="Roles" required error={err('roles')}>
        {ROLES.map((r) => (
          <Checkbox key={r} label={ROLE_LABEL[r]} value={roles.includes(r)} testID={`check-role-${r}`} onChange={(v) => setRoles((p) => (v ? [...p, r] : p.filter((x) => x !== r)))} />
        ))}
      </FieldShell>
      {roles.includes('handler') ? (
        <FieldShell
          label="Subscription"
          required
          help="Only handlers pay. You can change or cancel this at any time on Billing — nothing is charged in v1."
        >
          <Segmented
            label="Subscription"
            options={[
              { value: 'trial', label: `${TRIAL_DAYS} day free trial` },
              { value: 'monthly', label: `Monthly · $${PRICE_MONTHLY_USD}` },
              { value: 'annual', label: `Yearly · $${PRICE_ANNUAL_USD}` },
            ]}
            value={plan === 'none' ? 'trial' : plan}
            onChange={(v) => setPlan(v as SignupPlan)}
            testID="segmented-signup-plan"
          />
          <Muted style={{ marginTop: space.xs }}>
            {plan === 'annual'
              ? `Billed once a year — $${PRICE_MONTHLY_USD * 12 - PRICE_ANNUAL_USD} less than paying monthly.`
              : plan === 'monthly'
                ? 'Billed every month. Cancel any time — no contract.'
                : plan === 'none'
                  ? 'No subscription: you can read, search and report on records, but not create or edit them.'
                  : `Free for ${TRIAL_DAYS} days, then records become read-only until you pick a plan. Nothing is ever deleted.`}
          </Muted>
        </FieldShell>
      ) : null}
      <Button
        title={plan === 'none' ? 'Create read-only account' : plan === 'trial' ? `Continue with a ${TRIAL_DAYS} day free trial` : plan === 'monthly' ? `Continue with Monthly — $${PRICE_MONTHLY_USD}` : `Continue with Yearly — $${PRICE_ANNUAL_USD}`}
        onPress={submit}
        loading={busy}
        testID="btn-sign-up"
        size="lg"
        fullWidth
      />
      {roles.includes('handler') ? (
        <Button
          title="Continue Without a Subscription (Read Only)"
          variant="secondary"
          onPress={() => { setPlan('none'); void submitWith('none'); }}
          loading={busy}
          testID="btn-sign-up-read-only"
          fullWidth
          style={{ marginTop: space.sm }}
        />
      ) : null}
      <View style={{ height: space.md }} />
      <Link href="/sign-in" asChild>
        <Text color="primary" accessibilityRole="link" align="center" testID="link-back-sign-in" style={{ textDecorationLine: 'underline', paddingVertical: 8 }}>Back to sign in</Text>
      </Link>
      <Muted align="center" style={{ marginTop: space.sm }}>Local demo mode: the account lives on this device only.</Muted>
    </AuthFrame>
  );
}
