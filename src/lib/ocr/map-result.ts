import { OCR_ERROR_MESSAGES, OcrError } from './errors';
import type {
  NativeOcrBlock,
  NativeOcrFrame,
  NativeOcrLine,
  NativeOcrResult,
  OcrBlock,
  OcrFrame,
  OcrImageSize,
  OcrLine,
  OcrRecognitionResult,
} from './types';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function mapOcrFrame(frame: NativeOcrFrame | undefined, scale: number): OcrFrame | undefined {
  if (!frame) return undefined;
  if (
    !isFiniteNumber(frame.left) ||
    !isFiniteNumber(frame.top) ||
    !isFiniteNumber(frame.width) ||
    !isFiniteNumber(frame.height)
  ) {
    return undefined;
  }
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    left: frame.left * safeScale,
    top: frame.top * safeScale,
    width: frame.width * safeScale,
    height: frame.height * safeScale,
  };
}

function mapLine(line: NativeOcrLine, scale: number): OcrLine {
  return {
    text: (line.text ?? '').trim(),
    frame: mapOcrFrame(line.frame, scale),
  };
}

function mapBlock(block: NativeOcrBlock, scale: number): OcrBlock {
  const lines = (block.lines ?? []).map((line) => mapLine(line, scale));
  return {
    text: (block.text ?? '').trim(),
    frame: mapOcrFrame(block.frame, scale),
    lines,
  };
}

export function mapNativeOcrResult(
  native: NativeOcrResult | null | undefined,
  imageSize: OcrImageSize,
  frameScale = 1,
): OcrRecognitionResult {
  const blocks = (native?.blocks ?? []).map((block) => mapBlock(block, frameScale));
  const lines = blocks.flatMap((block) => block.lines);
  const text = (native?.text ?? '').trim();

  if (!text) {
    throw new OcrError('no_text', OCR_ERROR_MESSAGES.no_text);
  }

  return {
    text,
    blocks,
    lines,
    imageSize: {
      width: imageSize.width,
      height: imageSize.height,
    },
  };
}
