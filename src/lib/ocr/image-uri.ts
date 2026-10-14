import { OCR_ERROR_MESSAGES, OcrError } from './errors';

const SUPPORTED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
  'gif',
  'bmp',
  'tif',
  'tiff',
]);

export function assertRecognizableImageUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) {
    throw new OcrError('invalid_image', OCR_ERROR_MESSAGES.invalid_image);
  }
  if (trimmed.startsWith('data:')) {
    throw new OcrError('unsupported_format', OCR_ERROR_MESSAGES.unsupported_format);
  }

  const path = trimmed.split('?')[0]?.toLowerCase() ?? '';
  const extMatch = path.match(/\.([a-z0-9]+)$/);
  if (extMatch && !SUPPORTED_EXTENSIONS.has(extMatch[1])) {
    throw new OcrError('unsupported_format', OCR_ERROR_MESSAGES.unsupported_format);
  }

  return trimmed;
}
