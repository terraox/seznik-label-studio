import type { WalkthroughStep } from '@/lib/walkthrough/home-steps';

export type PdfTourScreen = 'pick' | 'presize' | 'size' | 'edit' | 'print';

/**
 * Print PDF tours, one per screen. Each shows the first time that screen opens;
 * the i button in the header replays the tour for the screen you are on.
 */
export const PDF_WALKTHROUGHS: Record<PdfTourScreen, readonly WalkthroughStep[]> = {
  pick: [
    {
      id: 'welcome',
      title: 'Print a PDF',
      body: 'Bring in a PDF, set the label size, fix the page if needed, then print. Tap the i button any time to see help for the screen you are on.',
    },
    {
      id: 'import',
      target: 'pdf.import',
      title: 'Choose what to print',
      body: 'Shipping labels crop Amazon, Flipkart or Meesho PDFs for you. Print PDF opens any other file so you can set the size and crop yourself.',
    },
  ],
  presize: [
    {
      id: 'size',
      target: 'pdf.size',
      scrolls: true,
      title: 'Set the label size',
      body: 'Choose the size of your sticker first. Pick a ready size or type your own width and height.',
    },
    {
      id: 'next',
      target: 'pdf.next',
      title: 'Choose your PDF',
      body: 'Tap Continue to pick the PDF. It opens ready to edit at this size.',
    },
  ],
  size: [
    {
      id: 'file',
      target: 'pdf.file',
      title: 'Your PDF',
      body: 'This shows the file name and how many pages it has. Tap Change to pick a different PDF.',
    },
    {
      id: 'size',
      target: 'pdf.size',
      scrolls: true,
      title: 'Set the label size',
      body: 'Choose the size of your sticker. The preview shows how your PDF page fits on it. Pick a ready size or type your own width and height.',
    },
    {
      id: 'next',
      target: 'pdf.next',
      title: 'Go to editing',
      body: 'Tap Next when the size looks right. You can still change it later by going back.',
    },
  ],
  edit: [
    {
      id: 'stage',
      target: 'pdf.stage',
      title: 'Your page',
      body: 'This is the page as it will print. With several pages, use the arrows under it to move between them.',
    },
    {
      id: 'crop',
      target: 'pdf.tool.crop',
      title: 'Crop',
      body: 'Keep only the part you want, like one shipping label on a full A4 page. Drag the box, or use Smart Crop to find the labels for you.',
    },
    {
      id: 'rotate',
      target: 'pdf.tool.rotate',
      title: 'Rotate',
      body: 'Turn the page if it prints sideways or upside down.',
    },
    {
      id: 'sharpness',
      target: 'pdf.tool.sharpness',
      title: 'Sharpness',
      body: 'Make small text and barcodes crisper so they print clearly.',
    },
    {
      id: 'watermark',
      target: 'pdf.tool.watermark',
      title: 'Watermark',
      body: 'Add your name, a stamp or a logo on top of the page.',
    },
    {
      id: 'color',
      target: 'pdf.tool.color',
      title: 'Color',
      body: 'Choose how colors turn into black and white dots. Change it if the print looks too light or too dark.',
    },
    {
      id: 'next',
      target: 'pdf.headerNext',
      title: 'Ready to print',
      body: 'Tap Next to go to the print screen.',
    },
  ],
  print: [
    {
      id: 'preview',
      target: 'pdf.preview',
      title: 'Final preview',
      body: 'This is what will be sent to the printer, with the label size shown under it.',
    },
    {
      id: 'copies',
      target: 'pdf.copies',
      scrolls: true,
      title: 'Number of copies',
      body: 'How many times to print each page. Use + and - to change it.',
    },
    {
      id: 'pages',
      target: 'pdf.pages',
      scrolls: true,
      title: 'Which pages',
      body: 'Print all pages, only the current one, a range like 1 to 4, or pages you choose like 1, 3, 5. Tap here to open the choices.',
    },
    {
      id: 'advanced',
      target: 'pdf.advanced',
      scrolls: true,
      title: 'Advanced settings',
      body: 'Change print darkness, speed, gap and position. Leave these on Auto unless your print looks too light, too dark or off-center.',
    },
    {
      id: 'print',
      target: 'pdf.print',
      title: 'Print',
      body: 'Sends the pages to your printer. If the button says Connect printer, tap it to connect first.',
    },
  ],
};
