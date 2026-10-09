const FITZPATRICK = new Set(['1f3fb', '1f3fc', '1f3fd', '1f3fe', '1f3ff']);

/** Twemoji file id: lowercase hex code points, no padding, FE0F stripped, ZWJ kept. */
export function clusterToTwemojiId(cluster: string): string {
  const parts: string[] = [];
  for (const ch of cluster) {
    const code = ch.codePointAt(0);
    if (code == null || code === 0xfe0f) continue;
    parts.push(code.toString(16));
  }
  return parts.join('-');
}

/** Exact id, then the same cluster without Fitzpatrick skin tones. */
export function clusterToTwemojiLookupIds(cluster: string): string[] {
  const exact = clusterToTwemojiId(cluster);
  const ids = [exact];
  const withoutSkin = exact
    .split('-')
    .filter((part) => !FITZPATRICK.has(part))
    .join('-');
  if (withoutSkin && withoutSkin !== exact) ids.push(withoutSkin);
  return ids;
}
