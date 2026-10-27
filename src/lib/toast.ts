/** A small message at the bottom of the screen, with an optional action such as Undo. */
export type ToastRequest = {
  message: string;
  /** Label of the action button, e.g. "Undo". */
  actionLabel?: string;
  onAction?: () => void;
  /** How long it stays up. Default 5000. */
  durationMs?: number;
};

export type ActiveToast = ToastRequest & { id: number };

const listeners = new Set<() => void>();
let current: ActiveToast | null = null;
let nextId = 1;

function emit() {
  listeners.forEach((l) => l());
}

/** Shows a toast, replacing any that is up. */
export function showToast(request: ToastRequest): void {
  current = { ...request, id: nextId++ };
  emit();
}

export function dismissToast(id?: number): void {
  if (!current || (id != null && current.id !== id)) return;
  current = null;
  emit();
}

export function getCurrentToast(): ActiveToast | null {
  return current;
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
