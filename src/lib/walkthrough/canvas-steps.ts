import type { WalkthroughStep } from '@/lib/walkthrough/home-steps';

/** First visit to the label canvas. Six steps, same card as the home tour. */
export const CANVAS_WALKTHROUGH: readonly WalkthroughStep[] = [
  {
    id: 'welcome',
    title: 'This is the label canvas',
    body: 'A short tour of how to design a label. You can replay it anytime from Setting → Canvas Walkthrough.',
  },
  {
    id: 'canvas',
    target: 'edit.canvas',
    title: 'Your label',
    body: 'The white sheet is what will print. Drag an element to move it, drag empty space to pan, and tap empty space to deselect. Zoom lives in the editing pad.',
  },
  {
    id: 'size',
    target: 'edit.size',
    holePad: { top: 0 },
    title: 'Label size',
    body: 'Tap the size to change width, height and paper type. What you set here is the size that prints.',
  },
  {
    id: 'savePrint',
    target: 'edit.savePrint',
    title: 'Save and print',
    body: 'Save keeps this label on the phone. Print sends it to the connected printer. Open and Save As are in this row too.',
  },
  {
    id: 'toolbar',
    target: 'edit.toolbar',
    title: 'Undo, lock and label menu',
    body: 'Undo and redo mistakes, lock an element so it cannot move, or open Label for settings, share and upload.',
  },
  {
    id: 'tools',
    target: 'edit.tools',
    title: 'Add something',
    body: 'Tap Text, Barcode, QR code, Image and the other tools to place them on the label. You can also drag a tool onto the sheet.',
  },
];
