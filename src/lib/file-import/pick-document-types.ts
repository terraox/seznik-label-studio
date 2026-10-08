export type PickedDocument =
  | { ok: false; reason: 'cancelled' | 'invalid' }
  | { ok: true; name: string; uri: string; size?: number; extension: string };
