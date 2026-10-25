import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { IosAlertInput, IosAlertModal } from '@/components/ui/ios-alert-modal';
import { makeStyles, useColors } from '@/theme';

const DISCLAIMER =
  'Deleting your account is permanent and cannot be undone.\n\n' +
  '• Your profile and personal data will be removed from our systems.\n' +
  '• Labels, feedback, and other account-linked records will be deleted.\n' +
  '• Your mobile number cannot be used to register again.\n' +
  '• We keep a limited record of this deletion (name, phone, printer, labels printed, and your reason) for our records.\n' +
  '• Anonymous print analytics that are no longer linked to you may remain.';

export function DeleteAccountModal({
  visible,
  busy,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const styles = useStyles();
  const c = useColors();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);

  const ready = reason.trim().length >= 3 && !busy;

  return (
    <IosAlertModal
      visible={visible}
      onClose={busy ? undefined : onCancel}
      dismissOnBackdrop={!busy}
      plainScroll
      cardAlign="center"
      cardMaxWidth={340}
      title="Delete account"
      message={DISCLAIMER}
      buttons={[
        { text: 'Cancel', style: 'cancel', onPress: onCancel, disabled: busy },
        {
          text: busy ? 'Deleting…' : 'Delete account',
          style: 'destructive',
          bold: true,
          disabled: !ready,
          onPress: () => {
            if (!ready) return;
            onConfirm(reason.trim());
          },
        },
      ]}>
      <Text style={styles.label}>Why are you deleting your account?</Text>
      <IosAlertInput
        value={reason}
        onChangeText={setReason}
        placeholder="Please share a brief reason"
        multiline
        editable={!busy}
        maxLength={500}
        style={styles.input}
      />
      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={c.danger} />
          <Text style={styles.busyText}>Removing your account…</Text>
        </View>
      ) : null}
    </IosAlertModal>
  );
}

const useStyles = makeStyles((c) => ({
  label: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  input: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    alignSelf: 'stretch',
  },
  busyText: {
    flexShrink: 1,
    fontSize: 13,
    color: c.textMuted,
  },
}));
