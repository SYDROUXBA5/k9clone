import { Redirect } from 'expo-router';
import React from 'react';
import { AUTO_LOGIN_EMAIL } from '@/config';
import { useAuth } from '@/features/auth/AuthProvider';
import { SignInScreen } from '@/features/auth/SignInScreen';

export default function SignInRoute() {
  const { status } = useAuth();
  if (status === 'signed_in') return <Redirect href="/records" />;
  // Sign-in is switched off for now: send anyone who lands here back to the entry route, which signs
  // in as the demo handler. The screen below is untouched and returns the moment AUTO_LOGIN_EMAIL is
  // cleared — this is a redirect, not a deletion.
  if (AUTO_LOGIN_EMAIL) return <Redirect href="/" />;
  return <SignInScreen />;
}
