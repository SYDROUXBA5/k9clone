// "Skip login — track layers only": a no-account session that can only reach the track layer.
//
// This file used to also export TrackingStubScreen, a placeholder that told the reader GPS tracking
// "arrives in unit U8". U8 shipped: /track-layer renders the real TrackLayerScreen inside this shell,
// and /tracking routes to the real mode picker or the supervisor map. Nothing imported the stub any
// more, so it has been deleted rather than left to be greped as if it described the product.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME } from '@/config';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button, Text, useColors, space } from '@/ui';

export function LayerShell({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { backgroundColor: c.navBg, paddingTop: insets.top }]} testID="topbar-layer">
        <Ionicons name="paw" size={22} color="#fff" style={{ marginRight: space.sm }} />
        <Text variant="h3" style={{ color: '#fff', flex: 1 }}>{APP_NAME} · Track layer</Text>
        <Button title="Sign in" variant="ghost" textColor={c.navText} onPress={async () => { await signOut(); router.replace('/sign-in'); }} testID="btn-layer-sign-in" style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' }} accessibilityLabel="Sign in with an account" />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 56, paddingBottom: 4 },
});
