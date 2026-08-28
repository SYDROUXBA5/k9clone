// Profile → Backup. Export this device's records to a file, and restore one from another device.
//
// This exists because there is no server: a laptop and a phone hold separate databases, and the
// browser can clear either of them. A file the handler keeps is both the bridge between devices and
// the only copy that survives a wiped profile or a new phone.
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { APP_NAME } from '@/config';
import { useRepo } from '@/db/provider';
import { useAuth } from '@/features/auth/AuthProvider';
import { Banner, Button, Card, ConfirmDialog, Muted, Row, Section, Text, space, useToast } from '@/ui';
import { BackupError, applyBackup, backupFilename, buildBackup, parseBackup, type BackupFile, type BackupSummary } from './backupModel';

const fmtWhen = (iso: string | null) => {
  if (!iso) return 'an unknown date';
  try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
};

/** The headline entities, in the order a handler would look for them. */
const HEADLINE: Array<[string, string]> = [
  ['completion', 'training records'], ['deployment', 'deployments'], ['class_record', 'classes'],
  ['vet_visit', 'vet visits'], ['track', 'GPS tracks'], ['dog', 'dogs'], ['user', 'accounts'],
];
const describe = (s: BackupSummary) => {
  const bits = HEADLINE.filter(([k]) => s.counts[k]).map(([k, label]) => `${s.counts[k]} ${label}`);
  return bits.length ? bits.join(' · ') : `${s.total} rows`;
};

export function BackupSection({ testID = 'section-backup' }: { testID?: string }) {
  const repo = useRepo();
  const toast = useToast();
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: BackupFile; summary: BackupSummary; name: string } | null>(null);

  const doExport = async () => {
    setBusy('export'); setError(null);
    try {
      const { json, summary } = await buildBackup(repo, APP_NAME);
      const name = backupFilename(new Date(), user?.name);
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        // Revoking immediately can cancel the download in some browsers.
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        setLastExport(`${name} — ${describe(summary)}. Saved to this device's Downloads.`);
        toast.show(`Backup saved — ${summary.total} records`);
      } else {
        const fs = require('expo-file-system') as typeof import('expo-file-system');
        const f = new fs.File(fs.Paths.document, name);
        if (!f.exists) f.create();
        f.write(json);
        setLastExport(`${name} — ${describe(summary)}. Written to this app's documents folder.`);
        toast.show(`Backup written — ${summary.total} records`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      setError(`Export failed — ${msg}`);
      toast.show(`Export failed — ${msg}`, 'error');
    } finally { setBusy(null); }
  };

  const pickAndStage = async () => {
    setBusy('import'); setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true, type: ['application/json', 'text/plain', '*/*'] });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      let text: string;
      if (Platform.OS === 'web') {
        text = await (await fetch(asset.uri)).text();
      } else {
        const fs = require('expo-file-system') as typeof import('expo-file-system');
        text = await new fs.File(asset.uri).text();
      }
      // Validate BEFORE anything is written — a bad file must never leave the store half-replaced.
      const { file, summary } = parseBackup(text);
      setPending({ file, summary, name: asset.name });
    } catch (err) {
      const msg = err instanceof BackupError ? err.message : `Could not read that file — ${err instanceof Error ? err.message : 'unknown error'}`;
      setError(msg);
      toast.show(msg, 'error');
    } finally { setBusy(null); }
  };

  const confirmImport = async () => {
    if (!pending) return;
    const staged = pending;
    setPending(null); setBusy('import'); setError(null);
    try {
      const { userSurvived } = await applyBackup(repo, staged.file, user?.id || null);
      if (userSurvived) {
        toast.show(`Restored ${staged.summary.total} records from ${staged.name}. Still signed in as ${user?.name || 'you'}.`);
      } else {
        toast.show('Restored. That backup does not contain your account, so you have been signed out.');
        await signOut();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      setError(`Restore failed — ${msg}`);
      toast.show(`Restore failed — ${msg}`, 'error');
    } finally { setBusy(null); }
  };

  return (
    <View testID={testID}>
      <Section
        title="Backup"
        description="Your records live on this device only. A backup file is how you move them to another device — and the only copy that survives if this browser's data is cleared."
      >
        <Card>
          <Text style={{ marginBottom: space.sm }}>
          Export here, then open {APP_NAME} on the other device and restore the file there. The two
          devices do not talk to each other, so a restore replaces what is on the receiving device.
        </Text>
        {/* wrap: at 390 the two buttons do not fit side by side and "Restore from file" was clipped
            by the right edge. They stack instead of overflowing. */}
        <Row wrap>
          <Button
            title={busy === 'export' ? 'Preparing…' : 'Export backup'}
            icon="download-outline"
            onPress={doExport}
            loading={busy === 'export'}
            disabled={!!busy}
            testID="btn-export-backup"
          />
          <Button
            title={busy === 'import' ? 'Reading…' : 'Restore from file'}
            variant="secondary"
            icon="folder-open-outline"
            onPress={pickAndStage}
            loading={busy === 'import'}
            disabled={!!busy}
            testID="btn-import-backup"
          />
        </Row>
        {lastExport ? (
          <Banner tone="success" title="Backup saved" body={lastExport} testID="banner-backup-exported" style={{ marginTop: space.sm, marginBottom: 0 }} />
        ) : null}
        {error ? (
          <Banner tone="danger" title="That did not work" body={error} testID="banner-backup-error" style={{ marginTop: space.sm, marginBottom: 0 }} />
        ) : null}
        <View style={{ marginTop: space.sm }}>
          <Muted testID="text-backup-note">
            A backup holds every record on this device, including the demo data. It is a plain file — keep
            it somewhere you would keep any other case material.
          </Muted>
        </View>
      </Card>

      <ConfirmDialog
        visible={!!pending}
        title="Replace everything on this device?"
        body={pending
          ? `“${pending.name}” was exported on ${fmtWhen(pending.summary.exported_at)} and contains ${describe(pending.summary)}.\n\nRestoring REPLACES every record currently on this device. Anything here that is not in the backup is lost. If you have not exported this device yet, cancel and do that first.`
          : ''}
        confirmTitle="Replace and restore"
        tone="danger"
        onCancel={() => setPending(null)}
        onConfirm={confirmImport}
          testID="dialog-confirm-restore"
        />
      </Section>
    </View>
  );
}
