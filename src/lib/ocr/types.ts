export type OcrFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type OcrLine = {
  text: string;
  frame?: OcrFrame;
};

export type OcrBlock = {
  text: string;
  frame?: OcrFrame;
  lines: OcrLine[];
};

export type OcrImageSize = {
  width: number;
  height: number;
};

export type OcrRecognitionResult = {
  text: string;
  blocks: OcrBlock[];
  lines: OcrLine[];
  imageSize: OcrImageSize;
};

export type NativeOcrFrame = {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
};

export type NativeOcrLine = {
  text?: string;
  frame?: NativeOcrFrame;
  elements?: unknown[];
};

export type NativeOcrBlock = {
  text?: string;
  frame?: NativeOcrFrame;
  lines?: NativeOcrLine[];
};

export type NativeOcrResult = {
  text?: string;
  blocks?: NativeOcrBlock[];
};

export type PreparedOcrImage = {
  uri: string;
  width: number;
  height: number;
  temporary: boolean;
};

export type OcrEngine = {
  recognize: (uri: string) => Promise<NativeOcrResult>;
};

export type OcrRecognizeDeps = {
  engine: OcrEngine;
  inspectImage: (uri: string) => Promise<OcrImageSize>;
  prepareImage: (uri: string, size: OcrImageSize) => Promise<PreparedOcrImage>;
  cleanupPreparedImage?: (prepared: PreparedOcrImage) => Promise<void>;
};
