// Numeric input on top of TextField: keeps what the user typed, emits a parsed number (or null when blank).
import React, { useState } from 'react';
import { TextField, type TextFieldProps } from '@/ui';
import { parseInt0, parseNum } from '../deploymentModel';

export interface NumberFieldProps extends Omit<TextFieldProps, 'value' | 'onChangeText' | 'onChange' | 'help'> {
  help?: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  integer?: boolean;
  suffix?: string;
}

export function NumberField({ value, onChange, integer, suffix, help, ...rest }: NumberFieldProps) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const [emitted, setEmitted] = useState<number | null>(value ?? null);
  // External change (prefill, template, normaliser) → re-sync the text; our own edits never re-format.
  if ((value ?? null) !== emitted) {
    setEmitted(value ?? null);
    setText(value == null ? '' : String(value));
  }
  const change = (t: string) => {
    const cleaned = t.replace(/[^0-9.,-]/g, '');
    setText(cleaned);
    const n = integer ? parseInt0(cleaned) : parseNum(cleaned);
    setEmitted(n);
    onChange(n);
  };
  return (
    <TextField
      {...rest}
      value={text}
      onChangeText={change}
      keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      inputMode={integer ? 'numeric' : 'decimal'}
      help={help || suffix}
      placeholder={rest.placeholder ?? (integer ? '0' : '0.0')}
    />
  );
}
