export type WalkthroughStep = {
  id: string;
  /** Registered target id; omit for a centered card. */
  target?: string;
  /** Target lives inside the screen's ScrollView. */
  scrolls?: boolean;
  /** Scroll only when the target is off screen, and just enough to centre it (no jump to the top). */
  scrollsIfHidden?: boolean;
  /** Per-side override of the cutout padding around the target, in px. */
  holePad?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Corner radius of the ring, to match the target's own corners. */
  holeRadius?: number;
  title: string;
  body: string;
};

const BASE_STEPS: readonly WalkthroughStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Seznik Label Studio',
    body: 'A quick tour of the Home screen. You can replay it anytime from Setting → App Walkthrough.',
  },
  {
    id: 'printer',
    target: 'home.printer',
    title: 'Connect your printer',
    body: 'Tap this chip to pair your Bluetooth thermal printer. Red means not connected, green means ready to print.',
  },
  {
    id: 'newLabel',
    target: 'home.newLabel',
    scrolls: true,
    title: 'Create a new label',
    body: 'Start from a blank label: pick a size, then add text, barcodes, QR codes, images and tables.',
  },
  {
    id: 'lastEdited',
    target: 'home.lastEdited',
    scrolls: true,
    title: 'Pick up where you left off',
    body: 'Your most recent label appears here. Edit, print, share, or delete it.',
  },
  {
    id: 'fromFile',
    target: 'home.fromFile',
    scrolls: true,
    title: 'Print from a file',
    body: 'Print labels in bulk from an Excel sheet, print a PDF, or import a .seznik label file.',
  },
  {
    id: 'create',
    target: 'home.create',
    scrolls: true,
    title: 'More ways to create',
    body: 'Scan an existing label, make serial-number labels, or set a fully custom label size.',
  },
  {
    id: 'shop',
    target: 'home.shop',
    scrolls: true,
    title: 'Buy supplies',
    body: 'Order label rolls, ribbons and thermal paper directly from Seznik.',
  },
  {
    id: 'tabs',
    target: 'tabs.bar',
    title: 'Bottom tabs',
    body: 'Template has saved and industry templates, Shop has supplies, Help has guides, and Setting has fonts, clipart, language and printer options.',
  },
];

/** With no saved label yet, the "last edited" step explains the sample card shown during the tour. */
export function getHomeWalkthrough(hasLabels: boolean): readonly WalkthroughStep[] {
  if (hasLabels) return BASE_STEPS;
  return BASE_STEPS.map((s) =>
    s.id === 'lastEdited'
      ? {
          ...s,
          title: 'Your last label shows up here',
          body: "This is a sample card. Once you create or save your first label, the most recent one appears here with Edit, Print, Delete and Share buttons.",
        }
      : s,
  );
}
