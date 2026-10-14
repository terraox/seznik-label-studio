export type OcrErrorCode =
  | 'engine_unavailable'
  | 'invalid_image'
  | 'unsupported_format'
  | 'no_text'
  | 'recognition_failed'
  | 'cancelled';

export class OcrError extends Error {
  readonly code: OcrErrorCode;
  override readonly cause?: unknown;

  constructor(code: OcrErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'OcrError';
    this.code = code;
    this.cause = cause;
  }
}

export function isOcrError(error: unknown): error is OcrError {
  return error instanceof OcrError;
}

export function ocrErrorMessage(error: unknown): string {
  if (isOcrError(error)) return error.message;
  return 'Unable to analyze this image. Please try another photo.';
}

export const OCR_ERROR_MESSAGES: Record<OcrErrorCode, string> = {
  engine_unavailable:
    'Text recognition is not available in this build. Rebuild the development client after enabling the OCR native module.',
  invalid_image: 'This image could not be opened. Capture or choose another photo.',
  unsupported_format: 'This file type is not supported. Use a JPEG or PNG photo.',
  no_text:
    'No readable text was found in this photo. Try a clearer picture, or type the text you see below.',
  recognition_failed: 'Unable to analyze this image. Please try another photo.',
  cancelled: 'Recognition was cancelled.',
};
