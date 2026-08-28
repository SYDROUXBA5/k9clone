// PROFILE (bar §2.16 / PT-PRO-01…09). Sections in the reference's own order: General · Notifications ·
// Passcode · Department · Theme · Report Options · Documents · Change Password, then the Developer
// tools U1 added (Reset demo data, Simulate phone, store counts).
//
// Reset demo data deliberately KEEPS you signed in: the demo users hold fixed ids, so the session
// survives the reseed and lands back on Records with a confirmation.
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { APP_NAME, BUILD_HASH, DATA_MODE } from '@/config';
import { useEntityCounts, useList, useRepo } from '@/db/provider';
import { seedDemo } from '@/db/seed';
import { ROLE_LABEL } from '@/db/types';
import { useAuth } from '@/features/auth/AuthProvider';
import { BackupSection } from '@/features/backup/BackupSection';
import { describeSeat } from '@/features/billing/billingModel';
import { useCurrentSeat } from '@/features/billing/useCurrentSeat';
import { usePrefs } from '@/features/prefs/PrefsProvider';
import { computeTraining, resolveRange } from '@/features/stats/statsModel';
import {
  Badge, Banner, Button, Card, ConfirmDialog, Muted, Row, Screen, Section, Segmented, Switch, Text, TextField,
  fmtDate, fmtDateTime, useColors, useIsDesktop, useToast, radius, space,
} from '@/ui';
import { DocumentsSection } from './DocumentsSection';
import { IdentitySection } from './IdentitySection';
import { NotificationPrefs } from './NotificationPrefs';
import { PasscodeSection } from './Passcode';
import { InstallSection } from '@/features/pwa';
import { useThemeControl } from './useThemeControl';

export function ProfileScreen() {
  const { user, roles, signOut } = useAuth();
  const seat = useCurrentSeat();
  const repo = useRepo();
  const router = useRouter();
  const toast = useToast();
  const desktop = useIsDesktop();
  const { prefs, update } = usePrefs();
  const counts = useEntityCounts();
  const { preference, setPreference } = useThemeControl();
  const colors = useColors();

  const [count, setCount] = useState('40');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSeed, setLastSeed] = useState<string | null>(null);
  const [badge, setBadge] = useState(user?.badge_number || '');
  const [duty, setDuty] = useState(user?.duty_assignment || '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);

  // Lifetime totals (PT-STA-03 row 6 / §2.14 row 6).
  const dogs = useList('dog', (d) => d.owner_user_id === user?.id);
  const events = useList('training_event');
  const exercises = useList('exercise');
  const completions = useList('completion');
  const deployments = useList('deployment');
  const classes = useList('class_record');
  const lifetime = computeTraining({
    range: resolveRange('custom', Date.now(), new Date(0).toISOString(), new Date().toISOString()),
    dogId: null, userIds: user ? [user.id] : [], dogs, events, exercises, completions, deployments, classes,
  });
  const lifetimeDeployments = deployments.filter((d) => d.handler_id === user?.id).length;

  const records = counts.training_event + counts.deployment + counts.class_record + counts.vet_visit;
  const seatView = describeSeat(seat);

  const reset = async () => {
    setConfirm(false);
    const n = Math.max(1, Math.min(20000, parseInt(count, 10) || 40));
    setBusy(true);
    const t0 = Date.now();
    try {
      // The demo users keep their ids across a reseed, so the session survives it: stay signed in and
      // land back on Records with the new data. Only a user the new seed does not contain is signed out.
      const keepId = user?.id || null;
      const res = await seedDemo(repo, n);
      const ms = Date.now() - t0;
      setLastSeed(`Seeded ${res.records} records in ${(ms / 1000).toFixed(1)} s — still signed in as ${user?.name || 'you'}.`);
      if (keepId && repo.getSync('user', keepId)) {
        repo.setActor(keepId);
        // Stay on Profile: the confirmation banner below is the receipt, and navigating away would
        // hide it behind a toast that has already faded.
        toast.show(`Demo data reset — ${res.records} records (${(ms / 1000).toFixed(1)} s). Still signed in as ${user?.name || 'you'}.`);
      } else {
        await signOut();
        toast.show(`Demo data reset — ${res.records} records (${(ms / 1000).toFixed(1)} s). Sign in again.`);
        router.replace('/sign-in');
      }
    } catch (err) {
      toast.show(`Reset failed — ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const pickDepartmentLogo = async () => {
    if (!user) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets[0]) return;
      await repo.upsert('user', { id: user.id, department_logo_uri: res.assets[0].uri }, { label: 'Department logo' });
      toast.show('Department logo saved — it prints at the top of every report you generate.');
    } catch (err) {
      toast.show(`Logo upload failed — ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    }
  };

  const saveDepartment = async () => {
    if (!user) return;
    await repo.upsert('user', { id: user.id, badge_number: badge.trim(), duty_assignment: duty.trim() }, { label: 'Department details' });
    toast.show('Department details saved — they print under the masthead on your reports.');
  };

  const changePassword = async () => {
    const ok = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,20}$/.test(pw);
    if (!ok) { setPwError('Password must be 8-20 characters long and contain an uppercase letter, lowercase letter and a number.'); return; }
    if (pw !== pw2) { setPwError('The two passwords do not match.'); return; }
    if (!user) return;
    await repo.upsert('user', { id: user.id, password: pw }, { silent: true });
    setPw(''); setPw2(''); setPwError(null);
    toast.show('Password changed — signing you out. Sign in again with the new password.');
    await signOut();
    router.replace('/sign-in');
  };

  const setDemographics = async (v: boolean) => {
    if (!user) return;
    await repo.upsert('user', { id: user.id, demographics_in_reports: v }, { label: 'Report options' });
    toast.show(v ? 'Demographic arrest data will be shown in deployment reports.' : 'Demographic arrest data is hidden in reports — it is still collected.');
  };

  const half = desktop ? { flex: 1, minWidth: 0 } : undefined;

  return (
    <Screen title="Profile" subtitle={user?.department} testID="screen-profile" maxWidth={1240}>
      {/* ---------- General ---------- */}
      <Section title="General">
        <Card testID="section-general">
          {user ? <IdentitySection user={user} roles={roles} /> : null}
          <Row wrap style={{ marginTop: space.lg }}>
            <View style={{ flex: 1, minWidth: 220 }}>
              <Muted>Subscription</Muted>
              <Text testID="text-profile-subscription">{seat ? `${seatView.planLabel} · ${seatView.state} · ends ${fmtDate(seat.ends)}` : 'No subscription'}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 220 }}>
              <Muted>Lifetime totals</Muted>
              <Text testID="text-lifetime">{lifetime.hours} training hours · {lifetimeDeployments} deployment{lifetimeDeployments === 1 ? '' : 's'}</Text>
            </View>
          </Row>
          <Row wrap style={{ marginTop: space.md }}>
            <View style={{ flex: 1, minWidth: 220 }}>
              <Muted>Last web login</Muted>
              <Text>{fmtDateTime(user?.last_web_login_at)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 220 }}>
              <Muted>Last app login</Muted>
              <Text>{fmtDateTime(user?.last_app_login_at)}</Text>
            </View>
          </Row>
        </Card>
      </Section>

      {/* ---------- Notifications ---------- */}
      <Section title="Notifications" description="Which notifications reach you, and how.">
        <Card><NotificationPrefs /></Card>
      </Section>

      {/* ---------- Passcode ---------- */}
      <Section title="Passcode">
        <Card><PasscodeSection /></Card>
      </Section>

      {/* ---------- Department ---------- */}
      <Section title="Department">
        <Card testID="section-department">
          {/* Department Name is an identity, not a preference: it is what a printed record says the
              record belongs to, so it is locked exactly as First/Last Name are. */}
          <View style={{ marginBottom: space.md }} testID="row-department-name">
            <Muted>Department Name</Muted>
            <Text variant="bodyStrong" testID="text-department">{user?.department || '—'}</Text>
            <Muted style={{ marginTop: 2 }}>
              Locked once the account exists — it is printed on every report you have already generated, so changing it goes through support.
            </Muted>
          </View>
          <View style={desktop ? { flexDirection: 'row', gap: space.md } : undefined}>
            <View style={half}>
              <TextField label="Badge" value={badge} onChangeText={setBadge} testID="input-badge" maxLength={40} help="Your badge or shield number. It prints under the department masthead on reports, so a printed record identifies who produced it." />
            </View>
            <View style={half}>
              <TextField label="Duty Assignment" value={duty} onChangeText={setDuty} testID="input-duty" maxLength={80} help="The unit or division you are posted to — e.g. K9 Unit, Patrol Division. It prints alongside your badge number on reports." />
            </View>
          </View>
          <View style={{ marginBottom: space.md }}>
            <Text variant="label">Department Logo</Text>
            <Muted>Printed at the top of every report — it is what makes a printed record look like it came from your department.</Muted>
            <Row wrap gap={space.md} align="center" style={{ marginTop: 6 }}>
              {user?.department_logo_uri ? (
                <Image
                  source={{ uri: user.department_logo_uri }}
                  resizeMode="contain"
                  accessibilityLabel={`${user?.department || 'Department'} logo`}
                  testID="img-department-logo"
                  style={{ width: 120, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt }}
                />
              ) : (
                <View testID="img-department-logo-empty" style={{ width: 120, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Muted>No logo</Muted>
                </View>
              )}
              <Button title={user?.department_logo_uri ? 'Change logo' : 'Upload logo'} variant="secondary" onPress={() => void pickDepartmentLogo()} testID="btn-upload-department-logo" />
              {user?.department_logo_uri ? (
                <Button title="Remove logo" variant="ghost" onPress={() => void repo.upsert('user', { id: user.id, department_logo_uri: null }, { label: 'Department logo removed' })} testID="btn-remove-department-logo" />
              ) : null}
            </Row>
          </View>
          <Button title="Save department details" variant="secondary" onPress={() => void saveDepartment()} testID="btn-save-department" style={{ alignSelf: 'flex-start' }} />
        </Card>
      </Section>

      {/* ---------- Theme ---------- */}
      <Section title="Theme">
        <Card testID="section-theme">
          <Text variant="label" style={{ marginBottom: 6 }}>Preferred interface theme</Text>
          <Segmented
            label="Preferred interface theme"
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]}
            value={preference}
            onChange={(v) => setPreference(v as 'light' | 'dark' | 'system')}
            testID="segmented-theme"
          />
          <Muted style={{ marginTop: space.sm }}>
            System follows your device setting. The choice is remembered on this device and on your account, and the half-circle button in the title bar flips it too.
          </Muted>
        </Card>
      </Section>

      {/* ---------- Report Options ---------- */}
      <Section title="Report Options">
        <Card testID="section-report-options">
          <Text variant="label" style={{ marginBottom: 6 }}>Demographic Data In Reports</Text>
          <Segmented
            label="Demographic Data In Reports"
            options={[{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide' }]}
            value={user?.demographics_in_reports !== false ? 'show' : 'hide'}
            onChange={(v) => void setDemographics(v === 'show')}
            testID="segmented-demographics"
          />
          <Muted style={{ marginTop: space.sm }} testID="text-demographics-help">
            Whether the Race/Ethnicity, Sex At Birth and Age of arrested subjects are printed in deployment reports. Hide stops them printing — the data is still collected and still on the record.
          </Muted>
        </Card>
      </Section>

      {/* ---------- Documents ---------- */}
      <Section title="Uploaded Documents" description="Certificates and reference files, organised into categories.">
        <Card>{user ? <DocumentsSection userId={user.id} /> : null}</Card>
      </Section>

      {/* ---------- Install (PWA — the desktop app, DECISIONS decision 4) ---------- */}
      <Section title="Install App" description={`Keep ${APP_NAME} in the Dock, Start menu or Home screen and use it offline.`}>
        <Card testID="section-install-app"><InstallSection /></Card>
      </Section>

      {/* ---------- Change Password ---------- */}
      <Section title="Change Password">
        <Card testID="section-change-password">
          <View style={desktop ? { flexDirection: 'row', gap: space.md } : undefined}>
            <View style={half}>
              <TextField label="New Password" value={pw} onChangeText={(v) => { setPw(v); setPwError(null); }} secureTextEntry testID="input-new-password" maxLength={20} help="8–20 characters with an uppercase letter, a lowercase letter and a number." />
            </View>
            <View style={half}>
              <TextField label="Confirm Password" value={pw2} onChangeText={(v) => { setPw2(v); setPwError(null); }} secureTextEntry testID="input-confirm-password" maxLength={20} error={pwError} help="Type the new password again. Both boxes must match before it is changed." />
            </View>
          </View>
          <Muted style={{ marginBottom: space.sm }}>Changing your password signs you out everywhere. Sign in again with the new one.</Muted>
          <Button title="Change password" variant="secondary" onPress={() => void changePassword()} testID="btn-change-password" style={{ alignSelf: 'flex-start' }} />
        </Card>
      </Section>

      <BackupSection />

      {/* ---------- Developer ---------- */}
      <Section title="Developer" description="Local demo tools. Nothing here leaves this device.">
        <Card testID="section-developer">
          <Row wrap style={{ marginBottom: space.md }}>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Muted>Data mode</Muted>
              <Text testID="text-data-mode">{DATA_MODE}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Muted>Build</Muted>
              <Text testID="text-build-hash">{BUILD_HASH}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Muted>App name</Muted>
              <Text>{APP_NAME}</Text>
            </View>
          </Row>
          <Muted>Store counts</Muted>
          <Row wrap gap={6} style={{ marginTop: 4, marginBottom: space.md }}>
            <Badge testID="count-records">Records {records}</Badge>
            <Badge testID="count-training-events">Training events {counts.training_event}</Badge>
            <Badge testID="count-exercises">Exercises {counts.exercise}</Badge>
            <Badge testID="count-completions">Completions {counts.completion}</Badge>
            <Badge testID="count-deployments">Deployments {counts.deployment}</Badge>
            <Badge testID="count-classes">Classes {counts.class_record}</Badge>
            <Badge testID="count-vet-visits">Vet visits {counts.vet_visit}</Badge>
            <Badge testID="count-vaccinations">Vaccinations {counts.vaccination}</Badge>
            <Badge testID="count-dogs">Dogs {counts.dog}</Badge>
            <Badge testID="count-history">History {counts.history_event}</Badge>
          </Row>
          <Switch
            label="Simulate phone"
            help="Enables mobile-only features on web (Solo Quick Training, Location Track, Passcode login) so they can be verified in a browser."
            value={prefs.simulatePhone}
            onChange={(v) => update({ simulatePhone: v })}
            testID="switch-simulate-phone"
          />
          <View style={{ height: space.md }} />
          <TextField label="Record count" value={count} onChangeText={setCount} keyboardType="number-pad" testID="input-seed-count" help="Training records to generate on reset (40 = the demo set; 1000 for the report test)." />
          <Button title={busy ? 'Resetting…' : 'Reset demo data'} variant="danger" icon="refresh" onPress={() => setConfirm(true)} loading={busy} testID="btn-reset-demo" style={{ alignSelf: 'flex-start' }} />
          {lastSeed ? <Banner tone="success" testID="banner-last-seed" style={{ marginTop: space.sm, marginBottom: 0 }} title="Demo data reset" body={lastSeed} /> : null}
        </Card>
      </Section>

      <ConfirmDialog
        visible={confirm}
        title="Reset demo data?"
        body={`Everything on this device is replaced by the demo department with ${count || 40} records. You stay signed in as ${user?.name || 'yourself'} — the demo accounts survive the reset.`}
        confirmTitle="Reset"
        tone="danger"
        onCancel={() => setConfirm(false)}
        onConfirm={reset}
        testID="dialog-reset-demo"
      />
    </Screen>
  );
}
