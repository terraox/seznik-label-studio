export { copyOcrText } from './copy-text';
export { OcrResultPanel } from './components/ocr-result-panel';
export { OcrError, isOcrError, ocrErrorMessage, OCR_ERROR_MESSAGES } from './errors';
export { recognizeImage } from './service';
export { useOcrSession } from './use-ocr-session';
export type {
  OcrBlock,
  OcrFrame,
  OcrImageSize,
  OcrLine,
  OcrRecognitionResult,
} from './types';
