// BILLING (bar §2.20 / PT-BIL-01…07). Model only — no payment processor in v1, and every button
// that would charge a card says so. Two panels: the seat this account holds, and (for a billing
// manager) the group subscription with seats to buy and assign.
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useList, useRepo } from '@/db/provider';
import type { PaymentType, Seat, SeatPlan, User } from '@/db/types';
import { ROLE_LABEL } from '@/db/types';
import { PRICE_ANNUAL_USD, PRICE_MONTHLY_USD, TRIAL_DAYS } from '@/db/vocab';
import { useAuth, useVisibleUserIds } from '@/features/auth/AuthProvider';
import {
  Badge, Banner, Button, Card, ConfirmDialog, DateTimeField, Muted, Row, Screen, Section, Select, StatusPill, Table, Text, TextField,
  fmtDate, useColors, useIsDesktop, useToast, space, type Column,
} from '@/ui';
import {
  PAYMENTS_DISABLED_NOTE, PAYMENT_TYPE_HELP, PAYMENT_TYPE_OPTIONS, PLAN_LABEL, PLAN_PRICE,
  buildReceipt, describeSeat, periodEnd, prorate, type Receipt, type SeatState,
} from './billingModel';
import { ReceiptSheet } from './ReceiptSheet';
import { useCurrentSeat } from './useCurrentSeat';

const PILL: Record<SeatState, 'trial' | 'active' | 'expired' | 'neutral' | 'due'> = {
  trial: 'trial', active: 'active', cancelling: 'due', expired: 'expired', canceled_overdue: 'expired', none: 'neutral',
};

export function BillingScreen() {
  const { user, role, roles } = useAuth();
  const seat = useCurrentSeat();
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const desktop = useIsDesktop();
  const view = describeSeat(seat);
  const isBillingManager = roles.includes('billing_manager');
  const [busy, setBusy] = useState<SeatPlan | 'cancel' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  // Seats on the group subscription this account pays for — a personal seat is a group of one.
  const allSeats = useList('seat');
  const groupId = user ? `group-${user.id}` : '';
  const paidSeats = isBillingManager ? allSeats.filter((s) => s.group_subscription_id === groupId).length : 0;

  const openReceipt = () => {
    setReceipt(buildReceipt({
      seat: seat ?? null,
      view,
      userName: user?.name || '',
      userEmail: user?.group_billing_email || user?.email || '',
      department: user?.group_department_name || user?.department || '',
      seatCount: isBillingManager && paidSeats > 0 ? paidSeats : 1,
      isGroup: isBillingManager && paidSeats > 0,
    }));
  };

  const setPaymentType = async (pt: PaymentType) => {
    if (!seat) { toast.show('Start a subscription first — Payment Type applies to a live plan.', 'error'); return; }
    await repo.upsert('seat', { id: seat.id, payment_type: pt }, { label: 'Payment type changed' });
  };

  const start = async (plan: SeatPlan) => {
    if (!user) return;
    setBusy(plan);
    try {
      const now = new Date();
      await repo.upsert('seat', {
        id: seat?.id, owner_user_id: user.id, user_id: user.id, plan,
        starts: now.toISOString(), ends: periodEnd(plan, now),
        paid_by: seat?.paid_by ?? user.id, group_subscription_id: seat?.group_subscription_id ?? null,
        status: 'active',
      }, { label: `Subscription: ${PLAN_LABEL[plan]}` });
      toast.show(`${PLAN_LABEL[plan]} started — model only, nothing was charged.`);
    } finally { setBusy(null); }
  };

  const cancelAtPeriodEnd = async () => {
    setConfirmCancel(false);
    if (!seat) return;
    setBusy('cancel');
    try {
      await repo.upsert('seat', { id: seat.id, status: 'cancelled' }, { label: 'Subscription cancelled' });
      toast.show('Subscription canceled. Records stay editable until the period ends, then become read-only but still viewable and reportable.');
    } finally { setBusy(null); }
  };

  const expire = async () => {
    if (!seat) return;
    await repo.upsert('seat', { id: seat.id, status: 'expired', ends: new Date(Date.now() - 86400000).toISOString() }, { label: 'Subscription expired' });
    toast.show('Seat expired — record forms are now read-only.', 'info');
  };

  const makeOverdue = async () => {
    if (!seat) return;
    await repo.upsert('seat', { id: seat.id, status: 'overdue', balance_due_usd: PLAN_PRICE[seat.plan] || PRICE_MONTHLY_USD }, { label: 'Subscription canceled & overdue' });
    toast.show('Seat is now Canceled & Overdue — record forms are read-only until the balance is settled.', 'info');
  };

  return (
    <Screen
      title="Billing"
      subtitle={role === 'handler' ? 'One handler seat covers all of your dogs. Trainers, supervisors and billing managers are free.' : 'Your role is free. Handlers hold the paid seats.'}
      testID="screen-billing"
      maxWidth={1240}
    >
      <Banner tone="info" testID="banner-payments-disabled" title="Payments not connected in v1" body={PAYMENTS_DISABLED_NOTE} />

      <Section title="Your subscription">
        <Card testID="card-current-plan">
          <Row justify="space-between" wrap style={{ marginBottom: space.sm }}>
            <View style={{ flex: 1, minWidth: 220 }}>
              <Text variant="h2" testID="text-plan-name">{view.seat ? PLAN_LABEL[view.seat.plan] : 'No subscription'}</Text>
              <Muted testID="text-plan-kind">
                {view.seat?.group_subscription_id ? 'Group Subscription seat' : view.seat?.plan === 'trial' ? 'Trial' : role === 'handler' ? 'Handler Subscription' : 'Billing Manager Subscription (free)'}
              </Muted>
            </View>
            <StatusPill status={PILL[view.state]} label={view.state === 'cancelling' ? 'Cancels at period end' : undefined} testID="pill-plan-status" />
          </Row>
          <Row wrap gap={space.lg}>
            <KV k="Start date" v={view.seat ? fmtDate(view.seat.starts) : '—'} testID="text-plan-start" />
            <KV k="End date" v={view.seat ? fmtDate(view.seat.ends) : '—'} testID="text-plan-end" />
            <KV
              k={view.state === 'expired' ? 'Expired' : 'Days left'}
              v={view.seat ? (view.daysLeft >= 0 ? `${view.daysLeft} day${view.daysLeft === 1 ? '' : 's'}` : `${Math.abs(view.daysLeft)} day${Math.abs(view.daysLeft) === 1 ? '' : 's'} ago`) : '—'}
              testID="text-plan-days-left"
            />
            {view.balanceDueUSD > 0 ? <KV k="Balance Due:" v={`$${view.balanceDueUSD.toFixed(2)}`} testID="text-balance-due" danger /> : null}
          </Row>
          <View style={{ maxWidth: 340, marginTop: space.sm }}>
            <Select
              label="Payment Type"
              options={PAYMENT_TYPE_OPTIONS}
              allowCustom={false}
              value={view.paymentType}
              onChange={(v) => void setPaymentType(v as PaymentType)}
              disabled={!seat}
              testID="select-payment-type"
              help={PAYMENT_TYPE_HELP[view.paymentType]}
            />
          </View>
          {view.state === 'trial' ? (
            <Banner tone="info" testID="banner-trial" style={{ marginTop: space.md, marginBottom: 0 }} body={`${TRIAL_DAYS} day free trial — ${view.daysLeft} day${view.daysLeft === 1 ? '' : 's'} left. When it ends, records become read-only but stay viewable and reportable.`} />
          ) : null}
          {/* Only a handler is ever blocked by a seat. A trainer / supervisor / billing manager holds no
              paid seat by design, so telling them to "start a subscription to edit again" would
              contradict the subtitle two lines up — they never edit handler records at all. */}
          {view.state === 'canceled_overdue' ? (
            <Banner
              tone="danger"
              testID="banner-overdue"
              style={{ marginTop: space.md, marginBottom: 0 }}
              title="Canceled & Overdue"
              body={`A payment failed, so this subscription was canceled with money still owed. Balance Due: $${view.balanceDueUSD.toFixed(2)}. Settling the balance restores editing — nothing is ever deleted.`}
            />
          ) : null}
          {view.readOnly && role === 'handler' ? (
            <Banner tone="warning" testID="banner-read-only" style={{ marginTop: space.md, marginBottom: 0 }} title="Records are read-only" body="Existing records stay viewable and can still be reported. Start a subscription to edit again." />
          ) : null}
        </Card>
      </Section>

      {role === 'handler' || seat ? (
      <Section title="Change plan" description="Only handlers pay. One seat covers every dog that handler works.">
        <View style={desktop ? { flexDirection: 'row', gap: space.md } : { gap: space.md }}>
          <PlanCard
            title="Monthly"
            price={`$${PRICE_MONTHLY_USD}`}
            per="per handler / month"
            note="Renews every month. Cancel any time — no contract."
            current={view.state !== 'expired' && view.seat?.plan === 'monthly'}
            busy={busy === 'monthly'}
            onPress={() => void start('monthly')}
            testID="btn-start-monthly"
            action="Start monthly"
          />
          <PlanCard
            title="Annual"
            price={`$${PRICE_ANNUAL_USD}`}
            per="per handler / year"
            note={`Save $${PRICE_MONTHLY_USD * 12 - PRICE_ANNUAL_USD} against paying monthly.`}
            current={view.state !== 'expired' && view.seat?.plan === 'annual'}
            busy={busy === 'annual'}
            onPress={() => void start('annual')}
            testID="btn-start-annual"
            action="Start annual"
          />
        </View>
        <Row wrap style={{ marginTop: space.md }}>
          <Button
            title="Cancel at period end"
            variant="secondary"
            disabled={!seat || view.state === 'expired' || view.state === 'cancelling'}
            onPress={() => setConfirmCancel(true)}
            loading={busy === 'cancel'}
            testID="btn-cancel-subscription"
          />
          <Button title="Download Invoice/Receipt" variant="secondary" icon="document-text-outline" onPress={openReceipt} testID="btn-download-invoice" />
          <Button title="Expire this seat (demo)" variant="ghost" onPress={() => void expire()} testID="btn-expire-seat" accessibilityLabel="Expire this seat — demo tool to see the read-only gate" />
          <Button title="Fail a payment (demo)" variant="ghost" onPress={() => void makeOverdue()} testID="btn-overdue-seat" accessibilityLabel="Fail a payment — demo tool to see the Canceled & Overdue state" />
        </Row>
        <Muted style={{ marginTop: space.sm }}>
          Cancelling never deletes anything: records stay viewable and reportable, and a new subscription restores full access.
        </Muted>
      </Section>
      ) : (
        <Section title="Change plan">
          <Card testID="card-no-seat-needed">
            <Text variant="bodyStrong">Your role does not need a seat.</Text>
            <Muted style={{ marginTop: 4 }}>
              {`The ${role ? ROLE_LABEL[role] : 'current'} role is free: it reviews, trains and pays, but never edits handler records, so there is nothing here to buy.${isBillingManager ? ' Seats for your handlers are bought in Group subscription below.' : ''}`}
            </Muted>
          </Card>
        </Section>
      )}

      {role === 'handler' && !isBillingManager ? (
        <Banner
          tone="info"
          testID="banner-share-tip"
          title="TIP"
          body="A supervisor or administrator can pay for every handler in the department on one invoice. Ask them to open Billing and add you to a group subscription."
        />
      ) : null}

      {isBillingManager ? <GroupPanel /> : null}

      <ReceiptSheet receipt={receipt} onClose={() => setReceipt(null)} />

      <ConfirmDialog
        visible={confirmCancel}
        title="Cancel this subscription?"
        body={`Access continues until ${seat ? fmtDate(seat.ends) : 'the period ends'}. After that records are read-only but still viewable and reportable. Nothing is deleted.`}
        confirmTitle="Cancel subscription"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void cancelAtPeriodEnd()}
        testID="dialog-cancel-subscription"
      />
      <Button title="Back to Records" variant="ghost" onPress={() => router.replace('/records')} testID="btn-billing-back" style={{ alignSelf: 'flex-start', marginTop: space.md }} />
    </Screen>
  );
}

/** Billing Manager view: buy N seats, assign them to handlers, prorated preview (PT-BIL-04). */
function GroupPanel() {
  const repo = useRepo();
  const toast = useToast();
  const { user } = useAuth();
  const visible = useVisibleUserIds();
  const users = useList('user');
  const seats = useList('seat');
  const groups = useList('management_group');
  const [plan, setPlan] = useState<SeatPlan>('annual');
  const [seatCount, setSeatCount] = useState(3);
  const [assignTo, setAssignTo] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [transferTo, setTransferTo] = useState('');

  // The billing profile of the group subscription lives on the manager who owns it.
  const setProfile = async (patch: Partial<User>) => {
    if (!user) return;
    await repo.upsert('user', { id: user.id, ...patch } as Partial<User> & { id: string }, { label: 'Group subscription details' });
  };

  const groupId = user ? `group-${user.id}` : 'group';
  const managed: User[] = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groups) if (g.manager_id === user?.id) g.members.forEach((m) => ids.add(m));
    for (const id of visible) ids.add(id);
    return users.filter((u) => ids.has(u.id) && u.roles.includes('handler'));
  }, [groups, users, visible, user]);

  const me = users.find((u) => u.id === user?.id);
  const groupSeats = seats.filter((s) => s.group_subscription_id === groupId);
  const assigned = groupSeats.map((s) => ({ seat: s, user: users.find((u) => u.id === s.user_id) })).filter((x) => x.user) as { seat: Seat; user: User }[];
  const free = Math.max(0, seatCount - assigned.length);
  const periodStart = new Date().toISOString();
  const preview = prorate(1, plan, periodStart, periodEnd(plan), Date.now());

  const assign = async () => {
    if (!assignTo) { toast.show('Pick a handler first.', 'error'); return; }
    if (free <= 0) { toast.show('Waiting for available seats — buy another seat first.', 'error'); return; }
    const existing = seats.find((s) => s.user_id === assignTo);
    const now = new Date();
    await repo.upsert('seat', {
      id: existing?.id, owner_user_id: assignTo, user_id: assignTo, plan,
      starts: now.toISOString(), ends: periodEnd(plan, now), paid_by: user?.id || null,
      group_subscription_id: groupId, status: 'active',
    }, { label: `Group seat assigned to ${users.find((u) => u.id === assignTo)?.name || assignTo}` });
    setAssignTo('');
    toast.show('Seat assigned. Unused individual time is credited against the next invoice.');
  };

  const transfer = async () => {
    if (!transferTo) { toast.show('Pick the billing manager who takes it over.', 'error'); return; }
    const to = users.find((u) => u.id === transferTo);
    const newGroupId = `group-${transferTo}`;
    for (const s of groupSeats) {
      await repo.upsert('seat', { id: s.id, group_subscription_id: newGroupId, paid_by: transferTo }, { label: 'Group subscription transferred' });
    }
    await repo.upsert('user', { id: transferTo, roles: [...new Set([...(to?.roles || []), 'billing_manager' as const])] }, { label: 'Billing Manager role granted' });
    setTransferTo('');
    toast.show(`Group subscription transferred to ${to?.name || 'the new manager'}. Nothing was charged — payments are not connected in v1.`);
  };

  const leave = async () => {
    setConfirmLeave(false);
    for (const s of groupSeats) {
      await repo.upsert('seat', { id: s.id, group_subscription_id: null, paid_by: s.user_id }, { label: 'Left group subscription' });
    }
    toast.show('You left the group subscription. Each handler now pays for their own seat; records stay viewable and reportable.');
  };

  const unassign = async (s: Seat) => {
    await repo.upsert('seat', { id: s.id, group_subscription_id: null, paid_by: s.user_id }, { label: 'Left group subscription' });
    toast.show('Handler removed from the group subscription.');
  };

  const columns: Column<{ seat: Seat; user: User }>[] = [
    { key: 'name', title: 'Handler', flex: 1.4, render: (r) => <Text variant="bodyStrong">{r.user.name}</Text> },
    { key: 'plan', title: 'Plan', flex: 1, render: (r) => PLAN_LABEL[r.seat.plan] },
    { key: 'ends', title: 'Renews', flex: 1, render: (r) => fmtDate(r.seat.ends) },
    { key: 'actions', title: '', width: 140, render: (r) => <Button title="Remove" variant="secondary" onPress={() => void unassign(r.seat)} testID={`btn-unassign-${r.user.id}`} style={{ minHeight: 36, paddingVertical: 4 }} /> },
  ];

  return (
    <Section title="Group subscription" description="Pay for several handlers on one invoice (Billing Manager).">
      <Card testID="card-group-subscription">
        <Row wrap gap={space.md} align="flex-start">
          <View style={{ flex: 1, minWidth: 240 }}>
            <TextField
              label="Department Name"
              value={me?.group_department_name ?? me?.department ?? ''}
              onChangeText={(v) => void setProfile({ group_department_name: v })}
              testID="input-group-department"
              maxLength={80}
              help="Printed on the invoice and on every report produced under this subscription."
            />
          </View>
          <View style={{ flex: 1, minWidth: 240 }}>
            <TextField
              label="Email"
              value={me?.group_billing_email ?? me?.email ?? ''}
              onChangeText={(v) => void setProfile({ group_billing_email: v })}
              testID="input-group-email"
              keyboardType="email-address"
              autoCapitalize="none"
              help="Where invoices and payment failures are sent — often a finance mailbox, not the manager."
            />
          </View>
        </Row>
        <Row wrap gap={space.md} align="flex-start">
          <View style={{ flex: 1, minWidth: 240 }}>
            <Select
              label="Payment Type"
              options={PAYMENT_TYPE_OPTIONS}
              allowCustom={false}
              value={me?.group_payment_type ?? 'invoice'}
              onChange={(v) => void setProfile({ group_payment_type: v as PaymentType })}
              testID="select-group-payment-type"
              help={PAYMENT_TYPE_HELP[me?.group_payment_type ?? 'invoice']}
            />
          </View>
          <View style={{ flex: 1, minWidth: 240 }}>
            <Select
              label="Custom Billing Date (Optional)"
              options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1} of the month` }))}
              allowCustom={false}
              clearable
              value={me?.group_billing_day ? String(me.group_billing_day) : ''}
              onChange={(v) => void setProfile({ group_billing_day: v ? parseInt(v, 10) : null })}
              testID="select-group-billing-date"
              placeholder="Bill on the anniversary of the start date"
              help="Departments on a purchase order often need every invoice on the same day of the month."
            />
          </View>
        </Row>
        <Row wrap gap={space.md} align="flex-start">
          <View style={{ flex: 1, minWidth: 220 }}>
            <Select
              label="Subscription Type"
              options={[{ value: 'monthly', label: `Monthly — $${PRICE_MONTHLY_USD} per seat` }, { value: 'annual', label: `Annual — $${PRICE_ANNUAL_USD} per seat` }]}
              allowCustom={false}
              value={plan}
              onChange={(v) => setPlan(v as SeatPlan)}
              testID="select-group-plan"
              help="How often the whole group is billed. Annual is charged once a year and works out cheaper per seat."
            />
          </View>
          <View style={{ flex: 1, minWidth: 220 }}>
            <Select
              label="Seat Count"
              options={[1, 2, 3, 4, 5, 6, 8, 10, 12, 20].map((n) => ({ value: String(n), label: `${n} seat${n === 1 ? '' : 's'}` }))}
              allowCustom={false}
              value={String(seatCount)}
              onChange={(v) => setSeatCount(parseInt(v, 10) || 1)}
              testID="select-group-seat-count"
              help={`${assigned.length} assigned · ${free} free`}
            />
          </View>
        </Row>
        <Row wrap gap={space.md} style={{ marginBottom: space.md }}>
          <Badge testID="badge-group-total">{seatCount} seats × ${PLAN_PRICE[plan]} = ${seatCount * PLAN_PRICE[plan]} per {plan === 'annual' ? 'year' : 'month'}</Badge>
        </Row>
        <Banner tone="info" testID="banner-proration" title="Prorated preview" body={preview.text} />
        <Row wrap gap={space.md} align="flex-start">
          <View style={{ flex: 1, minWidth: 240 }}>
            <Select
              label="Add Handler to Subscription"
              options={managed.map((u) => ({ value: u.id, label: u.name, description: u.email }))}
              allowCustom={false}
              value={assignTo}
              onChange={setAssignTo}
              testID="select-assign-handler"
              placeholder={free > 0 ? 'Pick a handler' : 'Waiting for available seats'}
              help={free > 0 ? `${free} seat${free === 1 ? '' : 's'} free.` : 'Waiting for available seats — raise the seat count to add another handler.'}
            />
          </View>
          <Button title="Assign seat" onPress={() => void assign()} testID="btn-assign-seat" style={{ marginTop: 28 }} />
        </Row>
        <Table<{ seat: Seat; user: User }>
          testID="table-group-seats"
          columns={columns}
          rows={assigned}
          keyOf={(r) => r.user.id}
          emptyText="No handlers on this group subscription yet."
        />
        <Muted style={{ marginTop: space.sm }}>
          Leaving a group subscription makes every one of its handlers read-only. Transferring it hands the seats and assignments to another billing manager — nobody loses a record either way.
        </Muted>
        <Row wrap gap={space.md} align="flex-start" style={{ marginTop: space.md }}>
          <View style={{ flex: 1, minWidth: 240 }}>
            <Select
              label="Transfer Group Subscription to"
              options={managed.map((u) => ({ value: u.id, label: u.name, description: u.email }))}
              allowCustom={false}
              clearable
              value={transferTo}
              onChange={setTransferTo}
              testID="select-transfer-group"
              placeholder="Pick the new billing manager"
              help="They take over the seats, the assignments and the invoice; the handlers notice nothing."
            />
          </View>
          <Button title="Transfer Group Subscription" variant="secondary" onPress={() => void transfer()} testID="btn-transfer-group" style={{ marginTop: 28 }} />
          <Button title="Leave Group Subscription" variant="danger" onPress={() => setConfirmLeave(true)} testID="btn-leave-group" style={{ marginTop: 28 }} />
        </Row>
        <ConfirmDialog
          visible={confirmLeave}
          title="Leave this group subscription?"
          body={`${assigned.length} handler${assigned.length === 1 ? '' : 's'} would go back to paying individually, and any who do not are read-only until they do. Records are never deleted.`}
          confirmTitle="Leave subscription"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => void leave()}
          testID="dialog-leave-group"
        />
      </Card>
    </Section>
  );
}

function PlanCard({ title, price, per, note, current, busy, onPress, testID, action }: {
  title: string; price: string; per: string; note: string; current: boolean; busy: boolean; onPress: () => void; testID: string; action: string;
}) {
  return (
    <Card style={{ flex: 1, minWidth: 240 }} testID={`card-plan-${title.toLowerCase()}`}>
      <Row justify="space-between">
        <Text variant="h3">{title}</Text>
        {current ? <StatusPill status="active" label="Current plan" /> : null}
      </Row>
      <Text variant="h1" style={{ marginTop: space.xs }}>{price}</Text>
      <Muted>{per}</Muted>
      <Muted style={{ marginTop: space.xs }}>{note}</Muted>
      <Button title={action} onPress={onPress} loading={busy} testID={testID} style={{ marginTop: space.md }} fullWidth />
      <Muted style={{ marginTop: space.xs }}>Payments not connected in v1.</Muted>
    </Card>
  );
}

function KV({ k, v, testID, danger }: { k: string; v: string; testID?: string; danger?: boolean }) {
  const c = useColors();
  return (
    <View style={{ minWidth: 150 }}>
      <Muted>{k}</Muted>
      <Text testID={testID} variant={danger ? 'bodyStrong' : 'body'} style={danger ? { color: c.danger } : undefined}>{v}</Text>
    </View>
  );
}
