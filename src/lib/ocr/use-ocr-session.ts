import { useCallback, useRef, useState } from 'react';

import { copyOcrText } from './copy-text';
import { OCR_ERROR_MESSAGES, OcrError, isOcrError } from './errors';
import { recognizeImage } from './service';
import type { OcrRecognitionResult } from './types';

export type OcrSessionStatus = 'idle' | 'running' | 'done' | 'error';

export function useOcrSession() {
  const [status, setStatus] = useState<OcrSessionStatus>('idle');
  const [result, setResult] = useState<OcrRecognitionResult | null>(null);
  const [error, setError] = useState<OcrError | null>(null);
  const generationRef = useRef(0);
  const runningRef = useRef(false);

  const reset = useCallback(() => {
    generationRef.current += 1;
    runningRef.current = false;
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  const recognize = useCallback(async (uri: string): Promise<OcrRecognitionResult | null> => {
    if (runningRef.current) return null;

    runningRef.current = true;
    const generation = ++generationRef.current;
    setStatus('running');
    setError(null);

    try {
      const next = await recognizeImage(uri);
      if (generation !== generationRef.current) {
        throw new OcrError('cancelled', OCR_ERROR_MESSAGES.cancelled);
      }
      setResult(next);
      setStatus('done');
      return next;
    } catch (caught) {
      if (generation !== generationRef.current) return null;
      if (isOcrError(caught) && caught.code === 'cancelled') return null;
      const nextError = isOcrError(caught)
        ? caught
        : new OcrError('recognition_failed', OCR_ERROR_MESSAGES.recognition_failed, caught);
      setError(nextError);
      setStatus('error');
      throw nextError;
    } finally {
      if (generation === generationRef.current) {
        runningRef.current = false;
      }
    }
  }, []);

  const copy = useCallback(async (text: string) => {
    await copyOcrText(text);
  }, []);

  return {
    status,
    result,
    error,
    running: status === 'running',
    recognize,
    reset,
    copy,
  };
}
