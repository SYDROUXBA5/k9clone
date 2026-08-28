// Select/MultiSelect wired to CustomEntry: options = vocabulary defaults + remembered custom values
// (mine + department-standard shared ones); a typed value is saved as a CustomEntry for next time.
import React, { useMemo } from 'react';
import { useList, useRepo } from '@/db/provider';
import type { CustomEntryType } from '@/db/types';
import { MultiSelect, Select, toOption, type MultiSelectProps, type OptionInput, type SelectProps } from './Select';

function useMergedOptions(type: CustomEntryType | string, options: readonly OptionInput[]) {
  const repo = useRepo();
  const actor = repo.getActor();
  const custom = useList('custom_entry', (e) => e.type === type && (e.owner_user_id === actor || e.is_shared_standard));
  const merged = useMemo(() => {
    const base = options.map(toOption);
    const seen = new Set(base.map((o) => o.value.toLowerCase()));
    const extra = custom
      .filter((e) => !seen.has(e.value.toLowerCase()))
      .sort((a, b) => a.value.localeCompare(b.value))
      .map((e) => ({ value: e.value, label: e.value, group: e.is_shared_standard ? 'Department standard' : 'My entries' }));
    return [...base, ...extra];
  }, [custom, options]);
  const remember = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const existing = custom.find((e) => e.value.toLowerCase() === v.toLowerCase());
    if (existing) {
      void repo.upsert('custom_entry', { id: existing.id, use_count: (existing.use_count || 0) + 1 }, { silent: true });
      return;
    }
    void repo.upsert('custom_entry', { type, value: v, is_shared_standard: false, use_count: 1, owner_user_id: actor || 'system' }, { label: `Custom entry: ${v}` });
  };
  return { merged, remember };
}

export function VocabSelect({ customType, options, onCustomValue, ...rest }: SelectProps & { customType: CustomEntryType | string }) {
  const { merged, remember } = useMergedOptions(customType, options);
  return <Select {...rest} options={merged} onCustomValue={(v) => { remember(v); onCustomValue?.(v); }} />;
}

export function VocabMultiSelect({ customType, options, onCustomValue, ...rest }: MultiSelectProps & { customType: CustomEntryType | string }) {
  const { merged, remember } = useMergedOptions(customType, options);
  return <MultiSelect {...rest} options={merged} onCustomValue={(v) => { remember(v); onCustomValue?.(v); }} />;
}
