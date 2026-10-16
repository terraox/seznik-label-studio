export type ParsedProductName = {
  sizeLabel: string | null;
  quantityLabel: string | null;
  widthMm: number | null;
  heightMm: number | null;
  quantity: number | null;
  detailLabel: string;
};

const RECT_SIZE = /(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*mm/i;
const DIAMETER = /(\d+(?:\.\d+)?)\s*Diameter/i;
const LABELS_PER_ROLL = /\((\d+)\s*Labels?\/Roll\)/i;
const LABELS_ONLY = /\((\d+)\s*Labels?\)/i;
const ROLLS_PAREN = /\((\d+)\s*Rolls?\)/i;
const ROLLS_BARE = /(\d+)\s*Rolls?/i;

/** Derive size and quantity display fields from the source product name. Never rewrites the name. */
export function parseProductName(name: string): ParsedProductName {
  const text = name.trim();
  const rect = text.match(RECT_SIZE);
  const diameter = !rect ? text.match(DIAMETER) : null;
  let sizeLabel: string | null = null;
  let widthMm: number | null = null;
  let heightMm: number | null = null;
  if (rect) {
    widthMm = Number(rect[1]);
    heightMm = Number(rect[2]);
    sizeLabel = `${rect[1]}x${rect[2]}mm`;
  } else if (diameter) {
    sizeLabel = `${diameter[1]} Diameter`;
  }

  const perRoll = text.match(LABELS_PER_ROLL);
  const labelsOnly = !perRoll ? text.match(LABELS_ONLY) : null;
  const rollsParen = text.match(ROLLS_PAREN);
  const rollsBare = !perRoll && !labelsOnly && !rollsParen ? text.match(ROLLS_BARE) : null;

  let quantity: number | null = null;
  let quantityLabel: string | null = null;
  if (perRoll) {
    quantity = Number(perRoll[1]);
    quantityLabel = `${perRoll[1]} Labels/Roll`;
  } else if (labelsOnly) {
    quantity = Number(labelsOnly[1]);
    quantityLabel = `${labelsOnly[1]} Labels`;
  } else if (rollsParen) {
    quantity = Number(rollsParen[1]);
    quantityLabel = `${rollsParen[1]} Rolls`;
  } else if (rollsBare) {
    quantity = Number(rollsBare[1]);
    quantityLabel = `${rollsBare[1]} Rolls`;
  }

  const parts = [sizeLabel, quantityLabel].filter(Boolean);
  return {
    sizeLabel,
    quantityLabel,
    widthMm,
    heightMm,
    quantity,
    detailLabel: parts.length > 0 ? parts.join(' · ') : text,
  };
}

export function typeTokens(type: string): string[] {
  return type
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}
