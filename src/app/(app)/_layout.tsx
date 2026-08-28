// Authenticated area: guard + shell (sidebar / top bar) around every screen.
import { Redirect, Slot, usePathname } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { Shell } from '@/features/nav/Shell';
import { LayerShell } from '@/features/nav/LayerShell';
import { PasscodeGate } from '@/features/profile/Passcode';
import { useColors } from '@/ui';

export default function AppLayout() {
  const { status } = useAuth();
  const pathname = usePathname();
  const c = useColors();
  if (status === 'loading') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.primary} /></View>;
  if (status === 'signed_out') return <Redirect href="/sign-in" />;
  if (status === 'layer') {
    if (!pathname.startsWith('/tracking')) return <Redirect href="/tracking" />;
    return <LayerShell><Slot /></LayerShell>;
  }
  return <Shell><PasscodeGate><Slot /></PasscodeGate></Shell>;
}
