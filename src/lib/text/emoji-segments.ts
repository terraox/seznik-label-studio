import createEmojiRegex from 'emoji-regex';

export type PrintTextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'emoji'; value: string };

let emojiSplitRe: RegExp | null = null;

function emojiSplitPattern(): RegExp {
  if (!emojiSplitRe) {
    emojiSplitRe = createEmojiRegex();
  }
  return emojiSplitRe;
}

/** Split a print line into plain text runs and emoji grapheme clusters (ZWJ-aware). */
export function splitPrintTextSegments(text: string): PrintTextSegment[] {
  if (!text) return [];
  const re = emojiSplitPattern();
  const segments: PrintTextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, start) });
    }
    segments.push({ kind: 'emoji', value: match[0] });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) });
  }
  return segments.length > 0 ? segments : [{ kind: 'text', value: text }];
}
