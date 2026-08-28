// Native delivery of a report: no browser print dialog and no file download, so the app says what it
// can do instead of failing silently. Web overrides this module (deliver.web.ts).
export interface DeliverResult { ok: boolean; message: string }

export function canPrint(): boolean {
  return false;
}

export function printReport(): DeliverResult {
  return { ok: false, message: 'Printing to PDF is available in the web app. Open this report at the K9CLONE web address to print or save it.' };
}

export function downloadCsv(_filename: string, _text: string): DeliverResult {
  void _filename;
  void _text;
  return { ok: false, message: 'CSV download is available in the web app.' };
}

export function downloadFile(_filename: string, _text: string, _mime: string): DeliverResult {
  return { ok: false, message: 'File downloads are available in the web app.' };
}

export function reportHtml(_title: string): string | null {
  return null;
}

export function reportText(): string | null {
  return null;
}

export function installPrintStyles(): void {
  /* web only */
}

export function buildPrintPreview(): boolean {
  return false;
}
