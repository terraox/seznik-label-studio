import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Alert, Platform, type AlertButton, type AlertOptions } from 'react-native';

import { IosAlertModal } from '@/components/ui/ios-alert-modal';
import {
  dismissCurrentSystemAlert,
  enqueueSystemAlert,
  getCurrentSystemAlert,
  normalizeSystemAlert,
  subscribeSystemAlerts,
  type SystemAlertButtonInput,
  type SystemAlertOptions,
} from '@/lib/ios-system-alert';

function isAlertOptions(value: AlertButton[] | AlertOptions | undefined): value is AlertOptions {
  return value != null && !Array.isArray(value);
}

function presentSystemAlert(
  title: string,
  message?: string | AlertButton[],
  buttons?: AlertButton[] | AlertOptions,
  options?: AlertOptions,
) {
  if (Array.isArray(message)) {
    enqueueSystemAlert(
      normalizeSystemAlert(
        title,
        undefined,
        message as SystemAlertButtonInput[],
        isAlertOptions(buttons) ? (buttons as SystemAlertOptions) : undefined,
      ),
    );
    return;
  }

  if (Array.isArray(buttons) || buttons == null) {
    enqueueSystemAlert(
      normalizeSystemAlert(
        title,
        message,
        buttons as SystemAlertButtonInput[] | undefined,
        options,
      ),
    );
    return;
  }

  enqueueSystemAlert(normalizeSystemAlert(title, message, undefined, buttons));
}

if (Platform.OS !== 'ios') {
  Alert.alert = presentSystemAlert as typeof Alert.alert;
}

/** Renders the iOS-style popup used in place of Android (and web) system alerts. */
export function IosAlertHost() {
  const alert = useSyncExternalStore(subscribeSystemAlerts, getCurrentSystemAlert, getCurrentSystemAlert);
  const closing = useRef(false);

  useEffect(() => {
    closing.current = false;
  }, [alert?.id]);

  if (!alert) return null;

  const close = (action?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    dismissCurrentSystemAlert();
    action?.();
  };

  return (
    <IosAlertModal
      key={alert.id}
      visible
      title={alert.title}
      message={alert.message}
      dismissOnBackdrop={false}
      onRequestClose={() => {
        if (!alert.cancelable) return;
        close(alert.onDismiss);
      }}
      buttons={alert.buttons.map((button) => ({
        text: button.text,
        style: button.style,
        bold: button.bold,
        onPress: () => close(button.onPress),
      }))}
    />
  );
}
