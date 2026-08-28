// Filter dialog (desktop) / sheet (phone) — same fields in the same order on both. Every dropdown that
// names a thing (patrol type, tag, agency, odor) accepts a typed value; the fixed enums do not.
// Saved Searches live at the top-right of the dialog (apply / trash), plus "Save this search".
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Dog, SavedSearch, User } from '@/db/types';
import { DATE_RANGES, DEPLOYMENT_TAGS, ODOR_CATEGORIES, PATROL_TYPE_FILTER, RECORD_TYPE_FILTER, WORK_MODES } from '@/db/vocab';
import { deviceTimeZone } from '@/db/util';
import { Button, DateTimeField, Muted, Select, Sheet, Switch, Text, TextField, VocabSelect, fromInputs, radius, space, toDateInput, useColors } from '@/ui';
import { ALL_PATROL_TYPES, ANY_TAG, EMPTY_CRITERIA, TRAINER_COMMENTS_ANY, activeCriteriaKeys, type Criteria, type DateRangeFilter, type RecordTypeFilter, type WorkModeFilter } from './model';

export function FilterSheet({ visible, onClose, value, onApply, dogs, handlers, showHandler, savedSearches, onApplySaved, onDeleteSaved, onSaveCurrent }: {
  visible: boolean;
  onClose: () => void;
  value: Criteria;
  onApply: (c: Criteria) => void;
  dogs: Dog[];
  handlers: User[];
  showHandler: boolean;
  savedSearches: SavedSearch[];
  onApplySaved: (s: SavedSearch) => void;
  onDeleteSaved: (s: SavedSearch) => void;
  onSaveCurrent: (draft: Criteria) => void;
}) {
  // Remounted on every open so the draft starts from the criteria currently applied.
  return (
    <FilterDialog
      key={visible ? 'open' : 'closed'}
      visible={visible}
      initial={value}
      onCancel={onClose}
      onApply={(c) => { onApply(c); onClose(); }}
      dogs={dogs}
      handlers={handlers}
      showHandler={showHandler}
      savedSearches={savedSearches}
      onApplySaved={(s) => { onApplySaved(s); onClose(); }}
      onDeleteSaved={onDeleteSaved}
      onSaveCurrent={onSaveCurrent}
    />
  );
}

function FilterDialog({ visible, initial, onCancel, onApply, dogs, handlers, showHandler, savedSearches, onApplySaved, onDeleteSaved, onSaveCurrent }: {
  visible: boolean;
  initial: Criteria; onCancel: () => void; onApply: (c: Criteria) => void; dogs: Dog[]; handlers: User[]; showHandler: boolean;
  savedSearches: SavedSearch[]; onApplySaved: (s: SavedSearch) => void; onDeleteSaved: (s: SavedSearch) => void; onSaveCurrent: (draft: Criteria) => void;
}) {
  const c = useColors();
  const [draft, setDraft] = useState<Criteria>(initial);
  const [showSaved, setShowSaved] = useState(false);
  const [advanced, setAdvanced] = useState(() => !!(initial.review || initial.completion || initial.deploymentTag || initial.requestingUnit || initial.odorType || initial.arrests || initial.comment || initial.trainerComments));
  const [tcMode, setTcMode] = useState<'' | 'any' | 'text'>(() => (initial.trainerComments === '' ? '' : initial.trainerComments === TRAINER_COMMENTS_ANY ? 'any' : 'text'));
  const set = <K extends keyof Criteria>(k: K, v: Criteria[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const tz = deviceTimeZone();
  const dogOptions = [{ value: '', label: 'All Dogs' }, ...dogs.map((d) => ({ value: d.id, label: d.name }))];
  const handlerOptions = [{ value: '', label: 'All Handlers' }, ...handlers.map((h) => ({ value: h.id, label: h.name }))];
  const activeCount = activeCriteriaKeys(draft).length;
  // Reset · CANCEL · APPLY live in the Sheet's pinned footer — they stay on screen while the criteria scroll.
  const footer = (
    <View style={styles.footer}>
      <Button title="Save this search" variant="ghost" icon="bookmark-outline" onPress={() => onSaveCurrent(draft)} testID="btn-save-search-dialog" disabled={activeCount === 0} />
      <View style={{ flex: 1, minWidth: 0 }} />
      <Button title="Reset" variant="ghost" onPress={() => setDraft({ ...EMPTY_CRITERIA })} testID="btn-filter-reset" />
      <Button title="CANCEL" variant="secondary" onPress={onCancel} testID="btn-filter-cancel" />
      <Button title="APPLY" variant="accent" icon="checkmark" onPress={() => onApply(draft)} testID="btn-filter-apply" />
    </View>
  );
  return (
    <Sheet visible={visible} onClose={onCancel} title="Filter" testID="sheet-filter" maxWidth={640} footer={footer}>
    <View>
      {/* Saved Searches ▾ (top-right of the dialog, as in the reference) */}
      <View style={styles.savedRow}>
        <Muted style={{ flex: 1 }}>{activeCount ? `${activeCount} filter${activeCount === 1 ? '' : 's'} set` : 'No filters set'}</Muted>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Saved Searches"
          accessibilityState={{ expanded: showSaved }}
          testID="btn-saved-searches"
          onPress={() => setShowSaved((v) => !v)}
          style={({ pressed }) => [styles.savedBtn, { borderColor: c.borderStrong, backgroundColor: pressed ? c.surfaceAlt : c.surface }]}
        >
          <Ionicons name="bookmark-outline" size={20} color={c.primary} style={{ marginRight: 6 }} />
          <Text variant="bodyStrong" color="primary">Saved Searches</Text>
          <Ionicons name={showSaved ? 'chevron-up' : 'chevron-down'} size={18} color={c.primary} style={{ marginLeft: 4 }} />
        </Pressable>
      </View>
      {showSaved ? (
        <View testID="list-saved-searches" style={[styles.savedList, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
          {savedSearches.length === 0 ? <Muted style={{ padding: space.sm }}>No saved searches yet. Set filters, then “Save this search”.</Muted> : null}
          {savedSearches.map((s) => (
            <View key={s.id} style={styles.savedItem}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Apply saved search ${s.name}`} testID={`saved-search-${slug(s.name)}`} onPress={() => onApplySaved(s)} style={({ pressed }) => [styles.savedItemMain, { backgroundColor: pressed ? c.primarySoft : 'transparent' }]}>
                <Ionicons name="bookmark" size={20} color={c.primary} style={{ marginRight: space.sm }} />
                <Text style={{ flex: 1 }} numberOfLines={1}>{s.name}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete saved search ${s.name}`} testID={`saved-search-delete-${slug(s.name)}`} onPress={() => onDeleteSaved(s)} hitSlop={6} style={styles.trash}>
                <Ionicons name="trash-outline" size={22} color={c.danger} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Select label="Record Type" options={[...RECORD_TYPE_FILTER]} value={draft.recordType} onChange={(v) => set('recordType', v as RecordTypeFilter)} allowCustom={false} testID="select-filter-record-type" />
      <Select label="Work Mode" options={[...WORK_MODES]} value={draft.workMode} onChange={(v) => set('workMode', v as WorkModeFilter)} allowCustom={false} testID="select-filter-work-mode" />
      <VocabSelect
        customType="patrol_type"
        label="Patrol Type"
        options={[ALL_PATROL_TYPES, ...PATROL_TYPE_FILTER]}
        value={draft.patrolType || ALL_PATROL_TYPES}
        onChange={(v) => set('patrolType', v || ALL_PATROL_TYPES)}
        help="A patrol type also finds scenarios that contain it."
        testID="select-filter-patrol-type"
      />
      <Select label="Dog" options={dogOptions} value={draft.dog} onChange={(v) => set('dog', v)} allowCustom={false} testID="select-filter-dog" />
      {showHandler ? <Select label="Handler" options={handlerOptions} value={draft.handler} onChange={(v) => set('handler', v)} allowCustom={false} testID="select-filter-handler" /> : null}
      <Select label="Date Range" options={[...DATE_RANGES]} value={draft.dateRange} onChange={(v) => set('dateRange', v as DateRangeFilter)} allowCustom={false} testID="select-filter-date-range" />
      {draft.dateRange === 'Custom...' ? (
        <View style={styles.customRange}>
          <DateTimeField label="From" mode="date" value={{ at: draft.from ? fromInputs(draft.from, '00:00', tz) : null, tz }} onChange={(v) => set('from', v.at ? toDateInput(v.at, tz) : null)} testID="input-filter-from" containerStyle={{ flex: 1 }} />
          <DateTimeField label="To" mode="date" value={{ at: draft.to ? fromInputs(draft.to, '00:00', tz) : null, tz }} onChange={(v) => set('to', v.at ? toDateInput(v.at, tz) : null)} testID="input-filter-to" containerStyle={{ flex: 1 }} />
        </View>
      ) : null}
      <TextField label="Search" value={draft.q} onChangeText={(v) => set('q', v)} placeholder="Event, location, dog, case number, comments…" testID="input-filter-search" returnKeyType="search" onSubmitEditing={() => onApply(draft)} />

      <Muted style={{ marginBottom: space.sm }}>Add an advanced filter to refine your search. Filter by Arrests, Requesting Agency, Odor Type, Review state, etc.</Muted>
      {!advanced ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Add filter" testID="btn-add-filter" onPress={() => setAdvanced(true)} style={styles.linkBtn}>
          <Ionicons name="funnel-outline" size={20} color={c.primary} style={{ marginRight: 6 }} />
          <Text variant="bodyStrong" color="primary">ADD FILTER</Text>
        </Pressable>
      ) : (
        <View testID="filter-advanced" style={[styles.advanced, { borderColor: c.border }]}>
          <Select label="Reviewed" options={[{ value: '', label: 'Any' }, { value: 'reviewed', label: 'Reviewed' }, { value: 'not_reviewed', label: 'Not Reviewed' }]} value={draft.review} onChange={(v) => set('review', v as Criteria['review'])} allowCustom={false} testID="select-filter-review" />
          <Select label="Complete" options={[{ value: '', label: 'Any' }, { value: 'complete', label: 'Complete' }, { value: 'not_complete', label: 'Not Complete' }]} value={draft.completion} onChange={(v) => set('completion', v as Criteria['completion'])} allowCustom={false} testID="select-filter-completion" />
          <VocabSelect customType="deployment_tag" label="Deployment Tags" options={[{ value: '', label: 'Any' }, { value: ANY_TAG, label: ANY_TAG }, ...DEPLOYMENT_TAGS]} value={draft.deploymentTag} onChange={(v) => set('deploymentTag', v)} clearable testID="select-filter-deployment-tag" />
          <VocabSelect customType="requesting_unit" label="Requesting Agency" options={[{ value: '', label: 'Any' }]} value={draft.requestingUnit} onChange={(v) => set('requestingUnit', v)} clearable placeholder="Any" testID="select-filter-requesting-unit" />
          <VocabSelect customType="odor_type" label="Odor Type" options={[{ value: '', label: 'Any' }, ...ODOR_CATEGORIES]} value={draft.odorType} onChange={(v) => set('odorType', v)} clearable testID="select-filter-odor-type" />
          <Switch label="Arrests" help="Only deployments with at least one arrest" value={draft.arrests} onChange={(v) => set('arrests', v)} testID="switch-filter-arrests" />
          <TextField label="Comment" value={draft.comment} onChangeText={(v) => set('comment', v)} placeholder="Handler comments contain…" testID="input-filter-comment" returnKeyType="search" onSubmitEditing={() => onApply(draft)} />
          <Select
            label="Trainer Comments"
            options={[{ value: '', label: 'Any' }, { value: 'any', label: 'Has trainer comments' }, { value: 'text', label: 'Trainer comments contain…' }]}
            value={tcMode}
            onChange={(v) => { const m = v as '' | 'any' | 'text'; setTcMode(m); set('trainerComments', m === 'any' ? TRAINER_COMMENTS_ANY : ''); }}
            allowCustom={false}
            testID="select-filter-trainer-comments"
          />
          {tcMode === 'text' ? <TextField label="Trainer comment text" value={draft.trainerComments === TRAINER_COMMENTS_ANY ? '' : draft.trainerComments} onChangeText={(v) => set('trainerComments', v)} placeholder="Trainer comments contain…" testID="input-filter-trainer-comment" returnKeyType="search" onSubmitEditing={() => onApply(draft)} /> : null}
        </View>
      )}

    </View>
    </Sheet>
  );
}

/** Name prompt for "Save this search". */
export function SaveSearchSheet({ visible, onClose, onSave, existingNames }: { visible: boolean; onClose: () => void; onSave: (name: string) => void; existingNames: string[] }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const n = name.trim();
    if (!n) { setError('Give the search a name'); return; }
    if (existingNames.some((e) => e.toLowerCase() === n.toLowerCase())) { setError('A saved search with that name exists — pick another'); return; }
    onSave(n);
    setName('');
    setError(null);
  };
  return (
    <Sheet visible={visible} onClose={() => { setName(''); setError(null); onClose(); }} title="Save this search" testID="sheet-save-search" maxWidth={440}
      footer={<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm }}><Button title="Cancel" variant="secondary" onPress={onClose} testID="btn-save-search-cancel" /><Button title="Save" onPress={submit} testID="btn-save-search-confirm" /></View>}
    >
      <TextField label="Search name" value={name} onChangeText={(v) => { setName(v); if (error) setError(null); }} placeholder="e.g. Deploy-only" error={error} testID="input-saved-search-name" autoFocus returnKeyType="done" onSubmitEditing={submit} maxLength={60} />
      <Muted>Saved searches are kept on your account and listed under Filter → Saved Searches.</Muted>
    </Sheet>
  );
}

export function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

const styles = StyleSheet.create({
  savedRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md, gap: space.sm },
  savedBtn: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1 },
  savedList: { borderWidth: 1, borderRadius: radius.md, marginBottom: space.md, padding: 4 },
  savedItem: { flexDirection: 'row', alignItems: 'center' },
  savedItemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.sm },
  trash: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  customRange: { flexDirection: 'row', gap: space.sm },
  linkBtn: { flexDirection: 'row', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start', paddingHorizontal: 4, marginBottom: space.sm },
  advanced: { borderTopWidth: 1, paddingTop: space.md, marginBottom: space.sm },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
});
