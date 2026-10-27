import { useEffect, useState } from 'react';

import { IosAlertInput, IosAlertModal } from '@/components/ui/ios-alert-modal';
import { PRINTER_NICKNAME_MAX } from '@/stores/printer-store';

type NicknameDialogProps = {
  visible: boolean;
  /** Current nickname, or null when none is set. */
  nickname: string | null;
  /** The printer's own Bluetooth name, shown as a hint. */
  deviceName: string | null;
  onSave: (nickname: string | null) => void;
  onClose: () => void;
};

export function NicknameDialog({ visible, nickname, deviceName, onSave, onClose }: NicknameDialogProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) setValue(nickname ?? '');
  }, [visible, nickname]);

  const save = () => onSave(value.trim() || null);
  return (
    <IosAlertModal
      visible={visible}
      title="Printer nickname"
      message={deviceName ? `Bluetooth name: ${deviceName}` : undefined}
      onRequestClose={onClose}
      plainScroll
      buttons={[
        { text: 'Cancel', style: 'cancel', onPress: onClose },
        ...(nickname ? [{ text: 'Remove', style: 'destructive' as const, onPress: () => onSave(null) }] : []),
        { text: 'Save', style: 'default', bold: true, onPress: save },
      ]}>
      <IosAlertInput
        value={value}
        onChangeText={setValue}
        maxLength={PRINTER_NICKNAME_MAX}
        placeholder="e.g. Shop counter"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
      />
    </IosAlertModal>
  );
}
