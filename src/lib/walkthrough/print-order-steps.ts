import type { WalkthroughStep } from '@/lib/walkthrough/home-steps';

/**
 * Explains Print order the first time Multiply all counts goes above 1 on an Excel print.
 * Replay from the ? next to Print order. Examples use three labels A, B, C repeated twice.
 */
// The ring hugs the 40dp button (radius 10): 4px of padding and a 14px radius follow its corners.
const BUTTON_RING = {
  holePad: { top: 4, right: 4, bottom: 4, left: 4 },
  holeRadius: 14,
  scrollsIfHidden: true,
} as const;

export const PRINT_ORDER_WALKTHROUGH: readonly WalkthroughStep[] = [
  {
    id: 'intro',
    title: 'Each label will print more than once',
    body: 'Multiply all counts is above 1, so every label repeats. Print order only decides which label comes out next. The total number of labels is the same either way.',
  },
  {
    id: 'uncollated',
    target: 'print.order.uncollated',
    ...BUTTON_RING,
    title: 'Uncollated: same label together',
    body: 'Labels A, B, C printed 2 times each come out A A, B B, C C. Pick this to get a stack of each label.',
  },
  {
    id: 'collated',
    target: 'print.order.collated',
    ...BUTTON_RING,
    title: 'Collated: full set, then again',
    body: 'The same job comes out A B C, then A B C again. Pick this to get complete sets you can hand out.',
  },
];
