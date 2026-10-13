export type SystemAlertButtonInput = {
  text?: string;
  onPress?: ((value?: string) => void) | (() => void);
  isPreferred?: boolean;
  style?: 'default' | 'cancel' | 'destructive';
};

export type SystemAlertOptions = {
  cancelable?: boolean | null;
  onDismiss?: () => void;
};

export type SystemAlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
  bold?: boolean;
};

export type SystemAlertRequest = {
  title?: string;
  message?: string;
  buttons: SystemAlertButton[];
  cancelable: boolean;
  onDismiss?: () => void;
};

export type QueuedSystemAlert = SystemAlertRequest & { id: number };

const listeners = new Set<() => void>();
let queue: QueuedSystemAlert[] = [];
let nextId = 1;

function emit() {
  for (const listener of [...listeners]) listener();
}

/** Map an `Alert.alert` call onto one iOS-style popup. Keeps every button. */
export function normalizeSystemAlert(
  title?: string | null,
  message?: string | null,
  buttons?: SystemAlertButtonInput[] | null,
  options?: SystemAlertOptions | null,
): SystemAlertRequest {
  const trimmedTitle = title?.trim() ? title : undefined;
  const trimmedMessage = message?.trim() ? message : undefined;
  const source = buttons?.length ? buttons : [{ text: 'OK', isPreferred: true }];

  const mapped: SystemAlertButton[] = source.map((button) => ({
    text: button.text?.trim() ? button.text : 'OK',
    style: button.style,
    bold: button.isPreferred || source.length === 1 ? true : undefined,
    onPress: button.onPress ? () => button.onPress?.() : undefined,
  }));

  return {
    title: trimmedTitle,
    message: trimmedMessage,
    buttons: placeCancelOnTheLeft(mapped),
    cancelable: options?.cancelable === true,
    onDismiss: options?.onDismiss,
  };
}

/** Two-button iOS alerts put Cancel on the left. Longer lists keep call-site order. */
function placeCancelOnTheLeft(buttons: SystemAlertButton[]): SystemAlertButton[] {
  if (buttons.length !== 2) return buttons;
  const cancelIndex = buttons.findIndex((button) => button.style === 'cancel');
  if (cancelIndex <= 0) return buttons;
  return [buttons[1], buttons[0]];
}

export function subscribeSystemAlerts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCurrentSystemAlert(): QueuedSystemAlert | null {
  return queue[0] ?? null;
}

export function enqueueSystemAlert(request: SystemAlertRequest) {
  queue = [...queue, { ...request, id: nextId }];
  nextId += 1;
  emit();
}

export function dismissCurrentSystemAlert(): QueuedSystemAlert | null {
  const current = queue[0] ?? null;
  queue = queue.slice(1);
  emit();
  return current;
}

export function resetSystemAlertsForTests() {
  queue = [];
  nextId = 1;
  listeners.clear();
}
