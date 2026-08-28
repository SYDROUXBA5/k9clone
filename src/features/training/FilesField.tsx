// Supplemental Files — web: <input type=file> (multiple); native: a clearly labelled stub until the
// document/image pickers are added. Files become Document rows (small files keep a data: URI so they
// reopen; larger ones keep name/size only in local mode).
import { Ionicons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { Document } from '@/db/types';
import { Button, FieldShell, Muted, Row, Text, space, useColors, useToast, radius } from '@/ui';
import { WebFileInput } from './WebFileInput';

const INLINE_LIMIT = 1_500_000; // bytes kept as data: URI in the local store

export function FilesField({ ownerType, ownerId, ids, onChange, readOnly, label = 'Supplemental Files', help, testID = 'files' }: {
  ownerType: Document['owner_type']; ownerId: string | null; ids: string[]; onChange: (ids: string[]) => void; readOnly?: boolean; label?: string; help?: string; testID?: string;
}) {
  const c = useColors();
  const repo = useRepo();
  const toast = useToast();
  const docs = useList('document', (d) => ids.includes(d.id));
  const inputRef = useRef<{ click: () => void } | null>(null);

  const addFiles = async (files: FileList | File[]) => {
    const added: string[] = [];
    for (const f of Array.from(files)) {
      let uri = '';
      if (f.size <= INLINE_LIMIT) {
        uri = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = () => resolve(''); r.readAsDataURL(f); });
      }
      const kind: Document['kind'] = f.type.startsWith('image/') ? 'photo' : f.type.startsWith('video/') ? 'video' : 'file';
      const doc = await repo.upsert('document', { owner_type: ownerType, owner_id: ownerId || 'pending', category: 'Supplemental', kind, name: f.name, uri, mime: f.type, size_bytes: f.size }, { label: f.name });
      added.push(doc.id);
    }
    if (added.length) { onChange([...ids, ...added]); toast.show(`${added.length} file${added.length > 1 ? 's' : ''} attached`); }
  };
  const remove = async (id: string) => {
    onChange(ids.filter((x) => x !== id));
    await repo.remove('document', id);
  };

  return (
    <FieldShell label={label} help={help} testID={testID}>
      {docs.length ? (
        <View style={{ marginBottom: space.sm, gap: 6 }}>
          {docs.map((d) => (
            <Row key={d.id} style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: space.sm, backgroundColor: c.surface }}>
              <Ionicons name={d.kind === 'photo' ? 'image-outline' : d.kind === 'video' ? 'videocam-outline' : 'document-outline'} size={22} color={c.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1}>{d.name}</Text>
                <Muted>{d.size_bytes ? `${Math.max(1, Math.round(d.size_bytes / 1024))} KB` : ''}{d.uri ? '' : ' · stored as reference only'}</Muted>
              </View>
              {!readOnly ? <Button title="Remove" variant="ghost" onPress={() => void remove(d.id)} testID={`${testID}-remove-${d.id}`} accessibilityLabel={`Remove ${d.name}`} /> : null}
            </Row>
          ))}
        </View>
      ) : null}
      {readOnly ? (docs.length ? null : <Muted>No files.</Muted>) : Platform.OS === 'web' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Drop files here or click to select"
          testID={`${testID}-dropzone`}
          onPress={() => inputRef.current?.click()}
          style={({ hovered }: { hovered?: boolean }) => [{ borderWidth: 1, borderStyle: 'dashed', borderColor: hovered ? c.primary : c.borderStrong, borderRadius: radius.md, padding: space.md, alignItems: 'center', backgroundColor: c.surface, minHeight: 64, justifyContent: 'center' }]}
        >
          <Row gap={6}><Ionicons name="cloud-upload-outline" size={22} color={c.primary} /><Text color="primary">Drop Files Here or Click To Select</Text></Row>
        </Pressable>
      ) : (
        <Button title="Attach file (camera / documents — coming to the mobile build)" variant="secondary" icon="attach-outline" onPress={() => toast.show('File picking on the phone arrives with the native picker; use the browser to attach files for now.', 'info')} testID={`${testID}-native-stub`} />
      )}
      {!readOnly && Platform.OS === 'web' ? <WebFileInput inputRef={inputRef} onFiles={(fl) => void addFiles(fl)} testID={`${testID}-input`} /> : null}
    </FieldShell>
  );
}
