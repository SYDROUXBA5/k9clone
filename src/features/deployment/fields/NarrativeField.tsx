// Narrative textarea (32k) with USE TEMPLATE: the handler's saved templates + shipped samples +
// previous narratives of the same record type. Picking inserts (appends when the box already has text).
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { NarrativeTemplate } from '@/db/types';
import { COMMENTS_MAX } from '@/db/vocab';
import { Button, Muted, Row, Sheet, Text, TextArea, useColors, useToast, radius, space } from '@/ui';

export interface NarrativeChoice { name: string; text: string; group: 'My templates' | 'Sample narratives' | 'Previous narratives' }

export function NarrativeField({ label, value, onChange, required, error, help, testID = 'input-narrative', disabled, samples = [], previous = [], templateScope = 'comments', minHeight = 180, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; error?: string | null; help?: string; testID?: string; disabled?: boolean;
  samples?: { name: string; text: string }[]; previous?: { name: string; text: string }[]; templateScope?: NarrativeTemplate['scope']; minHeight?: number; placeholder?: string;
}) {
  const c = useColors();
  const repo = useRepo();
  const toast = useToast();
  const actor = repo.getActor();
  const mine = useList('narrative_template', (t) => t.owner_user_id === actor && (t.scope === templateScope || t.scope === 'any'));
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const choices: NarrativeChoice[] = [
    ...mine.map((t) => ({ name: t.name, text: t.text, group: 'My templates' as const })),
    ...samples.map((s) => ({ ...s, group: 'Sample narratives' as const })),
    ...previous.map((p) => ({ ...p, group: 'Previous narratives' as const })),
  ];
  const groups = ['My templates', 'Sample narratives', 'Previous narratives'] as const;
  const use = (t: string) => {
    onChange(value.trim() ? `${value.trimEnd()}\n\n${t}` : t);
    setOpen(false);
  };
  const saveTemplate = async () => {
    const name = templateName.trim();
    if (!name) { toast.show('Give the template a name.', 'error'); return; }
    if (!value.trim()) { toast.show('Nothing to save — the narrative is empty.', 'error'); return; }
    await repo.upsert('narrative_template', { name, text: value, scope: templateScope, owner_user_id: actor || 'system' }, { label: `Template: ${name}` });
    toast.show(`Template "${name}" saved`);
    setTemplateName('');
    setSaveOpen(false);
  };
  return (
    <View>
      <TextArea
        label={label}
        required={required}
        value={value}
        onChangeText={onChange}
        error={error}
        help={help}
        testID={testID}
        editable={!disabled}
        maxLength={COMMENTS_MAX}
        minHeight={minHeight}
        placeholder={placeholder ?? "Describe the incident as a whole — the K9 team's successes, failures and final outcomes."}
        right={!disabled ? (
          <Row gap={space.xs}>
            <Button title="USE TEMPLATE" variant="ghost" icon="document-text-outline" onPress={() => setOpen(true)} testID={`${testID}-use-template`} style={{ minHeight: 36, paddingVertical: 4 }} />
            <Button title="Save as template" variant="ghost" onPress={() => setSaveOpen(true)} testID={`${testID}-save-template`} style={{ minHeight: 36, paddingVertical: 4 }} />
          </Row>
        ) : undefined}
      />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Use template" testID={`${testID}-template-sheet`} maxWidth={640}>
        {choices.length === 0 ? <Muted>No templates yet. Write a narrative and choose “Save as template”.</Muted> : null}
        {groups.map((g) => {
          const list = choices.filter((x) => x.group === g);
          if (!list.length) return null;
          return (
            <View key={g} style={{ marginBottom: space.md }}>
              <Text variant="label" color="muted" style={{ marginBottom: space.xs }}>{g}</Text>
              {list.map((t, i) => (
                <Pressable key={`${g}-${i}`} accessibilityRole="button" accessibilityLabel={`Use template ${t.name}`} testID={`template-${g.toLowerCase().replace(/\s+/g, '-')}-${i}`} onPress={() => use(t.text)} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.item, { borderColor: c.border, backgroundColor: pressed || hovered ? c.surfaceAlt : c.surface }]}>
                  <Text variant="bodyStrong">{t.name}</Text>
                  <Muted numberOfLines={3}>{t.text}</Muted>
                </Pressable>
              ))}
            </View>
          );
        })}
      </Sheet>
      <Sheet visible={saveOpen} onClose={() => setSaveOpen(false)} title="Save as template" testID={`${testID}-save-sheet`} maxWidth={480}
        footer={<Row justify="flex-end"><Button title="Cancel" variant="secondary" onPress={() => setSaveOpen(false)} /><Button title="Save template" onPress={() => void saveTemplate()} testID={`${testID}-save-template-confirm`} /></Row>}
      >
        <TextArea label="Template name" value={templateName} onChangeText={setTemplateName} minHeight={48} testID={`${testID}-template-name`} placeholder="e.g. Vehicle sniff — standard" />
        <Muted>The current narrative text is saved under this name for USE TEMPLATE next time.</Muted>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, gap: 4 },
});
