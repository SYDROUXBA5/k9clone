// USE TEMPLATE — inserts a saved NarrativeTemplate, one of the handler's previous narratives (last 5
// Handler Comments) or a professional sample into a textarea. Also lets the user save the current
// text as a new template.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { NarrativeTemplate } from '@/db/types';
import { Button, Muted, Row, Sheet, Text, TextField, fmtDate, space, useColors, useToast, radius } from '@/ui';

// [OURS] short professional samples — the vendor ships "sample templates" whose text is not public.
const SAMPLES: Array<{ name: string; scope: NarrativeTemplate['scope']; text: string }> = [
  { name: 'Sample — detection sniff', scope: 'comments', text: 'K9 was deployed on a 6-ft lead to conduct a systematic exterior sniff. Handler started downwind and worked each area in a clockwise pattern. K9 displayed a change of behavior (head snap, closed-mouth breathing) at the source and gave a trained final response. Reward delivered at source.' },
  { name: 'Sample — patrol scenario', scope: 'comments', text: 'SCENARIO synopsis: K9 team responded to a simulated burglary in progress. K9 tracked the decoy across mixed terrain, cleared the building and made a controlled apprehension on the bite suit. Recall was clean. Handler debriefed with the monitor.' },
  { name: 'Sample — exercise goal', scope: 'goal', text: 'Handlers will practise reading their dog’s change of behavior and rewarding at source. Focus on lead handling and search pattern.' },
  { name: 'Sample — comments to group', scope: 'comments_to_group', text: 'Bring long lines, reward toys and water for your dog. Meet at the yard gate ten minutes before start.' },
];

export function TemplatePicker({ visible, onClose, scope, onInsert, currentText, previous, testID = 'templates' }: {
  visible: boolean; onClose: () => void; scope: NarrativeTemplate['scope']; onInsert: (text: string) => void; currentText?: string; previous?: Array<{ text: string; when: string | null; label?: string }>; testID?: string;
}) {
  const c = useColors();
  const repo = useRepo();
  const toast = useToast();
  const actor = repo.getActor();
  const mine = useList('narrative_template', (t) => t.owner_user_id === actor && (t.scope === scope || t.scope === 'any'));
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const item = (key: string, title: string, sub: string | undefined, text: string, tid: string) => (
    <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Insert ${title}`} testID={tid} onPress={() => { onInsert(text); onClose(); }} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [{ paddingVertical: 10, paddingHorizontal: space.sm, borderRadius: radius.sm, minHeight: 48, backgroundColor: pressed || hovered ? c.surfaceAlt : 'transparent' }]}>
      <Text variant="bodyStrong">{title}</Text>
      {sub ? <Muted>{sub}</Muted> : null}
      <Muted numberOfLines={2}>{text}</Muted>
    </Pressable>
  );
  const saveCurrent = async () => {
    if (!currentText || !currentText.trim()) { toast.show('Nothing to save — the text is empty.', 'error'); return; }
    if (!saveName.trim()) { toast.show('Give the template a name.', 'error'); return; }
    setSaving(true);
    await repo.upsert('narrative_template', { owner_user_id: actor || 'system', name: saveName.trim(), text: currentText, scope }, { label: `Template: ${saveName.trim()}` });
    setSaving(false);
    setSaveName('');
    toast.show('Template saved');
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Use template" testID={testID}>
      {mine.length ? (
        <View style={{ marginBottom: space.md }}>
          <Text variant="label" color="muted">My templates</Text>
          {mine.map((t) => item(t.id, t.name, undefined, t.text, `${testID}-mine-${t.id}`))}
        </View>
      ) : null}
      {previous && previous.length ? (
        <View style={{ marginBottom: space.md }}>
          <Text variant="label" color="muted">Previous narratives</Text>
          {previous.map((p, i) => item(`prev-${i}`, p.label || `Narrative ${i + 1}`, p.when ? fmtDate(p.when) : undefined, p.text, `${testID}-previous-${i + 1}`))}
        </View>
      ) : null}
      <View style={{ marginBottom: space.md }}>
        <Text variant="label" color="muted">Samples</Text>
        {SAMPLES.filter((s) => s.scope === scope || scope === 'any').map((s, i) => item(`s-${i}`, s.name, undefined, s.text, `${testID}-sample-${i + 1}`))}
      </View>
      {currentText !== undefined ? (
        <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.md }}>
          <Text variant="label" color="muted" style={{ marginBottom: 6 }}>Save the current text as a template</Text>
          <Row align="flex-start">
            <TextField label="Template name" hideLabel placeholder="Template name" value={saveName} onChangeText={setSaveName} testID={`${testID}-save-name`} containerStyle={{ flex: 1, marginBottom: 0 }} />
            <Button title="Save" variant="secondary" onPress={() => void saveCurrent()} loading={saving} testID={`${testID}-save`} />
          </Row>
        </View>
      ) : null}
    </Sheet>
  );
}

/** "USE TEMPLATE" link rendered above a textarea (goes in FieldShell.right). */
export function UseTemplateLink({ onPress, testID }: { onPress: () => void; testID: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Use template" testID={testID} onPress={onPress} style={{ minHeight: 32, justifyContent: 'center' }}>
      <Text variant="label" style={{ color: c.primary }}>USE TEMPLATE</Text>
    </Pressable>
  );
}
