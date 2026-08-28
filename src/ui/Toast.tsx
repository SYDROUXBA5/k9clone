// Toast — save-state feedback ("Saved", "Save failed — retry"). Rendered once at the root.
import { Ionicons } from '@expo/vector-icons';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useColors, useIsDesktop } from './theme';
import { radius, space } from './tokens';

export type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; message: string; tone: ToastTone; action?: { title: string; onPress: () => void } }
interface ToastCtx { show: (message: string, tone?: ToastTone, action?: ToastItem['action']) => void }
const Ctx = createContext<ToastCtx>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const show = useCallback((message: string, tone: ToastTone = 'success', action?: ToastItem['action']) => {
    const id = ++seq.current;
    setItems((prev) => [...prev.slice(-2), { id, message, tone, action }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3000);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <ToastHost items={items} dismiss={(id) => setItems((prev) => prev.filter((t) => t.id !== id))} />
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}

function ToastHost({ items, dismiss }: { items: ToastItem[]; dismiss: (id: number) => void }) {
  const c = useColors();
  const desktop = useIsDesktop();
  if (!items.length) return null;
  return (
    <View style={[styles.host, { pointerEvents: 'box-none' }, desktop ? { right: space.lg, bottom: space.lg, alignItems: 'flex-end' } : { left: space.md, right: space.md, bottom: space.lg }]}>
      {items.map((t) => {
        const bg = t.tone === 'error' ? c.dangerSolid : t.tone === 'info' ? c.infoSolid : c.successSolid;
        return (
          <Pressable key={t.id} onPress={() => dismiss(t.id)} accessibilityRole="alert" accessibilityLiveRegion="polite" testID={`toast-${t.tone}`} style={[styles.toast, { backgroundColor: bg }]}>
            <Ionicons name={t.tone === 'error' ? 'alert-circle' : t.tone === 'info' ? 'information-circle' : 'checkmark-circle'} size={22} color="#fff" style={{ marginRight: space.sm }} />
            <Text style={{ color: '#fff', flexShrink: 1 }}>{t.message}</Text>
            {t.action ? (
              <Pressable onPress={t.action.onPress} accessibilityRole="button" style={{ marginLeft: space.md, minHeight: 32, justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700', textDecorationLine: 'underline' }}>{t.action.title}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', gap: space.sm, zIndex: 1000 },
  toast: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 12, borderRadius: radius.md, maxWidth: 480, minHeight: 48 },
});
