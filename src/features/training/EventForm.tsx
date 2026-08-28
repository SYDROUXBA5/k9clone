// Training Event form (step 1): name, Date & Time, Duration (Hours:Mins), Location Name (+ saved / autocomplete /
// use my location), Forecast line, Group + INVITED MEMBERS (⨉ · avatar · name · email · LEADER · MANDATORY · answer),
// ADD MEMBERS, GROUP: UPDATE | NEW, optional attendance, and the collapsible OPTIONAL: Tags, Comments, Files and more.
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { EventInvitee, InviteResponse, TrainingGroup, User } from '@/db/types';
import { ATTENDANCE_ANSWERS, EVENT_TAGS } from '@/db/vocab';
import { Button, Checkbox, DateTimeField, FieldShell, Muted, Row, Segmented, Select, Sheet, Switch, Text, TextArea, TextField, VocabMultiSelect, space, useColors, useToast, radius } from '@/ui';
import { fetchWeather, weatherSummary } from '@/features/weather/openMeteo';
import { LocationField } from './LocationField';
import type { EventDraft, EventErrors } from './logic';
import { FilesField } from './FilesField';
import { TemplatePicker, UseTemplateLink } from './TemplatePicker';

export function EventForm({ draft, onChange, readOnly, me, users, groups, errors, testID = 'event', showNameField = true }: {
  draft: EventDraft; onChange: (d: EventDraft) => void; readOnly?: boolean; me: User; users: User[]; groups: TrainingGroup[]; errors: EventErrors; testID?: string;
  /** False when the screen already carries the event name as an editable title (pencil) above the form. */
  showNameField?: boolean;
}) {
  const c = useColors();
  const repo = useRepo();
  const toast = useToast();
  const [optionalOpen, setOptionalOpen] = useState(!!(draft.tags.length || draft.comments_to_group || draft.venue_contact || draft.files.length));
  const [addOpen, setAddOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastMsg, setForecastMsg] = useState<string | null>(null);
  const forecastKey = useRef('');
  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => onChange({ ...draft, [k]: v });
  const userById = (id: string) => users.find((u) => u.id === id);
  const connections = useList('connection', (x) => x.user_id === me.id).map((x) => x.connected_user_id);
  const group = groups.find((g) => g.id === draft.group_id) || null;

  // Forecast line — auto from time + place, refetch when either changes.
  const canForecast = !!draft.starts_at && typeof draft.location.lat === 'number' && typeof draft.location.lng === 'number';
  const loadForecast = async () => {
    if (!canForecast) { setForecastMsg('Pick a location with a map position to see the forecast.'); return; }
    setForecastLoading(true);
    const r = await fetchWeather(draft.starts_at, draft.location.lat as number, draft.location.lng as number);
    setForecastLoading(false);
    if (r.ok) { setForecastMsg(null); onChange({ ...draft, forecast: r.weather }); }
    else setForecastMsg(r.message);
  };
  useEffect(() => {
    if (readOnly || !canForecast) return;
    const key = `${draft.starts_at}|${draft.location.lat}|${draft.location.lng}`;
    if (forecastKey.current === key) return;
    forecastKey.current = key;
    if (draft.forecast && draft.forecast.source === 'open-meteo' && draft.id) return; // keep the stored forecast on an existing event until Reload
    void loadForecast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.starts_at, draft.location.lat, draft.location.lng, canForecast, readOnly]);

  // Invitees
  const setInvitee = (id: string, patch: Partial<EventInvitee>) => set('invitees', draft.invitees.map((i) => (i.user_id === id ? { ...i, ...patch } : i)));
  const removeInvitee = (id: string) => set('invitees', draft.invitees.filter((i) => i.user_id !== id));
  const addInvitees = (ids: string[]) => {
    const existing = new Set(draft.invitees.map((i) => i.user_id));
    const add = ids.filter((id) => !existing.has(id)).map<EventInvitee>((id) => ({ user_id: id, is_leader: false, is_mandatory: !draft.optional_attendance, response: 'undecided', attended: false }));
    set('invitees', [...draft.invitees, ...add]);
  };
  const applyGroup = (gid: string) => {
    const g = groups.find((x) => x.id === gid);
    if (!g) { onChange({ ...draft, group_id: null }); return; }
    const members = [...new Set([...g.leaders, ...g.members])];
    const kept = draft.invitees.filter((i) => members.includes(i.user_id));
    const add = members.filter((m) => !kept.some((i) => i.user_id === m)).map<EventInvitee>((id) => ({ user_id: id, is_leader: g.leaders.includes(id) || id === me.id, is_mandatory: !draft.optional_attendance, response: id === me.id ? 'attend' : 'undecided', attended: false }));
    onChange({ ...draft, group_id: gid, invitees: [...kept, ...add] });
  };
  const groupMembers = group ? [...new Set([...group.leaders, ...group.members])] : [];
  const inviteeIds = draft.invitees.map((i) => i.user_id);
  const diverges = !!group && (groupMembers.some((m) => !inviteeIds.includes(m)) || inviteeIds.some((m) => !groupMembers.includes(m)));
  const allLeaders = draft.invitees.length > 0 && draft.invitees.every((i) => i.is_leader);
  const allMandatory = draft.invitees.length > 0 && draft.invitees.every((i) => i.is_mandatory);
  const updateGroup = async () => {
    if (!group) return;
    await repo.upsert('training_group', { id: group.id, members: inviteeIds.filter((id) => id !== group.leader_id), leaders: [...new Set([group.leader_id, ...draft.invitees.filter((i) => i.is_leader).map((i) => i.user_id)])] }, { label: group.name });
    toast.show(`Group ${group.name} updated with ${inviteeIds.length} members`);
  };
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const saveNewGroup = async () => {
    const name = newGroupName.trim();
    if (!name) { toast.show('Give the new group a name.', 'error'); return; }
    const code = Math.random().toString(36).slice(2, 9).toUpperCase();
    const g = await repo.upsert('training_group', { owner_user_id: me.id, name, code, leader_id: me.id, leaders: [me.id, ...draft.invitees.filter((i) => i.is_leader && i.user_id !== me.id).map((i) => i.user_id)], members: inviteeIds, pending: [] }, { label: name });
    onChange({ ...draft, group_id: g.id });
    setNewGroupOpen(false);
    setNewGroupName('');
    toast.show(`Group ${name} saved (code ${code})`);
  };

  const respLabel = (r: InviteResponse) => ATTENDANCE_ANSWERS.find((a) => a.value === r)?.label || r;

  return (
    <View testID={testID}>
      {showNameField ? <TextField label="Event name" value={draft.name} onChangeText={(v) => set('name', v)} placeholder="e.g. Friday Morning Training" testID={`${testID}-name`} editable={!readOnly} help="Optional — shown on the record row and calendar." /> : null}
      <DateTimeField label="Date & Time" required value={{ at: draft.starts_at || null, tz: draft.tz }} onChange={(v) => onChange({ ...draft, starts_at: v.at || '', tz: v.tz })} readOnly={readOnly} error={errors.starts_at} testID={`${testID}-datetime`} />
      <DurationField value={draft.duration_min} onChange={(v) => set('duration_min', v)} readOnly={readOnly} error={errors.duration_min} testID={`${testID}-duration`} />
      <LocationField value={draft.location} onChange={(v) => set('location', v)} readOnly={readOnly} testID={`${testID}-location`} />
      <Row wrap gap={6} style={{ marginBottom: space.md }}>
        <Ionicons name="partly-sunny-outline" size={20} color={c.primary} />
        <Text testID={`${testID}-forecast`} style={{ flex: 1, minWidth: 200 }}>Forecast: {draft.forecast && weatherSummary(draft.forecast) ? weatherSummary(draft.forecast) : forecastLoading ? 'loading…' : forecastMsg || (canForecast ? '—' : 'set a location with a map position')}</Text>
        {!readOnly ? <Button title={forecastLoading ? 'Loading…' : 'Reload'} variant="ghost" icon="refresh" onPress={() => void loadForecast()} loading={forecastLoading} testID={`${testID}-forecast-reload`} accessibilityLabel="Reload forecast" /> : null}
      </Row>

      <Select label="Group" options={groups.map((g) => ({ value: g.id, label: `${g.name} (${new Set([...g.leaders, ...g.members]).size})` }))} value={draft.group_id || ''} onChange={(v) => applyGroup(v)} allowCustom={false} clearable testID={`${testID}-group`} disabled={readOnly} placeholder={groups.length ? 'Select a training group' : 'No training groups yet — add members below or create one on the Groups page'} help={diverges ? undefined : 'Picking a group invites its members.'} />
      {diverges ? (
        <Row gap={6} style={{ marginTop: -8, marginBottom: space.sm }}>
          <Ionicons name="warning" size={20} color={c.warning} />
          <Text style={{ color: c.warning, flex: 1 }} testID={`${testID}-group-diverges`}>{draft.invitees.length} invited members differ from the saved group.</Text>
        </Row>
      ) : null}

      <FieldShell label="INVITED MEMBERS" help={draft.invitees.length <= 1 ? 'Add group members or connected handlers so they can complete the same exercises with their dogs.' : undefined}>
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.surface }} testID={`${testID}-invitees`}>
          <Row style={{ paddingHorizontal: space.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surfaceAlt }}>
            <View style={{ flex: 1 }}><Muted>Member</Muted></View>
            {!readOnly ? (
              <>
                <Checkbox label="LEADER" value={allLeaders} onChange={(v) => set('invitees', draft.invitees.map((i) => ({ ...i, is_leader: i.user_id === me.id ? true : v })))} testID={`${testID}-all-leader`} style={{ minHeight: 36, width: 118 }} />
                <Checkbox label="MANDATORY" value={allMandatory} onChange={(v) => set('invitees', draft.invitees.map((i) => ({ ...i, is_mandatory: v })))} testID={`${testID}-all-mandatory`} style={{ minHeight: 36, width: 150 }} />
              </>
            ) : null}
          </Row>
          {draft.invitees.map((i) => {
            const u = userById(i.user_id);
            const isMe = i.user_id === me.id;
            return (
              <View key={i.user_id} testID={`${testID}-invitee-${i.user_id}`} style={{ paddingHorizontal: space.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Row>
                  {!readOnly ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={isMe ? 'You cannot remove yourself' : `Remove ${u?.name || 'member'}`} accessibilityState={{ disabled: isMe }} disabled={isMe} onPress={() => removeInvitee(i.user_id)} testID={`${testID}-invitee-${i.user_id}-remove`} style={{ minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center', opacity: isMe ? 0.35 : 1 }}>
                      <Ionicons name="close" size={22} color={c.danger} />
                    </Pressable>
                  ) : null}
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.primary, fontWeight: '700' }}>{(u?.first_name?.[0] || '?') + (u?.last_name?.[0] || '')}</Text></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1}>{u?.name || i.user_id}{isMe ? ' (Me)' : ''}</Text>
                    <Muted numberOfLines={1}>{u?.email || ''}</Muted>
                  </View>
                  {!readOnly ? (
                    <>
                      <Checkbox label="Leader" value={i.is_leader} onChange={(v) => setInvitee(i.user_id, { is_leader: isMe ? true : v })} disabled={isMe} testID={`${testID}-invitee-${i.user_id}-leader`} style={{ minHeight: 36, width: 118 }} />
                      <Checkbox label="Mandatory" value={i.is_mandatory} onChange={(v) => setInvitee(i.user_id, { is_mandatory: v })} testID={`${testID}-invitee-${i.user_id}-mandatory`} style={{ minHeight: 36, width: 150 }} />
                    </>
                  ) : null}
                </Row>
                <Row style={{ marginTop: 4, paddingLeft: readOnly ? 44 : 80 }} wrap>
                  {isMe && !i.is_mandatory ? (
                    <Segmented label="Your answer" options={ATTENDANCE_ANSWERS.map((a) => ({ value: a.value, label: a.label }))} value={i.response} onChange={(v) => setInvitee(i.user_id, { response: v })} testID={`${testID}-my-response`} />
                  ) : (
                    <Muted testID={`${testID}-invitee-${i.user_id}-response`}>{i.is_mandatory ? 'Attending (mandatory)' : `Answer: ${respLabel(i.response)}`}{i.is_leader ? ' · Leader' : ''}</Muted>
                  )}
                </Row>
              </View>
            );
          })}
          {!readOnly ? (
            <Row wrap style={{ padding: space.sm }} justify="space-between">
              <Button title="Add members" variant="secondary" icon="person-add-outline" onPress={() => setAddOpen(true)} testID={`${testID}-add-members`} />
              {group ? (
                <Row wrap>
                  <Muted>GROUP:</Muted>
                  <Button title="Update" variant="ghost" icon="refresh" onPress={() => void updateGroup()} testID={`${testID}-group-update`} accessibilityLabel={`Update group ${group.name} with the current members`} disabled={!diverges} />
                  <Button title="+ New" variant="ghost" onPress={() => setNewGroupOpen(true)} testID={`${testID}-group-new`} accessibilityLabel="Save the current members as a new group" />
                </Row>
              ) : draft.invitees.length > 1 ? <Button title="Save as new group" variant="ghost" onPress={() => setNewGroupOpen(true)} testID={`${testID}-group-new`} /> : null}
            </Row>
          ) : null}
        </View>
      </FieldShell>
      {!readOnly ? <Switch label="Optional attendance" help="Invitees answer Undecided / Attend / Decline instead of being marked mandatory." value={draft.optional_attendance} onChange={(v) => onChange({ ...draft, optional_attendance: v, invitees: draft.invitees.map((i) => ({ ...i, is_mandatory: !v })) })} testID={`${testID}-optional-attendance`} /> : null}

      <Pressable accessibilityRole="button" accessibilityLabel="Optional: Tags, Comments, Files and more" accessibilityState={{ expanded: optionalOpen }} testID={`${testID}-optional-toggle`} onPress={() => setOptionalOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space.sm, marginTop: space.sm, marginBottom: space.sm }}>
        <Ionicons name="settings-outline" size={22} color={c.primary} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>OPTIONAL: Tags, Comments, Files and more</Text>
        <Ionicons name={optionalOpen ? 'chevron-up' : 'chevron-down'} size={22} color={c.muted} />
      </Pressable>
      {optionalOpen ? (
        <View style={{ paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: c.border }}>
          <Muted style={{ marginBottom: space.sm }}>TIP: record your public demos with a Demonstration tag.</Muted>
          <TextField label="Venue Contact" value={draft.venue_contact || ''} onChangeText={(v) => set('venue_contact', v)} testID={`${testID}-venue-contact`} editable={!readOnly} help="Whoever gives group members access to the event property." />
          <VocabMultiSelect label="Tags" customType="event_tag" options={EVENT_TAGS} values={draft.tags} onChange={(v) => set('tags', v)} testID={`${testID}-tags`} disabled={readOnly} placeholder="Add tags" />
          <TextArea label="Comments to Group" value={draft.comments_to_group} onChangeText={(v) => set('comments_to_group', v)} testID={`${testID}-comments`} editable={!readOnly} minHeight={90} right={!readOnly ? <UseTemplateLink onPress={() => setTplOpen(true)} testID={`${testID}-comments-template`} /> : undefined} help="Shared with all invitees." />
          <TemplatePicker visible={tplOpen} onClose={() => setTplOpen(false)} scope="comments_to_group" currentText={draft.comments_to_group} onInsert={(t) => set('comments_to_group', draft.comments_to_group ? `${draft.comments_to_group}\n${t}` : t)} testID={`${testID}-templates`} />
          <FilesField ownerType="training_event" ownerId={draft.id} ids={draft.files} onChange={(ids) => set('files', ids)} readOnly={readOnly} help="Reference files shared with the training group — not included in the handler's completed report." testID={`${testID}-files`} />
        </View>
      ) : null}

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Add members" testID={`${testID}-add-members-sheet`}>
        <Muted style={{ marginBottom: space.sm }}>Connected handlers (from your groups and management). Handlers not listed can be connected on the Groups page.</Muted>
        {users.filter((u) => u.id !== me.id && (connections.includes(u.id) || u.roles.includes('handler') || u.roles.includes('trainer'))).map((u) => {
          const already = draft.invitees.some((i) => i.user_id === u.id);
          return (
            <Pressable key={u.id} accessibilityRole="checkbox" accessibilityState={{ checked: already }} accessibilityLabel={u.name} testID={`${testID}-add-member-${u.id}`} onPress={() => (already ? removeInvitee(u.id) : addInvitees([u.id]))} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: space.sm, paddingHorizontal: space.sm, borderRadius: radius.sm, backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
              <Ionicons name={already ? 'checkbox' : 'square-outline'} size={24} color={already ? c.primary : c.muted} />
              <View style={{ flex: 1 }}><Text>{u.name}</Text><Muted>{u.email}{u.department ? ` · ${u.department}` : ''}</Muted></View>
            </Pressable>
          );
        })}
        <Button title="Done" onPress={() => setAddOpen(false)} testID={`${testID}-add-members-done`} style={{ marginTop: space.md }} />
      </Sheet>
      <Sheet visible={newGroupOpen} onClose={() => setNewGroupOpen(false)} title="Save as new group" testID={`${testID}-new-group-sheet`} maxWidth={440}>
        <TextField label="Group name" value={newGroupName} onChangeText={setNewGroupName} testID={`${testID}-new-group-name`} placeholder="e.g. Alpha1 Training Team" />
        <Row justify="flex-end"><Button title="Cancel" variant="secondary" onPress={() => setNewGroupOpen(false)} /><Button title="Save group" onPress={() => void saveNewGroup()} testID={`${testID}-new-group-save`} /></Row>
      </Sheet>
    </View>
  );
}

/** Duration (Hours:Mins) — h:mm text with ▲▼ 15-minute steppers; stored as minutes. */
export function DurationField({ value, onChange, readOnly, error, testID, label = 'Duration (Hours:Mins)' }: { value: number | null; onChange: (v: number | null) => void; readOnly?: boolean; error?: string; testID: string; label?: string }) {
  const c = useColors();
  const fmt = (m: number | null) => (m == null ? '' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
  const [text, setText] = useState(fmt(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setText(fmt(value)); }
  const commit = (t: string) => {
    setText(t);
    const s = t.trim();
    if (!s) { setSeen(null); onChange(null); return; }
    const m = /^(\d{1,3})(?::(\d{1,2}))?$/.exec(s);
    if (!m) return;
    const mins = parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
    setSeen(mins);
    onChange(mins);
  };
  const step = (d: number) => { const n = Math.max(0, (value || 0) + d); setSeen(n); setText(fmt(n)); onChange(n); };
  return (
    <Row align="flex-start" gap={space.sm}>
      <View style={{ marginTop: 30 }} accessibilityElementsHidden importantForAccessibility="no"><Ionicons name="time-outline" size={22} color={c.primary} /></View>
      <TextField label={label} value={text} onChangeText={commit} placeholder="2:00" testID={testID} editable={!readOnly} error={error} keyboardType="numbers-and-punctuation" containerStyle={{ flex: 1, maxWidth: 220 }} help="Hours:minutes, e.g. 2:00." />
      {!readOnly ? (
        <View style={{ marginTop: 26, flexDirection: 'row', gap: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Duration up 15 minutes" testID={`${testID}-up`} onPress={() => step(15)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.borderStrong, borderRadius: radius.md }}><Ionicons name="chevron-up" size={22} color={c.primary} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Duration down 15 minutes" testID={`${testID}-down`} onPress={() => step(-15)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.borderStrong, borderRadius: radius.md }}><Ionicons name="chevron-down" size={22} color={c.primary} /></Pressable>
        </View>
      ) : null}
    </Row>
  );
}
