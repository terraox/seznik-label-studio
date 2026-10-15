export type CloneNormBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CloneMmBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ClonePxBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CloneCodeHit = {
  kind: 'barcode' | 'qr';
  type: string;
  data: string;
  box?: CloneNormBox;
  pxBox?: ClonePxBox;
};

export type CloneOcrLine = {
  text: string;
  frame?: ClonePxBox;
};

export type CloneDetection = {
  imageWidth: number;
  imageHeight: number;
  codes: CloneCodeHit[];
  lines: CloneOcrLine[];
};

export type CloneMapping = {
  imageWidth: number;
  imageHeight: number;
  content: ClonePxBox;
  originXMm: number;
  originYMm: number;
  mapWidthMm: number;
  mapHeightMm: number;
  widthMm: number;
  heightMm: number;
};
