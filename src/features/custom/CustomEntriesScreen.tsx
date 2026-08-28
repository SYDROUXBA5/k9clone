// CUSTOM ENTRIES page (bar §2.17 / PT-CUS-01…03): every value the user typed into a dropdown,
// grouped by entry type, with who entered it, how many records reference it, VIEW → filtered
// Records, edit (rename or merge) and delete-when-unreferenced.
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { CustomEntry } from '@/db/types';
import { useAuth, useVisibleUserIds } from '@/features/auth/AuthProvider';
import {
  Badge, Banner, Button, Card, ConfirmDialog, EmptyState, Muted, Row, Screen, Section, Select, Sheet, Switch,
  Table, Text, TextField, fmtDate, useToast, space, type Column,
} from '@/ui';
import {
  SHAREABLE_TYPES, buildRows, describeEdit, groupByType, referencingRecords, typeLabel,
  type CustomEntryData, type CustomEntryRow, type EditMode,
} from './customModel';
import { planValueRewrite } from './rewriteValue';

export function CustomEntriesScreen() {
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const { user, role } = useAuth();
  const visible = useVisibleUserIds();
  const isManager = role === 'supervisor' || role === 'trainer';

  const users = useList('user');
  const entries = useList('custom_entry', (e) => visible.includes(e.owner_user_id) || e.is_shared_standard);
  const data: CustomEntryData = {
    dogs: useList('dog'), events: useList('training_event'), exercises: useList('exercise'),
    completions: useList('completion'), deployments: useList('deployment'), classes: useList('class_record'),
    vets: useList('vet_visit'), vaccinations: useList('vaccination'),
  };

  const nameOf = useMemo(() => {
    const m = new Map(users.map((u) => [u.id, u.name]));
    return (id: string) => m.get(id) || 'Unknown';
  }, [users]);

  const rows = useMemo(() => buildRows(entries, data, nameOf), [entries, data, nameOf]);
  const [typeFilter, setTypeFilter] = useState('');
  const [q, setQ] = useState('');
  const filtered = rows.filter((r) =>
    (!typeFilter || r.type === typeFilter)
    && (!q.trim() || r.value.toLowerCase().includes(q.trim().toLowerCase())));
  const groups = groupByType(filtered);
  const types = useMemo(() => [...new Set(rows.map((r) => r.type))].sort((a, b) => typeLabel(a).localeCompare(typeLabel(b))), [rows]);

  const [editing, setEditing] = useState<CustomEntryRow | null>(null);
  const [deleting, setDeleting] = useState<CustomEntryRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [usage, setUsage] = useState<CustomEntryRow | null>(null);

  const remove = async () => {
    if (!deleting) return;
    const row = deleting;
    setDeleting(null);
    await repo.remove('custom_entry', row.entry.id, { label: `Custom entry: ${row.value}` });
    toast.show('Custom entry deleted successfully.');
  };

  const toggleShared = async (row: CustomEntryRow, shared: boolean) => {
    await repo.upsert('custom_entry', { id: row.entry.id, is_shared_standard: shared }, { label: `Custom entry: ${row.value}` });
    toast.show(shared ? `“${row.value}” is now a department standard — it appears in every managed handler's dropdown.` : `“${row.value}” is no longer a department standard.`);
  };

  const columns: Column<CustomEntryRow>[] = [
    { key: 'value', title: 'Value', flex: 1.4, render: (r) => <Text variant="bodyStrong">{r.value}</Text> },
    { key: 'type', title: 'Entry Type', flex: 1, render: (r) => r.typeLabel },
    { key: 'owner', title: 'Entered By', flex: 1, render: (r) => <Row wrap gap={4}><Text>{r.ownerName}</Text>{r.shared ? <Badge tone="accent">Department standard</Badge> : null}</Row> },
    { key: 'refs', title: 'References', width: 130, render: (r) => <Text testID={`text-refs-${r.entry.id}`}>{r.references}</Text> },
    {
      key: 'actions', title: '', flex: 1.2,
      render: (r) => (
        <Row wrap gap={space.xs}>
          {r.references > 0 ? (
            <Button
              title="VIEW"
              variant="ghost"
              onPress={() => (r.viewHref ? router.push(r.viewHref as never) : setUsage(r))}
              testID={`btn-view-${r.entry.id}`}
              accessibilityLabel={`View the ${r.references} record${r.references === 1 ? ' that uses' : 's that use'} ${r.value}`}
              style={{ minHeight: 36, paddingVertical: 4 }}
            />
          ) : null}
          <Button title="Edit" variant="secondary" onPress={() => setEditing(r)} testID={`btn-edit-${r.entry.id}`} style={{ minHeight: 36, paddingVertical: 4 }} />
          <Button
            title="Delete"
            variant={r.canDelete ? 'danger' : 'ghost'}
            disabled={!r.canDelete}
            onPress={() => setDeleting(r)}
            testID={`btn-delete-${r.entry.id}`}
            accessibilityLabel={r.canDelete ? `Delete ${r.value}` : `${r.value} cannot be deleted — it is used by ${r.references} record${r.references === 1 ? '' : 's'}`}
            style={{ minHeight: 36, paddingVertical: 4 }}
          />
        </Row>
      ),
    },
  ];

  return (
    <Screen
      title="Custom Entries"
      subtitle="Values you typed into a dropdown instead of picking one. They stay in that dropdown until you delete them here."
      testID="screen-custom-entries"
      maxWidth={1240}
      actions={isManager ? <Button title="Add Custom Entry" icon="add" onPress={() => setAdding(true)} testID="btn-add-custom-entry" /> : undefined}
    >
      <Card testID="card-custom-filters" style={{ marginBottom: space.lg }}>
        <Row wrap gap={space.md} align="flex-start">
          <View style={{ flex: 1, minWidth: 240 }}>
            <Select
              label="Entry type"
              options={[{ value: '', label: `All types (${rows.length})` }, ...types.map((t) => ({ value: t, label: `${typeLabel(t)} (${rows.filter((r) => r.type === t).length})` }))]}
              allowCustom={false}
              value={typeFilter}
              onChange={setTypeFilter}
              testID="select-custom-type-filter"
              help="Narrows the page to one kind of dropdown — Event Tags are the tags on training events, Deployment Tags the ones on deployments."
            />
          </View>
          <View style={{ flex: 1, minWidth: 240 }}>
            <TextField label="Search values" value={q} onChangeText={setQ} testID="input-custom-search" placeholder="Type part of a value" help="Matches any part of a value, so “sch” finds both School District #42 and School Sweep." />
          </View>
        </Row>
        <Muted>A value can only be deleted while no record uses it — otherwise edit it to rename or merge it into another value.</Muted>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon="list-outline"
          title="No custom entries yet"
          body="Type a value that isn't in a dropdown — a packaging, a requesting unit, a tag — and it is stored here for next time."
          testID="empty-custom-entries"
        />
      ) : groups.length === 0 ? (
        <EmptyState icon="search-outline" title="No values match that filter" body="Clear the type filter or the search box." testID="empty-custom-filtered" />
      ) : groups.map((g) => (
        <Section key={g.type} title={g.label} description={`${g.rows.length} value${g.rows.length === 1 ? '' : 's'}`}>
          <Table<CustomEntryRow>
            testID={`table-custom-${g.type}`}
            columns={columns}
            rows={g.rows}
            keyOf={(r) => r.entry.id}
            rowTestID={(r) => `row-custom-${r.entry.id}`}
          />
          {isManager ? (
            <View style={{ marginTop: space.sm }}>
              {g.rows.filter((r) => SHAREABLE_TYPES.includes(r.type)).map((r) => (
                <Switch
                  key={r.entry.id}
                  label={`“${r.value}” is a department standard`}
                  help="A shared standard appears in every managed handler's dropdown for this field."
                  value={r.shared}
                  onChange={(v) => void toggleShared(r, v)}
                  testID={`switch-shared-${r.entry.id}`}
                />
              ))}
            </View>
          ) : null}
        </Section>
      ))}

      <UsageDialog row={usage} data={data} onClose={() => setUsage(null)} />

      <EditDialog
        row={editing}
        rows={rows}
        data={data}
        onClose={() => setEditing(null)}
        onDone={(msg) => { setEditing(null); toast.show(msg); }}
      />

      <AddDialog
        visible={adding}
        types={types}
        ownerId={user?.id || ''}
        onClose={() => setAdding(false)}
        onDone={(msg) => { setAdding(false); toast.show(msg); }}
      />

      <ConfirmDialog
        visible={!!deleting}
        title="Delete this custom entry?"
        body={deleting ? `“${deleting.value}” disappears from the ${deleting.typeLabel} dropdown. No record uses it, so nothing else changes. The deletion is logged to History.` : ''}
        confirmTitle="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
        testID="dialog-delete-custom-entry"
      />
    </Screen>
  );
}

/**
 * VIEW for a value the Records search box cannot reach. The hub searches record names, locations,
 * tags, agencies, instructors, care types and comments — a packaging or a weather reading sits
 * several levels down inside an exercise, so there is no filter to send you to. This lists the same
 * records the reference count is computed from, each one a tap from its record.
 */
function UsageDialog({ row, data, onClose }: { row: CustomEntryRow | null; data: CustomEntryData; onClose: () => void }) {
  const router = useRouter();
  const list = useMemo(() => (row ? referencingRecords(row.type, row.value, data) : []), [row, data]);
  if (!row) return null;
  return (
    <Sheet visible onClose={onClose} title={`Records that use “${row.value}”`} testID="dialog-custom-usage" maxWidth={620}>
      <Muted style={{ marginBottom: space.md }} testID="text-usage-explainer">
        {`${row.typeLabel} is captured inside a record, not on it, so the Records search box cannot filter on it. ${list.length === 1 ? 'This is the one record that uses' : `These are the ${list.length} records that use`} “${row.value}”.`}
      </Muted>
      {list.length === 0 ? (
        <EmptyState icon="search-outline" title="Nothing uses this value" body="It can be deleted safely." testID="empty-custom-usage" />
      ) : list.map((u) => (
        <View key={u.id} testID={`row-usage-${u.id}`}>
        <Row justify="space-between" wrap style={{ paddingVertical: space.sm }}>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Row wrap gap={6} align="center">
              <Badge>{u.kind}</Badge>
              <Text variant="bodyStrong">{u.title}</Text>
            </Row>
            <Muted>{[u.subtitle, u.at ? fmtDate(u.at) : ''].filter(Boolean).join(' · ')}</Muted>
          </View>
          <Button
            title="Open"
            variant="secondary"
            onPress={() => { onClose(); router.push(u.href as never); }}
            testID={`btn-open-usage-${u.id}`}
            accessibilityLabel={`Open ${u.kind} ${u.title}`}
            style={{ minHeight: 36, paddingVertical: 4 }}
          />
        </Row>
        </View>
      ))}
    </Sheet>
  );
}

function EditDialog({ row, rows, data, onClose, onDone }: {
  row: CustomEntryRow | null;
  rows: CustomEntryRow[];
  data: CustomEntryData;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const repo = useRepo();
  const [mode, setMode] = useState<EditMode>('rename');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);

  // Reset the fields whenever a different row opens the dialog.
  if (row && seen !== row.entry.id) { setSeen(row.entry.id); setMode('rename'); setName(row.value); setTarget(''); setError(null); }
  if (!row) return null;

  const siblings = rows.filter((r) => r.type === row.type && r.entry.id !== row.entry.id);
  const to = mode === 'rename' ? name.trim() : target.trim();
  const writes = to ? planValueRewrite(row.type, row.value, to, data) : [];

  const save = async () => {
    if (!to) { setError(mode === 'rename' ? 'Enter the new value.' : 'Pick the value to merge into.'); return; }
    if (mode === 'rename' && to.toLowerCase() === row.value.toLowerCase()) { setError('That is the current value.'); return; }
    setBusy(true);
    setError(null);
    try {
      for (const w of writes) await repo.upsert(w.entity, { id: w.id, ...w.patch }, { label: w.label });
      if (mode === 'merge') {
        await repo.remove('custom_entry', row.entry.id, { label: `Custom entry: ${row.value}` });
        onDone('Custom entry merged successfully.');
      } else {
        await repo.upsert('custom_entry', { id: row.entry.id, value: to }, { label: `Custom entry: ${to}` });
        onDone('Custom entry updated successfully.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the change.');
    } finally { setBusy(false); }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={`Edit “${row.value}”`}
      testID="dialog-edit-custom-entry"
      maxWidth={560}
      footer={(
        <Row justify="flex-end" wrap>
          <Button title="Cancel" variant="secondary" onPress={onClose} testID="btn-cancel-edit-custom" />
          <Button title={busy ? 'Saving…' : 'Save'} onPress={() => void save()} loading={busy} testID="btn-save-custom-entry" />
        </Row>
      )}
    >
      <Muted style={{ marginBottom: space.md }}>{row.typeLabel} · used by {row.references} record{row.references === 1 ? '' : 's'}</Muted>
      <Select
        label="What should happen"
        options={[{ value: 'rename', label: 'Rename this value' }, { value: 'merge', label: 'Merge it into an existing value' }]}
        allowCustom={false}
        value={mode}
        onChange={(v) => { setMode(v as EditMode); setError(null); }}
        testID="select-custom-edit-mode"
        help="Rename keeps this value and changes its spelling everywhere. Merge removes it and re-points its records at a value you already have."
      />
      {mode === 'rename' ? (
        <TextField label="New value" value={name} onChangeText={(v) => { setName(v); setError(null); }} testID="input-custom-rename" maxLength={80} error={error} help="The spelling handlers will see in the dropdown from now on. Every record using the old spelling is updated." />
      ) : (
        <Select
          label="Merge into"
          options={siblings.map((s) => ({ value: s.value, label: s.value, description: `${s.references} record${s.references === 1 ? '' : 's'}` }))}
          allowCustom
          value={target}
          onChange={(v) => { setTarget(v); setError(null); }}
          testID="select-custom-merge-target"
          error={error}
          help="The value that survives. Everything using the value you are editing is re-pointed at this one, and each rewrite is logged to History."
          placeholder={siblings.length ? 'Pick a value' : 'Type the value to keep'}
        />
      )}
      {to ? (
        <Banner
          tone="info"
          testID="banner-custom-edit-preview"
          title="What Save will do"
          body={`${describeEdit(mode, row, to)}${writes.length ? ` ${writes.length} record${writes.length === 1 ? '' : 's'} will be rewritten and each change is logged to History.` : ''}`}
        />
      ) : null}
    </Sheet>
  );
}

function AddDialog({ visible, types, ownerId, onClose, onDone }: {
  visible: boolean; types: string[]; ownerId: string; onClose: () => void; onDone: (msg: string) => void;
}) {
  const repo = useRepo();
  const [type, setType] = useState('requesting_unit');
  const [value, setValue] = useState('');
  const [shared, setShared] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const options = [...new Set([...SHAREABLE_TYPES.map(String), ...types])].map((t) => ({ value: t, label: typeLabel(t) }));

  const save = async () => {
    const v = value.trim();
    if (!v) { setError('Enter the value handlers should see in the dropdown.'); return; }
    await repo.upsert('custom_entry', {
      type, value: v, is_shared_standard: shared, use_count: 0, owner_user_id: ownerId,
    } as Partial<CustomEntry>, { label: `Custom entry: ${v}` });
    setValue('');
    onDone('Custom entry added successfully.');
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add Custom Entry"
      testID="dialog-add-custom-entry"
      maxWidth={520}
      footer={(
        <Row justify="flex-end" wrap>
          <Button title="Cancel" variant="secondary" onPress={onClose} testID="btn-cancel-add-custom" />
          <Button title="Add" onPress={() => void save()} testID="btn-confirm-add-custom" />
        </Row>
      )}
    >
      <Select label="Entry type" options={options} allowCustom={false} value={type} onChange={setType} testID="select-add-custom-type" help="Which dropdown this value should appear in — Event Tags show on training events, Deployment Tags on deployments." />
      <TextField label="Value" value={value} onChangeText={(v) => { setValue(v); setError(null); }} testID="input-add-custom-value" maxLength={80} error={error} placeholder="e.g. School District 23" help="Exactly as handlers should see it in the dropdown — spelling and capitalisation included." />
      <Switch label="Share with every handler I manage" help="A department standard appears in their dropdown as well as yours." value={shared} onChange={setShared} testID="switch-add-custom-shared" />
    </Sheet>
  );
}
