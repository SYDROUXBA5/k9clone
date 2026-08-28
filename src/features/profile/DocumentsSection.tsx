// Uploaded Documents (bar §2.16 row 11 / PT-PRO-09): certificates and reference files organised into
// categories, with rename, move between categories and delete. Documents are ordinary Document rows,
// so History records every add and removal like any other write.
//
// The owner is a parameter because the same panel serves a person's own documents and a DOG's
// (PT-DOG-08) — the Document model has always allowed owner_type 'dog'. `ownerUserId` stays separate
// from `ownerId`: a dog's file still belongs to the handler for visibility and History attribution.
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { Document } from '@/db/types';
import { DOCUMENT_CATEGORIES } from '@/db/vocab';
import { Badge, Button, Card, ConfirmDialog, Muted, Row, Select, Sheet, Text, TextField, fmtDate, useColors, useToast, radius, space } from '@/ui';

const kindOf = (mime?: string | null): Document['kind'] =>
  (mime?.startsWith('image/') ? 'photo' : mime?.startsWith('video/') ? 'video' : 'file');
const fmtSize = (n?: number) => (n == null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function DocumentsSection({ userId, ownerType = 'user', ownerId, testID = 'section-documents' }: {
  /** The account the documents are attributed to — the writer, for visibility and History. */
  userId: string;
  /** What the documents hang off. Defaults to the account itself. */
  ownerType?: Document['owner_type'];
  /** The owning row's id; defaults to `userId` when the owner IS the account. */
  ownerId?: string;
  testID?: string;
}) {
  const owner = ownerId || userId;
  const repo = useRepo();
  const toast = useToast();
  const c = useColors();
  const docs = useList('document', (d) => d.owner_type === ownerType && d.owner_id === owner);
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0]);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<Document | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleting, setDeleting] = useState<Document | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>(DOCUMENT_CATEGORIES as readonly string[]);
    for (const d of docs) if (d.category) set.add(d.category);
    return [...set];
  }, [docs]);

  const add = async () => {
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      for (const a of res.assets) {
        await repo.upsert('document', {
          owner_type: ownerType, owner_id: owner, owner_user_id: userId, category,
          kind: kindOf(a.mimeType), name: a.name, uri: a.uri, mime: a.mimeType || undefined, size_bytes: a.size ?? undefined,
        }, { label: `Document: ${a.name}` });
      }
      toast.show(res.assets.length === 1 ? `“${res.assets[0].name}” uploaded to ${category}` : `${res.assets.length} documents uploaded to ${category}`);
    } catch (err) {
      toast.show(`Upload failed — ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    } finally { setBusy(false); }
  };

  const move = async (d: Document, to: string) => {
    await repo.upsert('document', { id: d.id, category: to }, { label: `Document: ${d.name}` });
    toast.show(`“${d.name}” moved to ${to}`);
  };
  const rename = async () => {
    if (!renaming) return;
    const name = renameText.trim();
    if (!name) { toast.show('Give the document a name.', 'error'); return; }
    await repo.upsert('document', { id: renaming.id, name }, { label: `Document: ${name}` });
    setRenaming(null);
    toast.show('Document renamed');
  };
  const remove = async () => {
    if (!deleting) return;
    const d = deleting;
    setDeleting(null);
    await repo.remove('document', d.id, { label: `Document: ${d.name}` });
    toast.show('Document deleted — logged to History');
  };

  return (
    <View testID={testID}>
      <Row wrap gap={space.md} align="flex-start" style={{ marginBottom: space.sm }}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Select
            label="Upload into category"
            options={categories}
            value={category}
            onChange={setCategory}
            testID="select-document-category"
            maxLength={60}
            help="Type a new category name to create one."
          />
        </View>
        <Button title={busy ? 'Opening…' : 'Upload document'} icon="cloud-upload-outline" onPress={() => void add()} loading={busy} testID="btn-upload-document" style={{ marginTop: 28 }} />
      </Row>

      {docs.length === 0 ? (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: space.lg, alignItems: 'center' }} testID="empty-documents">
          <Ionicons name="document-outline" size={26} color={c.muted} />
          <Muted style={{ marginTop: 4 }}>Certificates, course records and reference files live here. Nothing uploaded yet.</Muted>
        </View>
      ) : categories.filter((cat) => docs.some((d) => d.category === cat)).map((cat) => (
        <View key={cat} style={{ marginBottom: space.md }} testID={`docs-category-${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
          <Row gap={space.sm} style={{ marginBottom: 4 }}>
            <Text variant="label">{cat}</Text>
            <Badge tone="muted">{docs.filter((d) => d.category === cat).length}</Badge>
          </Row>
          {docs.filter((d) => d.category === cat).map((d) => (
            <Card key={d.id} testID={`document-${d.id}`} style={{ marginBottom: space.sm }}>
              <Row wrap gap={space.sm}>
                <Ionicons name={d.kind === 'photo' ? 'image-outline' : d.kind === 'video' ? 'videocam-outline' : 'document-text-outline'} size={26} color={c.primary} />
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text numberOfLines={1}>{d.name}</Text>
                  <Muted numberOfLines={1}>{[fmtSize(d.size_bytes), `added ${fmtDate(d.created_at)}`].filter(Boolean).join(' · ')}</Muted>
                </View>
                <Row wrap gap={space.xs}>
                  <Button title="Rename" variant="secondary" onPress={() => { setRenaming(d); setRenameText(d.name); }} testID={`btn-rename-document-${d.id}`} style={{ minHeight: 36, paddingVertical: 4 }} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete document ${d.name}`}
                    testID={`btn-delete-document-${d.id}`}
                    onPress={() => setDeleting(d)}
                    hitSlop={8}
                    style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="trash-outline" size={22} color={c.danger} />
                  </Pressable>
                </Row>
              </Row>
              <Select
                label={`Category for ${d.name}`}
                options={categories}
                value={d.category}
                onChange={(v) => void move(d, v)}
                testID={`select-move-document-${d.id}`}
                containerStyle={{ marginTop: space.sm, marginBottom: 0 }}
                maxLength={60}
                help="Which folder this file is filed under. Type a category of your own and it is remembered."
              />
            </Card>
          ))}
        </View>
      ))}

      <Sheet
        visible={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename document"
        testID="dialog-rename-document"
        maxWidth={440}
        footer={(
          <Row justify="flex-end">
            <Button title="Cancel" variant="secondary" onPress={() => setRenaming(null)} testID="btn-cancel-rename-document" />
            <Button title="Save" onPress={() => void rename()} testID="btn-save-rename-document" />
          </Row>
        )}
      >
        <TextField label="Document name" value={renameText} onChangeText={setRenameText} testID="input-rename-document" maxLength={120} help="What this file is called in your list. Renaming it here does not change the file itself." />
      </Sheet>

      <ConfirmDialog
        visible={!!deleting}
        title="Delete this document?"
        body={deleting ? `“${deleting.name}” is removed from your profile. The deletion is logged to History.` : ''}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
        testID="dialog-delete-document"
      />
    </View>
  );
}
