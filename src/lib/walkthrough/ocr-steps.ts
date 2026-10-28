import type { WalkthroughStep } from '@/lib/walkthrough/home-steps';

export type OcrTourScreen = 'capture' | 'result';

/**
 * Scan text tours, one per screen. Each shows the first time that screen opens;
 * the i button in the header replays the tour for the screen you are on.
 */
export const OCR_WALKTHROUGHS: Record<OcrTourScreen, readonly WalkthroughStep[]> = {
  capture: [
    {
      id: 'welcome',
      title: 'Scan text',
      body: 'Take a photo of printed text, a barcode or a QR code. The app reads it and adds it to your label so you do not have to type it.',
    },
    {
      id: 'frame',
      target: 'ocr.frame',
      title: 'Line it up',
      body: 'Hold the phone steady and keep what you want to read inside this frame. Good light and a flat page give the best result.',
    },
    {
      id: 'shutter',
      target: 'ocr.shutter',
      title: 'Take the photo',
      body: 'Tap the round button to capture.',
    },
    {
      id: 'torch',
      target: 'ocr.torch',
      title: 'Light',
      body: 'Turn the flashlight on if the place is dark.',
    },
    {
      id: 'gallery',
      target: 'ocr.gallery',
      title: 'Use a saved photo',
      body: 'Already have a photo? Choose it from your gallery instead.',
    },
  ],
  result: [
    {
      id: 'photo',
      target: 'ocr.photo',
      title: 'Your photo',
      body: 'This is the photo that will be read. If it looks blurry or cut off, tap Retake.',
    },
    {
      id: 'type',
      target: 'ocr.type',
      title: 'What is in the photo?',
      body: 'Pick Text for printed words, Barcode for the stripes, or QR code for the square pattern.',
    },
    {
      id: 'read',
      target: 'ocr.read',
      title: 'Read it',
      body: 'Tap this to read the photo. The result appears in the box below.',
    },
    {
      id: 'result',
      target: 'ocr.result',
      scrolls: true,
      title: 'Check the result',
      body: 'Fix any wrong letters right in the box. Copy puts the text on your clipboard.',
    },
    {
      id: 'add',
      target: 'ocr.add',
      title: 'Add to label',
      body: 'Tap this to put the text on your label. It stays greyed out until there is a result.',
    },
  ],
};
