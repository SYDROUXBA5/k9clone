// DOGS — the handler's dogs (cards: photo slot, name, configuration summary, ⋯ menu);
// supervisors/trainers see all managed handlers' dogs read-only.
// Sort: default dog first, then active before retired, then name.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { Dog, User } from '@/db/types';
import { useAuth, useVisibleUserIds } from '@/features/auth/AuthProvider';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Muted, Row, Screen, Sheet, StatusPill, Text, ageFromDob, useColors, useIsDesktop, useToast, radius, space } from '@/ui';

export function sortDogs(dogs: Dog[]): Dog[] {
  return [...dogs].sort((a, b) => {
    if (!!a.is_default !== !!b.is_default) return a.is_default ? -1 : 1;
    const ra = a.status === 'retired' ? 1 : 0;
    const rb = b.status === 'retired' ? 1 : 0;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

export function DogsScreen() {
  const { user, role } = useAuth();
  const visible = useVisibleUserIds();
  const router = useRouter();
  const desktop = useIsDesktop();
  const repo = useRepo();
  const toast = useToast();
  const readOnly = role !== 'handler';
  const dogs = sortDogs(useList('dog', (d) => visible.includes(d.owner_user_id)));
  const users = useList('user');
  const byUser = new Map(users.map((u) => [u.id, u]));
  const canAdd = !readOnly && !!user;
  const [menuFor, setMenuFor] = useState<Dog | null>(null);
  const [deleting, setDeleting] = useState<Dog | null>(null);
  const c = useColors();

  const makeDefault = async (dog: Dog) => {
    setMenuFor(null);
    for (const other of repo.snapshot('dog')) {
      if (other.owner_user_id === dog.owner_user_id && other.id !== dog.id && other.is_default) await repo.upsert('dog', { id: other.id, is_default: false }, { silent: true });
    }
    await repo.upsert('dog', { id: dog.id, is_default: true }, { label: dog.name });
    toast.show(`${dog.name} is now your default dog`);
  };
  const remove = async (dog: Dog) => {
    setDeleting(null);
    await repo.remove('dog', dog.id, { label: dog.name });
    toast.show(`${dog.name} deleted — logged to History`);
  };

  return (
    <Screen
      title="Dogs"
      subtitle={readOnly ? `Dogs of the handlers you ${role === 'supervisor' ? 'supervise' : 'train'} — read-only` : 'At least one dog must be added before you can create training and deployment records. Configure each dog once: patrol types and target odors decide which exercises apply to it.'}
      testID="screen-dogs"
      actions={canAdd ? <Button title="Add dog" icon="add" onPress={() => router.push('/dogs/new')} testID="btn-add-dog" /> : null}
    >
      {dogs.length === 0 ? (
        <EmptyState icon="paw-outline" title="No dogs yet" body={readOnly ? 'None of your managed handlers has added a dog.' : 'Add your first dog to start recording training and deployments.'} action={canAdd ? { title: 'Add dog', onPress: () => router.push('/dogs/new'), testID: 'btn-add-dog-empty' } : undefined} testID="empty-dogs" />
      ) : (
        <View style={[styles.grid, desktop ? { flexDirection: 'row', flexWrap: 'wrap' } : null]}>
          {dogs.map((d) => (
            <DogCard key={d.id} dog={d} owner={readOnly ? byUser.get(d.owner_user_id) : undefined} onPress={() => router.push(`/dogs/${d.id}` as never)} onMenu={readOnly ? undefined : () => setMenuFor(d)} wide={desktop} />
          ))}
        </View>
      )}

      <Sheet visible={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name || 'Dog'} testID="sheet-dog-menu" maxWidth={400}>
        {menuFor ? (
          <>
            <MenuItem icon="create-outline" label="Edit Details" testID="menu-dog-edit" onPress={() => { const id = menuFor.id; setMenuFor(null); router.push(`/dogs/${id}` as never); }} />
            {/* "Edit Photo" used to sit here permanently disabled, hinting at a build unit. A control
                that can never be pressed is worse than no control, and a dog's photo is an ordinary
                document — Manage Documents below now opens a real panel that accepts one. */}
            <MenuItem icon="folder-open-outline" label="Manage Documents" testID="menu-dog-documents" onPress={() => { const id = menuFor.id; setMenuFor(null); router.push(`/dogs/${id}` as never); }} />
            {!menuFor.is_default ? <MenuItem icon="star-outline" label="Make Default Dog" testID="menu-dog-default" onPress={() => void makeDefault(menuFor)} /> : <MenuItem icon="star" label="Default dog" testID="menu-dog-default" disabled onPress={() => {}} />}
            <View style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />
            <MenuItem icon="trash-outline" label="Delete" testID="menu-dog-delete" danger onPress={() => { const d = menuFor; setMenuFor(null); setDeleting(d); }} />
          </>
        ) : null}
      </Sheet>
      <ConfirmDialog
        visible={!!deleting}
        title={`Delete ${deleting?.name || 'dog'}?`}
        body="The dog is removed from your list. Its records stay, and the deletion is logged to History."
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) void remove(deleting); }}
        testID="dialog-delete-dog"
      />
    </Screen>
  );
}

function MenuItem({ icon, label, onPress, testID, danger, disabled, hint }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID: string; danger?: boolean; disabled?: boolean; hint?: string }) {
  const c = useColors();
  const color = disabled ? c.muted : danger ? c.danger : c.text;
  return (
    <Pressable accessibilityRole="menuitem" accessibilityLabel={label} accessibilityState={{ disabled }} testID={testID} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
      <Ionicons name={icon} size={22} color={danger && !disabled ? c.danger : c.primary} style={{ marginRight: space.sm, opacity: disabled ? 0.5 : 1 }} />
      <Text style={{ flex: 1, color }}>{label}</Text>
      {hint ? <Muted>{hint}</Muted> : null}
    </Pressable>
  );
}

function DogCard({ dog, owner, onPress, onMenu, wide }: { dog: Dog; owner?: User; onPress: () => void; onMenu?: () => void; wide: boolean }) {
  const c = useColors();
  const age = ageFromDob(dog.dob);
  const [hovered, setHovered] = useState(false);
  const summary = [dog.breed, dog.purpose, dog.sex ? cap(dog.sex) : '', age].filter(Boolean).join(' · ') || 'No details yet';
  return (
    <View style={[styles.cardWrap, wide ? { width: '48%' } : null]} testID={`card-dog-${dog.id}`}>
      {/* The open button and the ⋯ menu button are SIBLINGS (a button never nests a button). */}
      <Pressable
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${dog.name}`}
        testID={`btn-open-dog-${dog.id}`}
      >
        <Card style={{ borderColor: hovered ? c.primary : c.border }}>
          <Row align="flex-start">
            <View style={[styles.photo, { backgroundColor: c.primarySoft, borderColor: c.border }]} accessibilityLabel={`${dog.name} photo`} testID={`photo-dog-${dog.id}`}>
              <Ionicons name="paw" size={30} color={c.primary} />
              <Muted style={{ fontSize: 16, lineHeight: 18 }}>Photo</Muted>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Row justify="space-between" style={{ paddingRight: onMenu ? 44 : 0 }}>
                <Text variant="h3" testID={`text-dog-name-${dog.id}`}>{dog.name}</Text>
                <StatusPill status={dog.status === 'retired' ? 'retired' : 'active'} />
              </Row>
              <Muted>{summary}</Muted>
              {owner ? <Muted>Handler: {owner.name}</Muted> : null}
              {dog.is_default ? <Row gap={4}><Ionicons name="star" size={16} color={c.accent} /><Muted testID={`text-dog-default-${dog.id}`}>Default dog</Muted></Row> : null}
            </View>
          </Row>
          <View style={{ marginTop: space.sm }}>
            <Muted>Patrol types</Muted>
            <Row wrap gap={6} style={{ marginTop: 4 }}>
              {dog.patrol_types.length ? dog.patrol_types.map((p) => <Badge key={p}>{p}</Badge>) : <Muted>—</Muted>}
            </Row>
          </View>
          <View style={{ marginTop: space.sm }}>
            <Muted>Detection odor types (target)</Muted>
            <Row wrap gap={6} style={{ marginTop: 4 }}>
              {dog.odor_types.length ? dog.odor_types.map((p) => <Badge key={p} tone="accent">{p}</Badge>) : <Muted>—</Muted>}
            </Row>
          </View>
        </Card>
      </Pressable>
      {onMenu ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`More actions for ${dog.name}`} testID={`btn-dog-menu-${dog.id}`} onPress={onMenu} style={({ pressed }) => [styles.menuBtn, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
          <Ionicons name="ellipsis-horizontal" size={24} color={c.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  grid: { gap: space.md, justifyContent: 'space-between' },
  cardWrap: { position: 'relative' },
  photo: { width: 72, height: 72, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  menuBtn: { position: 'absolute', top: 8, right: 8, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  menuItem: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: space.sm, borderRadius: radius.md },
});
