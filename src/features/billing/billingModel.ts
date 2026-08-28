// Seat / subscription model (bar §2.20, §8; checklist PT-BIL-01…07).
// v1 changes the MODEL only — nothing here talks to a payment processor, and every button that would
// normally charge a card says so ("Payments not connected in v1", decision 2 / §11).
import type { PaymentType, Seat, SeatPlan, User } from '@/db/types';
import { PRICE_ANNUAL_USD, PRICE_MONTHLY_USD, TRIAL_DAYS } from '@/db/vocab';

export const DAY_MS = 86400000;

export const PLAN_LABEL: Record<SeatPlan, string> = {
  trial: '30 Day Free Trial',
  monthly: 'Handler Subscription · Monthly',
  annual: 'Handler Subscription · Annual',
};
export const PLAN_PRICE: Record<SeatPlan, number> = { trial: 0, monthly: PRICE_MONTHLY_USD, annual: PRICE_ANNUAL_USD };
export const PLAN_PERIOD: Record<SeatPlan, string> = { trial: `${TRIAL_DAYS} days`, monthly: 'month', annual: 'year' };

export type SeatState = 'trial' | 'active' | 'cancelling' | 'expired' | 'canceled_overdue' | 'none';
export const SEAT_STATE_LABEL: Record<SeatState, string> = {
  trial: 'Trial',
  active: 'Active',
  cancelling: 'Cancels at period end',
  expired: 'Expired',
  // A payment failed and the subscription was cancelled with money still owed — distinct from a plain
  // 'Expired' seat, because settling the balance is what restores it (PT-BIL-06).
  canceled_overdue: 'Canceled & Overdue',
  none: 'No subscription',
};

/** Payment Type is a real field, not a caption (PT-BIL-03). */
export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  automatic: 'Automatic Payment',
  invoice: 'Invoice',
  invoice_remittance: 'Invoice (Remittance)',
};
export const PAYMENT_TYPE_OPTIONS = (Object.keys(PAYMENT_TYPE_LABEL) as PaymentType[])
  .map((value) => ({ value, label: PAYMENT_TYPE_LABEL[value] }));
export const PAYMENT_TYPE_HELP: Record<PaymentType, string> = {
  automatic: 'The card on file is charged on the renewal date.',
  invoice: 'An invoice is emailed on the renewal date and paid by card or ACH.',
  invoice_remittance: 'An invoice is emailed with remittance details for a purchase-order or check payment.',
};

export interface SeatView {
  seat: Seat | null;
  state: SeatState;
  /** Whole days left before `ends` (negative once past). */
  daysLeft: number;
  /** True when records must be read-only (PT-BIL-06). */
  readOnly: boolean;
  plan: SeatPlan | null;
  planLabel: string;
  paymentType: PaymentType;
  /** Money still owed. Shown as "Balance Due:" and always 0 unless the state is canceled_overdue. */
  balanceDueUSD: number;
  stateLabel: string;
}

export function seatEnd(seat: Seat | null | undefined): number {
  return seat?.ends ? new Date(seat.ends).getTime() : 0;
}

export function describeSeat(seat: Seat | null | undefined, now = Date.now()): SeatView {
  if (!seat) {
    return {
      seat: null, state: 'none', daysLeft: 0, readOnly: true, plan: null, planLabel: 'No subscription',
      paymentType: 'automatic', balanceDueUSD: 0, stateLabel: SEAT_STATE_LABEL.none,
    };
  }
  const ends = seatEnd(seat);
  const daysLeft = Math.ceil((ends - now) / DAY_MS);
  const past = ends < now;
  // 'overdue' outranks everything: money is owed, so the seat is dead even if the period has not run out.
  const state: SeatState = seat.status === 'overdue'
    ? 'canceled_overdue'
    : past || seat.status === 'expired'
      ? 'expired'
      : seat.status === 'cancelled' ? 'cancelling'
        : seat.plan === 'trial' ? 'trial' : 'active';
  return {
    seat,
    state,
    daysLeft,
    readOnly: state === 'expired' || state === 'canceled_overdue',
    plan: seat.plan,
    planLabel: PLAN_LABEL[seat.plan],
    paymentType: seat.payment_type ?? 'automatic',
    balanceDueUSD: state === 'canceled_overdue' ? (seat.balance_due_usd ?? PLAN_PRICE[seat.plan]) : 0,
    stateLabel: SEAT_STATE_LABEL[state],
  };
}

/** New period end for a plan started now: trial +30 days, monthly +1 month, annual +1 year. */
export function periodEnd(plan: SeatPlan, from = new Date()): string {
  const d = new Date(from.getTime());
  if (plan === 'trial') d.setDate(d.getDate() + TRIAL_DAYS);
  else if (plan === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

/**
 * Prorated preview when a group subscription changes seat count mid-period. Straight-line by days
 * remaining — the reference charges "a prorated amount" without publishing the formula, so ours is
 * stated in plain words on screen rather than implied.
 */
export interface ProrationPreview {
  addedSeats: number;
  daysRemaining: number;
  periodDays: number;
  amountUSD: number;
  text: string;
}
export function prorate(addedSeats: number, plan: SeatPlan, periodStart: string, periodEndISO: string, now = Date.now()): ProrationPreview {
  const start = new Date(periodStart).getTime();
  const end = new Date(periodEndISO).getTime();
  const periodDays = Math.max(1, Math.round((end - start) / DAY_MS));
  const daysRemaining = Math.max(0, Math.ceil((end - now) / DAY_MS));
  const unit = PLAN_PRICE[plan];
  const amount = Math.round(addedSeats * unit * (daysRemaining / periodDays) * 100) / 100;
  const text = addedSeats <= 0
    ? 'Removing seats credits the unused time against your next invoice.'
    : `${addedSeats} seat${addedSeats === 1 ? '' : 's'} × $${unit} × ${daysRemaining} of ${periodDays} days remaining = $${amount.toFixed(2)} today, then $${(addedSeats * unit).toFixed(2)} per ${PLAN_PERIOD[plan]}.`;
  return { addedSeats, daysRemaining, periodDays, amountUSD: amount, text };
}

/** Group subscription bookkeeping held on the billing manager's own Seat row. */
export interface GroupSeatSummary {
  seatCount: number;
  assigned: { user: User; seat: Seat }[];
  waiting: User[];
  free: number;
}
export function summariseGroup(seatCount: number, seats: Seat[], users: User[], groupId: string): GroupSeatSummary {
  const byId = new Map(users.map((u) => [u.id, u]));
  const assigned = seats
    .filter((s) => s.group_subscription_id === groupId && byId.has(s.user_id))
    .map((s) => ({ user: byId.get(s.user_id)!, seat: s }));
  const free = Math.max(0, seatCount - assigned.length);
  return { seatCount, assigned, waiting: [], free };
}

export const PAYMENTS_DISABLED_NOTE = 'Payments not connected in v1 — these buttons change the subscription model only, nothing is charged.';

// ---------------------------------------------------------------------------------------------
// Receipt / invoice (PT-BIL-05)
// ---------------------------------------------------------------------------------------------
/**
 * A receipt of the subscription AS IT STANDS. No payment processor is wired, so this is not proof
 * that money moved — it is the statement of the plan, the period and the amount, which is the part
 * a finance office actually asks for when raising a purchase order. It says so on its face.
 */
export interface ReceiptLine { label: string; value: string; strong?: boolean }
export interface Receipt {
  number: string;
  issuedAt: string;
  billedTo: string;
  billedToEmail: string;
  department: string;
  lines: ReceiptLine[];
  totalLabel: string;
  totalValue: string;
  footnote: string;
}

export interface ReceiptInput {
  seat: Seat | null;
  view: SeatView;
  userName: string;
  userEmail: string;
  department: string;
  /** Seats on the group subscription this receipt covers (1 for a personal seat). */
  seatCount: number;
  isGroup: boolean;
  now?: number;
}

const money = (n: number) => `$${n.toFixed(2)}`;
const day = (iso: string | null | undefined) =>
  (iso ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso)) : '—');

export function buildReceipt(i: ReceiptInput): Receipt {
  const now = i.now ?? Date.now();
  const seat = i.seat;
  const plan = seat?.plan ?? null;
  const unit = plan ? PLAN_PRICE[plan] : 0;
  const seats = Math.max(1, i.seatCount);
  const subtotal = unit * seats;
  const lines: ReceiptLine[] = [
    { label: 'Plan', value: plan ? PLAN_LABEL[plan] : 'No subscription', strong: true },
    { label: 'Subscription type', value: i.isGroup ? 'Group subscription' : plan === 'trial' ? 'Trial' : 'Individual seat' },
    { label: 'Status', value: i.view.stateLabel },
    { label: 'Period start', value: day(seat?.starts) },
    { label: 'Period end', value: day(seat?.ends) },
    { label: 'Payment type', value: PAYMENT_TYPE_LABEL[i.view.paymentType] },
    { label: 'Seats', value: String(seats) },
    { label: 'Price per seat', value: plan ? `${money(unit)} per ${PLAN_PERIOD[plan]}` : money(0) },
    { label: 'Subtotal', value: money(subtotal) },
  ];
  if (i.view.balanceDueUSD > 0) lines.push({ label: 'Balance due', value: money(i.view.balanceDueUSD), strong: true });
  const numberFrom = seat?.id ? seat.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase().padStart(6, '0') : '000000';
  return {
    number: `R-${new Date(now).getFullYear()}-${numberFrom}`,
    issuedAt: day(new Date(now).toISOString()),
    billedTo: i.userName || '—',
    billedToEmail: i.userEmail || '—',
    department: i.department || '—',
    lines,
    totalLabel: i.view.balanceDueUSD > 0 ? 'Amount owed' : plan === 'trial' ? 'Charged' : 'Amount for this period',
    totalValue: i.view.balanceDueUSD > 0 ? money(i.view.balanceDueUSD) : money(plan === 'trial' ? 0 : subtotal),
    footnote: 'Payments are not connected in this version, so no card was charged and this is a statement of the subscription, not proof of payment.',
  };
}

/** Printable HTML for the receipt — deliberately plain so it prints the same in any browser. */
export function receiptHtml(r: Receipt, appName: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
  const rows = r.lines
    .map((l) => `<tr><th>${esc(l.label)}</th><td${l.strong ? ' class="strong"' : ''}>${esc(l.value)}</td></tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.number)}</title><style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1E1E1C;margin:40px;font-size:14px}
  h1{font-size:20px;margin:0 0 2px}
  .sub{color:#6B6A66;margin:0 0 24px}
  table{border-collapse:collapse;width:100%;max-width:520px}
  th,td{text-align:left;padding:7px 0;border-bottom:1px solid #E3E1DB;vertical-align:top}
  th{color:#6B6A66;font-weight:400;width:190px}
  td.strong{font-weight:700}
  .total{margin-top:18px;font-size:18px;font-weight:700}
  .note{margin-top:24px;color:#6B6A66;max-width:520px}
  </style></head><body>
  <h1>${esc(appName)} — Receipt ${esc(r.number)}</h1>
  <p class="sub">Issued ${esc(r.issuedAt)}</p>
  <table>
    <tr><th>Billed to</th><td>${esc(r.billedTo)}</td></tr>
    <tr><th>Email</th><td>${esc(r.billedToEmail)}</td></tr>
    <tr><th>Department</th><td>${esc(r.department)}</td></tr>
    ${rows}
  </table>
  <p class="total">${esc(r.totalLabel)}: ${esc(r.totalValue)}</p>
  <p class="note">${esc(r.footnote)}</p>
  </body></html>`;
}
