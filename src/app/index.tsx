import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { useColors } from '@/ui';

export default function Index() {
  const { status } = useAuth();
  const c = useColors();
  if (status === 'loading') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary }}><ActivityIndicator color="#fff" /></View>;
  if (status === 'signed_in') return <Redirect href="/records" />;
  if (status === 'layer') return <Redirect href="/tracking" />;
  return <Redirect href="/sign-in" />;
}
