import { Redirect } from 'expo-router';
import React from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { SignInScreen } from '@/features/auth/SignInScreen';

export default function SignInRoute() {
  const { status } = useAuth();
  if (status === 'signed_in') return <Redirect href="/records" />;
  return <SignInScreen />;
}
