// PROFILE → General identity (PT-PRO-02 / PT-PRO-09). Everything here is about WHO the account is,
// which is why it is the one part of the app where a change can hand the account to somebody else.
//
// The email list is the delicate bit. A sign-in address is an identity, not a contact field, so the
// reference never lets you overwrite it in place: you ADD an address, it is emailed a confirmation
// link, and confirming that link is what moves the account. We keep that shape — Add / Resend /
// Confirm as three separate acts — and we print the transfer warning next to the confirm control
// rather than in a tooltip, because the person who most needs to read it is the one about to click.
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { useRepo } from '@/db/provider';
import type { Role, User } from '@/db/types';
import { ROLE_LABEL } from '@/db/types';
import { Badge, Banner, Button, Muted, Row, Switch, Text, TextField, fmtDateTime, useColors, useToast, radius, space } from '@/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function IdentitySection({ user, roles }: { user: User; roles: Role[] }) {
  const repo = useRepo();
  const toast = useToast();
  const c = useColors();
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phone, setPhone] = useState(user.phone || '');
  const [busy, setBusy] = useState(false);

  const patch = (p: Partial<User>, label: string) => repo.upsert('user', { id: user.id, ...p } as Partial<User> & { id: string }, { label });

  const addEmail = async () => {
    const v = newEmail.trim().toLowerCase();
    if (!v) { setEmailError('Enter the address you want to add.'); return; }
    if (!EMAIL_RE.test(v)) { setEmailError('That does not look like an email address.'); return; }
    if (v === user.email.toLowerCase()) { setEmailError('That is already your sign-in address.'); return; }
    setEmailError(null);
    await patch({ pending_email: v, pending_email_sent_at: new Date().toISOString() }, 'Email address added');
    setNewEmail('');
    toast.show(`Confirmation sent to ${v}. Email is not connected in v1 — use Confirm Email Change to complete it.`);
  };

  const resend = async () => {
    if (!user.pending_email) return;
    await patch({ pending_email_sent_at: new Date().toISOString() }, 'Confirmation email resent');
    toast.show(`Confirmation resent to ${user.pending_email}.`);
  };

  const confirmChange = async () => {
    if (!user.pending_email) return;
    const to = user.pending_email;
    await patch({ email: to, pending_email: null, pending_email_sent_at: null }, 'Sign-in email changed');
    toast.show(`Sign-in address is now ${to}. Use it the next time you sign in.`);
  };

  const discard = async () => {
    await patch({ pending_email: null, pending_email_sent_at: null }, 'Pending email discarded');
    toast.show('Pending address discarded — your sign-in address is unchanged.');
  };

  const savePhone = async () => {
    await patch({ phone: phone.trim() }, 'Phone number');
    toast.show('Phone number saved');
  };

  const pickPhoto = async () => {
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets[0]) return;
      await patch({ photo_uri: res.assets[0].uri }, 'Profile photo');
      toast.show('Photo updated');
    } catch (err) {
      toast.show(`Photo upload failed — ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    } finally { setBusy(false); }
  };

  const removePhoto = async () => {
    await patch({ photo_uri: null }, 'Profile photo removed');
    toast.show('Photo removed');
  };

  const toggleBillingManager = async (on: boolean) => {
    const next = on
      ? [...new Set([...user.roles, 'billing_manager' as Role])]
      : user.roles.filter((r) => r !== 'billing_manager');
    if (!next.length) { toast.show('An account needs at least one role.', 'error'); return; }
    await patch({ roles: next }, on ? 'Billing Manager role enabled' : 'Billing Manager role disabled');
    toast.show(on
      ? 'Billing Manager role enabled — Billing now shows the group subscription. The role is free.'
      : 'Billing Manager role disabled. Any group subscription you paid for keeps running.');
  };

  return (
    <View>
      {/* ---- Photo + locked name ---- */}
      <Row wrap gap={space.md} align="flex-start">
        <View style={{ alignItems: 'center' }}>
          <Muted>Photo</Muted>
          {user.photo_uri ? (
            <Image
              source={{ uri: user.photo_uri }}
              accessibilityLabel={`Profile photo of ${user.name}`}
              style={{ width: 96, height: 96, borderRadius: radius.lg, marginTop: 4, backgroundColor: c.surfaceAlt }}
            />
          ) : (
            <View
              testID="avatar-initials"
              accessibilityLabel={`No profile photo — initials ${user.first_name.charAt(0)}${user.last_name.charAt(0)}`}
              style={{ width: 96, height: 96, borderRadius: radius.lg, marginTop: 4, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text variant="h2" style={{ color: c.muted }}>{`${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase()}</Text>
            </View>
          )}
          <Button
            title={user.photo_uri ? 'CHANGE PHOTO' : 'ADD PHOTO'}
            variant="secondary"
            onPress={() => void pickPhoto()}
            loading={busy}
            testID="btn-add-photo"
            style={{ marginTop: space.xs }}
          />
          {user.photo_uri ? <Button title="Remove photo" variant="ghost" onPress={() => void removePhoto()} testID="btn-remove-photo" /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 240 }}>
          <Row wrap>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Muted>First Name</Muted>
              <Text variant="bodyStrong" testID="text-profile-name">{user.first_name}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Muted>Last Name</Muted>
              <Text variant="bodyStrong">{user.last_name}</Text>
            </View>
          </Row>
          <Muted style={{ marginTop: space.xs }}>
            Name is locked once the account exists — changing it would break the record trail, so it goes through support.
          </Muted>
          <View style={{ marginTop: space.md, maxWidth: 320 }}>
            <TextField
              label="Phone Number"
              value={phone}
              onChangeText={setPhone}
              onBlur={() => void savePhone()}
              testID="input-phone"
              keyboardType="phone-pad"
              maxLength={30}
              placeholder="e.g. (555) 014-2288"
              help="Optional. Used by your department to reach you about a deployment — it is never a sign-in credential."
            />
          </View>
        </View>
      </Row>

      {/* ---- Email list ---- */}
      <View style={{ marginTop: space.lg }}>
        <Text variant="label">Email</Text>
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, marginTop: 6 }}>
          <Row justify="space-between" wrap style={{ padding: space.sm }}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Text testID="text-profile-email">{user.email}</Text>
              <Muted>Sign-in address</Muted>
            </View>
            <Badge testID="badge-email-primary">Confirmed · Primary</Badge>
          </Row>
          {user.pending_email ? (
            <Row justify="space-between" wrap style={{ padding: space.sm, borderTopWidth: 1, borderTopColor: c.border }}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <Text testID="text-pending-email">{user.pending_email}</Text>
                <Muted>{`Unconfirmed — sent ${fmtDateTime(user.pending_email_sent_at)}`}</Muted>
              </View>
              <Row wrap>
                <Button title="Resend Email" variant="secondary" onPress={() => void resend()} testID="btn-resend-email" style={{ minHeight: 36, paddingVertical: 4 }} />
                <Button title="Confirm Email Change" onPress={() => void confirmChange()} testID="btn-confirm-email-change" style={{ minHeight: 36, paddingVertical: 4 }} />
                <Button title="Discard" variant="ghost" onPress={() => void discard()} testID="btn-discard-email" style={{ minHeight: 36, paddingVertical: 4 }} />
              </Row>
            </Row>
          ) : null}
        </View>

        {user.pending_email ? (
          <Banner
            tone="warning"
            testID="banner-email-transfer"
            style={{ marginTop: space.sm }}
            title="Confirming this address transfers the account"
            body={`Whoever controls ${user.pending_email} will be able to sign in as ${user.name} and will own every record on this account — dogs, training, deployments and reports move with it. This is how a handler hands their K9 file to a replacement, and it cannot be undone from here. Only confirm an address you or your department controls.`}
          />
        ) : null}

        <Row wrap gap={space.md} align="flex-start" style={{ marginTop: space.sm }}>
          <View style={{ flex: 1, minWidth: 240 }}>
            <TextField
              label="Add Email Address"
              value={newEmail}
              onChangeText={(v) => { setNewEmail(v); setEmailError(null); }}
              testID="input-add-email"
              error={emailError}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="new.address@department.gov"
              help="The new address must be confirmed before it becomes your sign-in address."
            />
          </View>
          <Button title="Add Email Address" variant="secondary" onPress={() => void addEmail()} testID="btn-add-email" style={{ marginTop: 28 }} />
        </Row>
      </View>

      {/* ---- Roles + federated identity ---- */}
      <Row wrap style={{ marginTop: space.lg }}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Muted>Roles</Muted>
          <Row wrap gap={6} style={{ marginTop: 2 }}>{roles.map((r) => <Badge key={r}>{ROLE_LABEL[r]}</Badge>)}</Row>
          <Muted style={{ marginTop: 2 }}>Roles are granted by your department, not chosen here.</Muted>
        </View>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Muted>Microsoft Account</Muted>
          <Text testID="text-microsoft-account">{user.microsoft_account || 'Not linked'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Muted>Microsoft Entra OID</Muted>
          <Text testID="text-microsoft-entra-oid" selectable>{user.microsoft_entra_oid || '—'}</Text>
        </View>
      </Row>
      <Muted style={{ marginTop: 4 }}>
        Single sign-on is arranged by your department&apos;s IT, so these two rows are read-only. The OID is what support asks for when a sign-on fails.
      </Muted>

      <View style={{ marginTop: space.md }}>
        <Switch
          label="Enable Billing Manager Role"
          help="A billing manager pays for several handlers on one invoice. The role is free, adds the Group subscription panel to Billing, and grants no access to anybody's records."
          value={user.roles.includes('billing_manager')}
          onChange={(v) => void toggleBillingManager(v)}
          testID="switch-billing-manager-role"
        />
      </View>
    </View>
  );
}
