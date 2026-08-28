// Report help — the "Help Topics" panel on the report dialog and the "When should I use this?" link
// under each mode card. Plain answers to the questions handlers actually ask about reports, written
// for someone standing in a kennel yard on a phone, not a manual.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Muted, Row, Sheet, Text, space, useColors } from '@/ui';

export interface HelpTopic { title: string; body: string }

export const HELP_TOPICS: HelpTopic[] = [
  {
    title: 'Standard or Custom — which one?',
    body: 'Standard uses every record you own, then narrows it with the dog and date filters below. '
      + 'Custom uses only the records you checkmarked on the Records page — pick it when you need a named '
      + 'handful of records (a court packet, one certification day) rather than a date range.',
  },
  {
    title: 'Which report type prints what?',
    body: 'Full Record prints one record with every field on it, for court or for a supervisor. '
      + 'Training Summary and Deployment Summary print totals and charts across many records. '
      + 'The Logs print one row per record. The Odor List prints one row per hide. '
      + 'Vet Visit and Vaccination Summary print veterinary history and what is due next.',
  },
  {
    title: 'How do I get a PDF?',
    body: 'DOWNLOAD (PDF) opens your browser’s print dialog against a print-ready copy of the report; '
      + 'choose “Save as PDF” as the destination. Landscape is already set, and every page carries the '
      + 'printed-by line and its page number.',
  },
  {
    title: 'What does CSV give me?',
    body: 'A spreadsheet file of the same rows — one header row and one line per record — for anyone who '
      + 'wants to sort or total the data themselves. Full Record reports have no CSV: they are one record, not a table.',
  },
  {
    title: 'Court history report',
    body: 'Standard mode · Full Record — Exercise · Date Range “All”, run for the dog in question. That is the '
      + 'complete training history a defence attorney asks for.',
  },
  {
    title: 'Why does a report show fewer records than I expect?',
    body: 'A report only ever includes records you are allowed to see, inside the date range, for the dog you picked. '
      + 'Drafts you never finished are counted separately — the line under the filters says how many completed records are included.',
  },
];

/** The mode cards' inline "When should I use this?" link. */
export function WhenToUseLink({ text, testID }: { text: string; testID?: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: space.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="When should I use this?"
        accessibilityState={{ expanded: open }}
        testID={testID}
        hitSlop={8}
        onPress={() => setOpen((v) => !v)}
        style={{ minHeight: 28, justifyContent: 'center' }}
      >
        <Row gap={4}>
          <Ionicons name={open ? 'chevron-down' : 'help-circle-outline'} size={18} color={c.primary} />
          <Text style={{ color: c.primary, textDecorationLine: 'underline' }}>When should I use this?</Text>
        </Row>
      </Pressable>
      {open ? <Muted style={{ marginTop: 2 }}>{text}</Muted> : null}
    </View>
  );
}

/** "Help Topics ▾" in the dialog header — opens the panel of answers above. */
export function HelpTopicsButton() {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Help Topics"
        testID="btn-help-topics"
        onPress={() => setOpen(true)}
        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm }}
      >
        <Row gap={4}>
          <Ionicons name="help-buoy-outline" size={20} color={c.primary} />
          <Text style={{ color: c.primary }}>Help Topics</Text>
          <Ionicons name="chevron-down" size={16} color={c.primary} />
        </Row>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Help Topics — reports" testID="sheet-help-topics">
        {HELP_TOPICS.map((t) => (
          <View key={t.title} style={{ marginBottom: space.md }}>
            <Text variant="bodyStrong">{t.title}</Text>
            <Muted style={{ marginTop: 2 }}>{t.body}</Muted>
          </View>
        ))}
      </Sheet>
    </>
  );
}
