// "Download Invoice/Receipt" (PT-BIL-05). No payment processor is wired, but that is no reason to
// hand back a toast: the subscription MODEL is real, so the receipt of it is real too, and a finance
// office raising a purchase order needs exactly this page. It prints, and it says on its face that
// nothing was charged.
//
// Printing: on the web the receipt is written into a hidden same-document iframe and that iframe is
// printed, which keeps it out of popup-blocker territory and lets the browser's own dialog offer
// "Save as PDF". On a phone there is no print vendor in v1, so the sheet says so rather than
// pretending a file appeared somewhere.
import React from 'react';
import { Platform, View } from 'react-native';
import { APP_NAME } from '@/config';
import { Button, Muted, Row, Sheet, Text, useColors, space } from '@/ui';
import { receiptHtml, type Receipt } from './billingModel';

export function printReceipt(r: Receipt): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) { frame.remove(); return false; }
  doc.open();
  doc.write(receiptHtml(r, APP_NAME));
  doc.close();
  const win = frame.contentWindow;
  const go = () => {
    try { win.focus(); win.print(); } finally { setTimeout(() => frame.remove(), 1000); }
  };
  if (doc.readyState === 'complete') go(); else frame.onload = go;
  return true;
}

export function ReceiptSheet({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  const c = useColors();
  if (!receipt) return null;
  const canPrint = Platform.OS === 'web';
  return (
    <Sheet
      visible
      onClose={onClose}
      title={`Receipt ${receipt.number}`}
      testID="dialog-receipt"
      maxWidth={620}
      footer={(
        <Row justify="flex-end" wrap>
          <Button title="Close" variant="secondary" onPress={onClose} testID="btn-close-receipt" />
          {canPrint ? (
            <Button title="Print / Save as PDF" icon="print-outline" onPress={() => printReceipt(receipt)} testID="btn-print-receipt" />
          ) : null}
        </Row>
      )}
    >
      <View testID="receipt-body">
        <Muted>Issued {receipt.issuedAt}</Muted>
        <View style={{ marginTop: space.md }}>
          <ReceiptRow k="Billed to" v={receipt.billedTo} />
          <ReceiptRow k="Email" v={receipt.billedToEmail} />
          <ReceiptRow k="Department" v={receipt.department} />
          {receipt.lines.map((l) => <ReceiptRow key={l.label} k={l.label} v={l.value} strong={l.strong} />)}
        </View>
        <Row justify="space-between" wrap style={{ marginTop: space.md, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: c.border }}>
          <Text variant="h3">{receipt.totalLabel}</Text>
          <Text variant="h3" testID="text-receipt-total">{receipt.totalValue}</Text>
        </Row>
        <Muted style={{ marginTop: space.md }} testID="text-receipt-footnote">{receipt.footnote}</Muted>
        {!canPrint ? (
          <Muted style={{ marginTop: space.sm }}>Printing needs a browser in this version — open {APP_NAME} on a computer to save it as a PDF.</Muted>
        ) : null}
      </View>
    </Sheet>
  );
}

function ReceiptRow({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  const c = useColors();
  return (
    <View testID={`receipt-row-${k.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} style={{ borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Row justify="space-between" wrap style={{ paddingVertical: 6 }}>
        <Muted style={{ flex: 1, minWidth: 140 }}>{k}</Muted>
        <Text variant={strong ? 'bodyStrong' : 'body'} style={{ flex: 1, minWidth: 140, textAlign: 'right' }}>{v}</Text>
      </Row>
    </View>
  );
}
