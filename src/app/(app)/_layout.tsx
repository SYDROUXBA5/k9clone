// Authenticated area: guard + shell (sidebar / top bar) around every screen.
import { Redirect, Slot, usePathname } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AUTO_LOGIN_EMAIL } from '@/config';
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
  // While sign-in is switched off, a cold deep link (someone opening /tracking straight from a shared
  // URL) arrives signed out. Bouncing it to /sign-in loses the destination and lands the visitor on
  // Records instead. Carry the path through the entry route so the auto-login returns them to it.
  if (status === 'signed_out') {
    if (AUTO_LOGIN_EMAIL) return <Redirect href={`/?next=${encodeURIComponent(pathname)}`} />;
    return <Redirect href="/sign-in" />;
  }
  if (status === 'layer') {
    if (!pathname.startsWith('/tracking')) return <Redirect href="/tracking" />;
    return <LayerShell><Slot /></LayerShell>;
  }
  return <Shell><PasscodeGate><Slot /></PasscodeGate></Shell>;
}
