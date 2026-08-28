// Supplemental Files: Document rows owned by the record (owner_type + owner_id). Picking uses
// expo-document-picker (web file dialog / native pickers). Files are stored as Documents right away
// (owner_id = the record id, known before the first save) so History gets an add row per file.
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { Document } from '@/db/types';
import { Button, ConfirmDialog, Muted, Row, Text, useColors, useToast, radius, space } from '@/ui';

const kindOf = (mime?: string | null): Document['kind'] => (mime?.startsWith('image/') ? 'photo' : mime?.startsWith('video/') ? 'video' : 'file');
const fmtSize = (n?: number) => (n == null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function AttachmentsField({ ownerType, ownerId, ownerUserId, disabled, files, onFilesChange, testID = 'attachments', label = 'Supplemental Files' }: {
  ownerType: Document['owner_type']; ownerId: string; ownerUserId: string; disabled?: boolean; files: string[]; onFilesChange: (ids: string[]) => void; testID?: string; label?: string;
}) {
  const c = useColors();
  const repo = useRepo();
  const toast = useToast();
  const docs = useList('document', (d) => d.owner_type === ownerType && d.owner_id === ownerId);
  const [busy, setBusy] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      const ids: string[] = [];
      for (const a of res.assets) {
        const doc = await repo.upsert('document', { owner_type: ownerType, owner_id: ownerId, owner_user_id: ownerUserId, category: 'Supplemental Files', kind: kindOf(a.mimeType), name: a.name, uri: a.uri, mime: a.mimeType || undefined, size_bytes: a.size ?? undefined }, { label: `File: ${a.name}` });
        ids.push(doc.id);
      }
      onFilesChange([...files, ...ids]);
      toast.show(ids.length === 1 ? 'File attached' : `${ids.length} files attached`);
    } catch (err) {
      toast.show(`Could not attach file — ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!removeId) return;
    const d = docs.find((x) => x.id === removeId);
    await repo.remove('document', removeId, { label: d ? `File: ${d.name}` : 'File' });
    onFilesChange(files.filter((id) => id !== removeId));
    setRemoveId(null);
    toast.show('File removed — logged to History');
  };
  return (
    <View testID={testID}>
      <Row justify={label ? 'space-between' : 'flex-end'} style={{ marginBottom: space.sm }}>
        {label ? <Text variant="label">{label}</Text> : null}
        {!disabled ? <Button title={busy ? 'Opening…' : 'Add files'} variant="secondary" icon="attach-outline" onPress={() => void add()} loading={busy} testID={`btn-${testID}-add`} /> : null}
      </Row>
      {docs.length === 0 ? (
        <View style={[styles.drop, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="cloud-upload-outline" size={26} color={c.muted} />
          <Muted style={{ marginTop: 4 }}>{disabled ? 'No files attached.' : 'Photos, videos, PDFs or any other file type may be stored with this record.'}</Muted>
        </View>
      ) : (
        <View style={styles.tiles}>
          {docs.map((d) => (
            <View key={d.id} style={[styles.tile, { borderColor: c.border, backgroundColor: c.surface }]} testID={`file-${d.id}`}>
              <Ionicons name={d.kind === 'photo' ? 'image-outline' : d.kind === 'video' ? 'videocam-outline' : 'document-outline'} size={26} color={c.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1}>{d.name}</Text>
                <Muted numberOfLines={1}>{[d.mime, fmtSize(d.size_bytes)].filter(Boolean).join(' · ')}</Muted>
              </View>
              {!disabled ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove file ${d.name}`} testID={`btn-remove-file-${d.id}`} onPress={() => setRemoveId(d.id)} hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="trash-outline" size={22} color={c.danger} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}
      <ConfirmDialog visible={!!removeId} title="Remove this file?" body="The file is detached from the record and the removal is logged to History." confirmTitle="Remove" onCancel={() => setRemoveId(null)} onConfirm={() => void remove()} testID="dialog-remove-file" />
    </View>
  );
}

const styles = StyleSheet.create({
  drop: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.md, padding: space.lg, alignItems: 'center' },
  tiles: { gap: space.sm },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderRadius: radius.md, padding: space.sm, paddingLeft: space.md },
});
