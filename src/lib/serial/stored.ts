import { valueAt } from './engine';
import type { SerialConfig, SerialContext } from './types';

export type ContentKey = 'text' | 'content';

/**
 * Keeps the element's stored text in step with its first serial value, with the legacy step set to 0.
 * Anything that does not know about Serial (thumbnails, history snapshots, templates) then shows the
 * first label instead of a stale placeholder. The real value always comes from resolveDocumentForIndex.
 */
export function storedValuePatch(
  serial: SerialConfig,
  key: ContentKey,
  ctx?: SerialContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = { serial, degreesOffset: 0 };
  if (!serial.linkTo) {
    const first = valueAt(serial, 0, ctx);
    if (first.ok) out[key] = first.value;
  }
  return out;
}
