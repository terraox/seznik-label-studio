import type { WalkthroughStep } from '@/lib/walkthrough/home-steps';

/** First visit to the blank label page. Replay from the ? button on that screen. */
export const NEW_LABEL_WALKTHROUGH: readonly WalkthroughStep[] = [
  {
    id: 'welcome',
    title: 'Set up your blank label',
    body: 'Choose the shape and size of your sticker here, then open the editor to design it. You can open this tour again from the ? button.',
  },
  {
    id: 'shape',
    target: 'newLabel.shape',
    scrolls: true,
    title: 'Pick a shape',
    body: 'Rectangle is the usual label. Choose Circle for round stickers.',
  },
  {
    id: 'across',
    target: 'newLabel.across',
    scrolls: true,
    title: 'Labels across',
    body: 'Turn this on if your roll is wide enough to print 2 or more labels next to each other. Leave it off for one label at a time.',
  },
  {
    id: 'size',
    target: 'newLabel.size',
    scrolls: true,
    title: 'Enter the size',
    body: 'Type the width and height in mm. Measure your sticker, or open Size presets below for common sizes.',
  },
  {
    id: 'create',
    target: 'newLabel.create',
    title: 'Create the label',
    body: 'Tap Create Label to open the editor and add text, barcodes, QR codes and images.',
  },
];
