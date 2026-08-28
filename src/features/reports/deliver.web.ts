// Web delivery: DOWNLOAD = print-to-PDF through the browser's own print dialog (Save as PDF), CSV =
// an in-memory blob handed to an anchor.
//
// Printing needs one trick. React Native Web lays the whole app out inside viewport-height flex
// containers with an `overflow: auto` scroller, so printing the live DOM produces a single blank
// page — everything below the fold is clipped. So we CLONE the report sheet into a plain block
// container appended to <body>, hide the app root for the duration of the print, and let the print
// stylesheet paginate the clone. The clone keeps the same class names, so it looks identical.
export interface DeliverResult { ok: boolean; message: string }

const STYLE_ID = 'k9clone-report-print-styles';
const PRINT_ROOT_ID = 'k9-print-root';
const PRINTING_CLASS = 'k9-printing';

export function canPrint(): boolean {
  return typeof window !== 'undefined' && typeof window.print === 'function';
}

/** Injected once per document; harmless to call on every report render. */
export function installPrintStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
#${PRINT_ROOT_ID} { display: none; }
@media print {
  /* Data tables are wide; portrait would cut them in half. */
  @page { size: letter landscape; margin: 12mm 12mm 16mm 12mm; }

  html.${PRINTING_CLASS}, html.${PRINTING_CLASS} body {
    height: auto !important; min-height: 0 !important; overflow: visible !important;
    background: #FFFFFF !important; counter-reset: k9page;
  }
  html.${PRINTING_CLASS} > body > #root, html.${PRINTING_CLASS} > body > #error-toast { display: none !important; }
  html.${PRINTING_CLASS} #${PRINT_ROOT_ID} { display: block !important; }

  /* React Native Web wraps content in overflow:auto scrollers that clip everything below the fold. */
  #${PRINT_ROOT_ID} * { overflow: visible !important; }
  /* …except the donut's own clipping windows: they ARE the chart's geometry, and letting them
     overflow throws the wedges across the page. This rule has to come after the blanket one. */
  #${PRINT_ROOT_ID} [data-k9-chart-clip] { overflow: hidden !important; }
  #${PRINT_ROOT_ID} [data-k9-report] {
    width: 100% !important; max-width: 100% !important; border: 0 !important; border-radius: 0 !important;
    padding: 0 !important; box-shadow: none !important;
  }
  [data-k9-noprint] { display: none !important; }

  /* Wide blocks (tables, the heatmap) scale down so a full row fits the printable width. */
  #${PRINT_ROOT_ID} [data-k9-wide] { zoom: 0.70; }

  [data-k9-band] {
    break-inside: avoid; page-break-inside: avoid;
    background: #EDEBE6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  [data-k9-block] { break-inside: avoid; page-break-inside: avoid; }
  [data-k9-heat] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  [data-k9-heat] > div > div { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  [data-k9-pagebreak] { break-before: page; page-break-before: always; }

  /* The per-page footer is drawn by the @page margin boxes (Chrome resolves counter(page) there and
     nowhere else), so the in-document footer is hidden — otherwise the last page printed it twice. */
  [data-k9-footer] { display: none !important; }

  /* Chart fills (donut wedges, grouped bars, legend swatches) are information, not decoration. */
  [data-k9-chart] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* React Native Web draws <Image> as a CSS background, and browsers drop backgrounds on paper by
     default — without this the uploaded Department Logo printed as an empty box (PT-PRO-05). */
  [data-testid="img-report-logo"], [data-testid="img-report-logo"] * {
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
}
`;
  document.head.appendChild(el);
}

const PAGE_STYLE_ID = 'k9clone-report-page-style';

function cssString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The repeating page footer. Only an @page margin box can resolve counter(page) in Chrome, and its
 *  content must be a literal string — so the printed-by line is baked in at print time. */
function installPageMarginBoxes(printedBy: string): void {
  document.getElementById(PAGE_STYLE_ID)?.remove();
  const el = document.createElement('style');
  el.id = PAGE_STYLE_ID;
  el.textContent = `@media print { @page {
  @bottom-left { content: ${cssString(printedBy)}; font-size: 9pt; color: #6B6A66; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 9pt; color: #6B6A66; }
} }`;
  document.head.appendChild(el);
}

function printedByText(): string {
  const el = document.querySelector('[data-k9-report] [data-k9-printedby]') as HTMLElement | null;
  return (el?.innerText || '').replace(/\s+/g, ' ').trim();
}

function cleanupPrintClone(): void {
  document.documentElement.classList.remove(PRINTING_CLASS);
  document.getElementById(PRINT_ROOT_ID)?.remove();
}

export function printReport(): DeliverResult {
  if (!canPrint()) return { ok: false, message: 'This browser cannot open a print dialog.' };
  installPrintStyles();
  const sheet = document.querySelector('[data-k9-report]');
  if (!sheet) {
    window.setTimeout(() => window.print(), 60);
    return { ok: true, message: 'Print dialog opened — choose “Save as PDF” to download the report.' };
  }
  installPageMarginBoxes(printedByText());
  cleanupPrintClone();
  const holder = document.createElement('div');
  holder.id = PRINT_ROOT_ID;
  holder.appendChild(sheet.cloneNode(true));
  document.body.appendChild(holder);
  document.documentElement.classList.add(PRINTING_CLASS);

  const done = () => { cleanupPrintClone(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  // Let the clone lay out before the (blocking) dialog freezes paint.
  window.setTimeout(() => {
    try { window.print(); } finally { window.setTimeout(done, 300); }
  }, 80);
  return { ok: true, message: 'Print dialog opened — choose “Save as PDF” to download the report.' };
}

/** Test hook: build the print clone without opening the dialog, so the layout can be inspected. */
export function buildPrintPreview(): boolean {
  installPrintStyles();
  const sheet = document.querySelector('[data-k9-report]');
  if (!sheet) return false;
  installPageMarginBoxes(printedByText());
  cleanupPrintClone();
  const holder = document.createElement('div');
  holder.id = PRINT_ROOT_ID;
  holder.appendChild(sheet.cloneNode(true));
  document.body.appendChild(holder);
  document.documentElement.classList.add(PRINTING_CLASS);
  return true;
}

export function downloadCsv(filename: string, text: string): DeliverResult {
  // The BOM keeps Excel from mangling accented text on a double-click open.
  return downloadFile(filename, `\uFEFF${text}`, 'text/csv;charset=utf-8');
}

/** Generic in-memory download — CSV, the web-page export and the plain-text export all use it. */
export function downloadFile(filename: string, text: string, mime: string): DeliverResult {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    return { ok: true, message: `${filename} downloaded.` };
  } catch (e) {
    return { ok: false, message: `Could not build the file: ${(e as Error).message}` };
  }
}

/** The report as a standalone web page: the sheet's markup plus every stylesheet the app injected,
 *  so the saved file looks like what was on screen with no network access. */
export function reportHtml(title: string): string | null {
  const sheet = document.querySelector('[data-k9-report]') as HTMLElement | null;
  if (!sheet) return null;
  const css = [...document.querySelectorAll('style')].map((el) => el.textContent || '').join('\n');
  const esc = (v: string) => v.replace(/[&<>]/g, (ch) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>body { margin: 0; padding: 16px; background: #F6F5F2; font-family: system-ui, sans-serif; }</style>
<style>${css}</style>
</head><body>${sheet.outerHTML}</body></html>`;
}

/** The report as plain text — the same reading order, for anyone pasting it into a case file. */
export function reportText(): string | null {
  const sheet = document.querySelector('[data-k9-report]') as HTMLElement | null;
  if (!sheet) return null;
  return (sheet.innerText || '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
