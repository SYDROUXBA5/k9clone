import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { KeyboardAvoidingView, Modal as RNModal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Button } from './Button';
import { H2, Text } from './Text';
import { useColors, useIsDesktop } from './theme';
import { radius, space } from './tokens';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  testID?: string;
  maxWidth?: number;
  scroll?: boolean;
}

/** Modal dialog: bottom sheet on phone, centred dialog on desktop. */
export function Sheet({ visible, onClose, title, children, footer, testID, maxWidth = 560, scroll = true }: SheetProps) {
  const c = useColors();
  const desktop = useIsDesktop();
  const { height } = useWindowDimensions();
  const body = scroll ? <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: height * 0.7 }} contentContainerStyle={{ padding: space.md }}>{children}</ScrollView> : <View style={{ padding: space.md }}>{children}</View>;
  return (
    <RNModal visible={visible} transparent animationType={desktop ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable accessibilityLabel="Close dialog" onPress={onClose} style={[styles.overlay, { backgroundColor: c.overlay, justifyContent: desktop ? 'center' : 'flex-end', alignItems: 'center' }]}>
          <Pressable testID={testID} accessibilityViewIsModal onPress={() => {}} style={[styles.card, { backgroundColor: c.surface, maxWidth: desktop ? maxWidth : undefined, width: '100%', borderRadius: desktop ? radius.lg : 0, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: height * 0.92 }]}>
            {title ? (
              <View style={[styles.header, { borderBottomColor: c.border }]}>
                <H2 style={{ flex: 1 }}>{title}</H2>
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" testID="btn-close-sheet" hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={26} color={c.text} />
                </Pressable>
              </View>
            ) : null}
            {body}
            {footer ? <View style={[styles.footer, { borderTopColor: c.border }]}>{footer}</View> : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

export function ConfirmDialog({ visible, title, body, confirmTitle = 'Delete', tone = 'danger', onConfirm, onCancel, testID = 'dialog-confirm' }: {
  visible: boolean; title: string; body?: string; confirmTitle?: string; tone?: 'danger' | 'primary'; onConfirm: () => void; onCancel: () => void; testID?: string;
}) {
  return (
    <Sheet visible={visible} onClose={onCancel} title={title} testID={testID} maxWidth={440}
      footer={(
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm }}>
          <Button title="Cancel" variant="secondary" onPress={onCancel} testID="btn-cancel-confirm" />
          <Button title={confirmTitle} variant={tone} onPress={onConfirm} testID="btn-confirm" />
        </View>
      )}
    >
      {body ? <Text>{body}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  card: { overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.md, paddingRight: space.xs, paddingVertical: space.sm, borderBottomWidth: 1 },
  footer: { padding: space.md, borderTopWidth: 1 },
});
