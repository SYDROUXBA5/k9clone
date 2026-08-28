// Select / MultiSelect — dropdowns that ALSO accept a typed custom value ("type it in and we'll add
// it to the dropdown for next time"). Opens a searchable sheet on every platform (one-handed on
// phone, keyboard-friendly on desktop: type to filter, Enter picks the highlighted/typed value).
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { FieldShell } from './Field';
import { Sheet } from './Modal';
import { Muted, Text } from './Text';
import { useInputStyle } from './TextField';
import { useColors } from './theme';
import { control, radius, space } from './tokens';

export interface SelectOption { value: string; label?: string; group?: string; description?: string }
export type OptionInput = string | SelectOption;
export const toOption = (o: OptionInput): SelectOption => (typeof o === 'string' ? { value: o, label: o } : { ...o, label: o.label ?? o.value });

interface CommonProps {
  label: string;
  required?: boolean;
  error?: string | null;
  help?: string;
  testID?: string;
  options: readonly OptionInput[];
  /** Accept values not in the list (default true). */
  allowCustom?: boolean;
  /** Options that are listed but cannot be picked (already used elsewhere in the form). */
  disabledValues?: readonly string[];
  /** One line saying WHY those options are greyed out — shown under each of them. */
  disabledHint?: string;
  /** Called when the user picks a value not in the list — persist it (CustomEntry). */
  onCustomValue?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  /** Max length of a typed custom value (the search box enforces it). */
  maxLength?: number;
  containerStyle?: object;
}

export interface SelectProps extends CommonProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  clearable?: boolean;
}

export function Select({ label, required, error, help, testID, options, allowCustom = true, disabledValues, disabledHint, onCustomValue, value, onChange, placeholder = 'Select…', disabled, clearable, containerStyle, maxLength }: SelectProps) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const opts = useMemo(() => options.map(toOption), [options]);
  const current = opts.find((o) => o.value === value);
  const shown = current ? current.label : value || '';
  const style = useInputStyle(open, error);
  return (
    <FieldShell label={label} required={required} error={error} help={help} style={containerStyle}>
      {/* The trigger and the clear control are SIBLINGS in a row: a button must never nest a button. */}
      <View style={[style, styles.trigger, disabled ? { opacity: 0.6 } : null, { paddingHorizontal: 0, paddingVertical: 0 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityValue={{ text: shown || placeholder }}
          accessibilityState={{ expanded: open, disabled }}
          testID={testID}
          disabled={disabled}
          onPress={() => setOpen(true)}
          style={styles.triggerMain}
        >
          <Text style={{ flex: 1, color: shown ? c.text : c.muted }} numberOfLines={1}>{shown || placeholder}</Text>
          {!(clearable && shown) ? <Ionicons name="chevron-down" size={20} color={c.muted} /> : null}
        </Pressable>
        {clearable && shown && !disabled ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} testID={testID ? `${testID}-clear` : undefined} onPress={() => onChange('')} hitSlop={8} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={20} color={c.muted} />
          </Pressable>
        ) : null}
      </View>
      <OptionSheet
        visible={open}
        title={label}
        options={opts}
        selected={value ? [value] : []}
        allowCustom={allowCustom}
        disabledValues={disabledValues}
        disabledHint={disabledHint}
        maxLength={maxLength}
        onClose={() => setOpen(false)}
        onPick={(v, isCustom) => { onChange(v); if (isCustom) onCustomValue?.(v); setOpen(false); }}
        testID={testID ? `${testID}-sheet` : undefined}
      />
    </FieldShell>
  );
}

export interface MultiSelectProps extends CommonProps {
  values: string[];
  onChange: (values: string[]) => void;
}

/** Chips + add button; the picker sheet toggles items and accepts typed custom values. */
export function MultiSelect({ label, required, error, help, testID, options, allowCustom = true, onCustomValue, values, onChange, placeholder = 'Add…', disabled, containerStyle, maxLength }: MultiSelectProps) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const opts = useMemo(() => options.map(toOption), [options]);
  const style = useInputStyle(open, error);
  const labelOf = (v: string) => opts.find((o) => o.value === v)?.label || v;
  return (
    <FieldShell label={label} required={required} error={error} help={help} style={containerStyle}>
      {/* Chips (each with its own remove button) sit NEXT TO the open-picker button, never inside it. */}
      <View
        accessibilityLabel={`${label}: ${values.length ? values.map(labelOf).join(', ') : 'none'}`}
        style={[style, styles.trigger, { flexWrap: 'wrap', gap: 6, paddingVertical: 6, paddingRight: 6, minHeight: control.inputHeight }, disabled ? { opacity: 0.6 } : null]}
      >
        {values.map((v) => (
          <View key={v} style={[styles.chip, { backgroundColor: c.primarySoft, borderColor: c.primarySoft }]}>
            <Text style={{ color: c.primary, fontSize: 16, lineHeight: 20 }}>{labelOf(v)}</Text>
            {!disabled ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${labelOf(v)}`} testID={testID ? `${testID}-remove-${slug(v)}` : undefined} onPress={() => onChange(values.filter((x) => x !== v))} hitSlop={8} style={{ marginLeft: 4, minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={18} color={c.primary} />
              </Pressable>
            ) : null}
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityValue={{ text: values.length ? values.map(labelOf).join(', ') : placeholder }}
          accessibilityState={{ expanded: open, disabled }}
          testID={testID}
          disabled={disabled}
          onPress={() => setOpen(true)}
          style={{ flex: 1, minWidth: 140, flexDirection: 'row', alignItems: 'center', minHeight: 32, gap: 6 }}
        >
          <Text style={{ flex: 1, color: c.muted }} numberOfLines={1}>{values.length === 0 ? placeholder : 'Add more…'}</Text>
          <Ionicons name="add-circle-outline" size={22} color={c.muted} />
        </Pressable>
      </View>
      <OptionSheet
        visible={open}
        title={label}
        options={opts}
        selected={values}
        multi
        allowCustom={allowCustom}
        maxLength={maxLength}
        onClose={() => setOpen(false)}
        onPick={(v, isCustom) => {
          if (values.includes(v)) onChange(values.filter((x) => x !== v));
          else { onChange([...values, v]); if (isCustom) onCustomValue?.(v); }
        }}
        testID={testID ? `${testID}-sheet` : undefined}
      />
    </FieldShell>
  );
}

function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function OptionSheet({ visible, title, options, selected, multi, allowCustom, disabledValues, disabledHint, maxLength, onClose, onPick, testID }: {
  visible: boolean; title: string; options: SelectOption[]; selected: string[]; multi?: boolean; allowCustom: boolean;
  disabledValues?: readonly string[]; disabledHint?: string;
  maxLength?: number; onClose: () => void; onPick: (v: string, isCustom: boolean) => void; testID?: string;
}) {
  const c = useColors();
  const [q, setQ] = useState('');
  const query = q.trim();
  const blocked = useMemo(() => new Set((disabledValues || []).map((v) => v.trim().toLowerCase())), [disabledValues]);
  const isBlocked = (v: string) => blocked.has(v.trim().toLowerCase());
  const filtered = query ? options.filter((o) => (o.label || o.value).toLowerCase().includes(query.toLowerCase())) : options;
  const exact = options.some((o) => (o.label || o.value).toLowerCase() === query.toLowerCase());
  const showCustom = allowCustom && query.length > 0 && !exact;
  const close = () => { setQ(''); onClose(); };
  const submitTyped = () => {
    if (!query) return;
    if (isBlocked(query)) return;
    if (showCustom) onPick(query, true);
    else if (filtered[0] && !isBlocked(filtered[0].value)) onPick(filtered[0].value, false);
    setQ('');
    if (!multi) close();
  };
  // group options
  const groups = new Map<string, SelectOption[]>();
  for (const o of filtered) {
    const g = o.group || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(o);
  }
  return (
    <Sheet visible={visible} onClose={close} title={title} testID={testID} scroll={false}
      footer={multi ? <Pressable accessibilityRole="button" onPress={close} testID="btn-done-select" style={[styles.doneBtn, { backgroundColor: c.primary }]}><Text style={{ color: c.primaryText, fontWeight: '600' }}>Done</Text></Pressable> : undefined}
    >
      <View style={[styles.searchRow, { borderColor: c.borderStrong, backgroundColor: c.surface }]}>
        <Ionicons name="search" size={20} color={c.muted} style={{ marginRight: 8 }} />
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={submitTyped}
          maxLength={maxLength}
          autoFocus={Platform.OS === 'web'}
          placeholder={allowCustom ? 'Search or type a new value' : 'Search'}
          placeholderTextColor={c.muted}
          accessibilityLabel={`Search ${title}`}
          testID="input-select-search"
          style={[{ flex: 1, fontSize: 16, lineHeight: 22, color: c.text, minHeight: 40 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
          returnKeyType="done"
        />
      </View>
      <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
        {showCustom ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Use "${query}"`} testID="option-custom" onPress={() => { onPick(query, true); setQ(''); if (!multi) close(); }} style={({ pressed }) => [styles.option, { backgroundColor: pressed ? c.primarySoft : c.accentSoft }]}>
            <Ionicons name="add-circle" size={22} color={c.accent} style={{ marginRight: 10 }} />
            <Text style={{ flex: 1 }}>Use “{query}”</Text>
            <Muted>new</Muted>
          </Pressable>
        ) : null}
        {[...groups.entries()].map(([g, list]) => (
          <View key={g || '_'}>
            {g ? <Text variant="label" color="muted" style={{ paddingHorizontal: space.md, paddingTop: space.sm }}>{g}</Text> : null}
            {list.map((o) => {
              const isSel = selected.includes(o.value);
              const off = !isSel && isBlocked(o.value);
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole={multi ? 'checkbox' : 'menuitem'}
                  accessibilityState={{ selected: isSel, checked: multi ? isSel : undefined, disabled: off }}
                  accessibilityLabel={off && disabledHint ? `${o.label || o.value} — ${disabledHint}` : (o.label || o.value)}
                  testID={`option-${slug(o.value)}`}
                  disabled={off}
                  onPress={() => { if (off) return; onPick(o.value, false); if (!multi) close(); }}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.option, { backgroundColor: !off && (pressed || hovered) ? c.surfaceAlt : 'transparent', opacity: off ? 0.45 : 1 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: isSel ? c.primary : c.text, fontWeight: isSel ? '600' : '400' }}>{o.label || o.value}</Text>
                    {off && disabledHint ? <Muted>{disabledHint}</Muted> : o.description ? <Muted>{o.description}</Muted> : null}
                  </View>
                  {isSel ? <Ionicons name={multi ? 'checkbox' : 'checkmark'} size={22} color={c.primary} />
                    : off ? <Ionicons name="ban-outline" size={20} color={c.muted} />
                      : multi ? <Ionicons name="square-outline" size={22} color={c.muted} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        {filtered.length === 0 && !showCustom ? <Muted style={{ padding: space.md }}>No matches.</Muted> : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  triggerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch', paddingHorizontal: space.md, paddingVertical: 10, minHeight: control.inputHeight - 2 },
  clearBtn: { minWidth: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingRight: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.sm, marginHorizontal: space.md, marginTop: space.md, marginBottom: space.sm, minHeight: 46 },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 12, minHeight: 48 },
  doneBtn: { minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
