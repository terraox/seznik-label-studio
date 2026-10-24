/**
 * Help topics: one page each, written from what the app does today. Plain data so it can be tested
 * in node and read by both the Help tab (the list) and the topic page (the body).
 */

export type HelpBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'bullets'; items: string[] }
  | { type: 'tip'; text: string };

export type HelpTopic = {
  id: string;
  title: string;
  summary: string;
  /** A name AppIcon knows. */
  icon:
    | 'plus.circle'
    | 'photo'
    | 'list.number'
    | 'tag'
    | 'tablecells'
    | 'doc.text'
    | 'square.and.arrow.down.on.square'
    | 'printer.fill';
  blocks: HelpBlock[];
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'new-label',
    title: 'New Label',
    summary: 'Start a label from scratch: size, shape, designing, saving and printing.',
    icon: 'plus.circle',
    blocks: [
      { type: 'text', text: 'New Label is the big card at the top of Home. It is the way to design your own label from a blank page, or to start from something that already exists.' },
      { type: 'heading', text: '1. Choose how to start' },
      { type: 'text', text: 'Tap New Label and a sheet asks how you want to start:' },
      {
        type: 'bullets',
        items: [
          'Blank label: pick a size and design from scratch.',
          'Industry templates: start from a ready-made design in the Templates tab.',
          'Upload label: turn a photo or a soft copy into a label.',
          'Import label: open a .seznik file someone shared with you.',
        ],
      },
      { type: 'heading', text: '2. Set up the label (Blank label)' },
      { type: 'text', text: 'The setup screen shows a live preview of the label at the top and the choices below it. The round (i) button in the corner replays a short walkthrough of this screen.' },
      {
        type: 'bullets',
        items: [
          'Shape: Rectangle or Circle. A circle asks for one number, the diameter. A rectangle asks for Width and Height.',
          'Size: type the width and height in millimetres, from 8 mm up to 310 mm. Measure your roll, or use the presets below.',
          'Size presets: 50 × 25, 50 × 50, 50 × 30, 50 × 75, 50 × 15, 100 × 150, 100 × 100, 60 × 40 and 40 × 30. Tap one to fill in the size.',
          'Labels across: turn this on when your roll is wide enough for two or more labels side by side, such as small tags. Choose the number of columns (2 to 6) and the gap between them. The screen shows the total width, for example 2 × 25 + 1 × 3 = 53 mm.',
          'How do you want to edit them (only with Labels across): "Edit each label separately" lets you design one label at a time and each can be different. "Edit all together" gives one wide canvas with every label on it, like a template.',
          'Label name: only to find the job again later. It is never printed.',
        ],
      },
      { type: 'tip', text: 'Your printer sets the maximum width it can print. If the label is wider, Sez Print tells you the limit before it prints.' },
      { type: 'text', text: 'Tap Create Label to open the editor.' },
      { type: 'heading', text: '3. Design in the editor' },
      { type: 'text', text: 'The tool bar lists everything you can add. Tap a tool to place it, then drag to move and pull a corner to resize.' },
      {
        type: 'bullets',
        items: [
          'Text, ArcText (text on a curve) and Time (the current date or time).',
          'Barcode and QRCode. Type the content, or bind it to an Excel column.',
          'Image and Clipart. Images can be set to Original, B & W or Halftone, with a Gray Threshold slider for black and white.',
          'Line, Shapes, Table and Border.',
          'Signature: draw your own.',
          'Serial: numbers that count up on each label.',
          'Excel: fields filled from a spreadsheet, one label per row.',
          'Scan reads a barcode with the camera. OCR reads text from a photo.',
          'Label Clone copies this label design to start another.',
        ],
      },
      {
        type: 'text',
        text: 'Tap an item to open its settings: size and position, fonts, alignment, rotation, colour mode and more. Use Undo and Redo if you miss a step.',
      },
      { type: 'heading', text: '4. Save and print' },
      {
        type: 'steps',
        items: [
          'Tap Save so the label is kept. It appears under Continue on Home.',
          'Tap Print. If no printer is connected, the app offers to connect one.',
          'Set copies, print darkness, print speed, gap length, orientation and any horizontal or vertical offset, then tap Print.',
        ],
      },
      { type: 'tip', text: 'Print one label first and check it before running a long job. If the print sits a little off, use the offsets in the print settings to nudge it.' },
    ],
  },
  {
    id: 'upload-label',
    title: 'Upload label',
    summary: 'Turn a photo or a soft copy of a label into an editable label.',
    icon: 'photo',
    blocks: [
      { type: 'text', text: 'Upload label takes a picture of a label and prepares it so you can print it again or edit it. It is under More ways to create on Home, and also in the New Label sheet.' },
      {
        type: 'steps',
        items: [
          'Tap Upload label and choose a PNG or JPG image.',
          'Adjust the crop so only the label is inside the frame. The app tries to detect the label edges for you.',
          'Set the label size on the sizing screen so the printed label matches the real one.',
          'Tap Open in Editor. The picture is on the canvas and you can add text or codes on top.',
          'Save and Print.',
        ],
      },
      { type: 'tip', text: 'A flat, straight, well lit image works best. Photos taken at an angle may need the crop adjusted by hand.' },
    ],
  },
  {
    id: 'serial-labels',
    title: 'Serial Labels',
    summary: 'Print numbered labels such as 001, 002, 003 with a matching barcode.',
    icon: 'list.number',
    blocks: [
      { type: 'text', text: 'Serial Labels makes a run of labels where a value counts up on each one, for assets, bins, boxes or inventory tags. The same number can show as text and as a barcode.' },
      {
        type: 'steps',
        items: [
          'Tap Serial Labels on Home and set the size of one sticker in millimetres, or pick a preset.',
          'Tap Open on canvas. Add a Text or a Barcode and drag it into place.',
          'Open the Serial settings of that item. Choose the Type, then the Start value and the Step.',
          'Set Count: how many labels to print, from 1 to 5000. It is shared by every serial field on the label.',
          'Use the bar under the canvas to look at any label in the series before you print.',
          'Print. Each label gets the next value.',
        ],
      },
      { type: 'heading', text: 'Types' },
      {
        type: 'bullets',
        items: [
          'Number: 1, 2, 3 and so on.',
          'Decimal: 0.5, 1.0, 1.5 and so on.',
          'Letters: A, B ... Z, then AA, AB, like spreadsheet columns.',
          'Letters + Numbers: digits and letters together at a fixed length, such as 00A, 00B.',
          'Hex: 0 to 9 and A to F.',
          'Custom: count with characters you choose.',
        ],
      },
      { type: 'heading', text: 'More options' },
      {
        type: 'bullets',
        items: [
          'Prefix and Suffix: fixed text before and after, such as SN- and -A.',
          'Minimum width and Pad character: Minimum width 3 turns 7 into 007.',
          'Step: how much to add each label. A minus sign counts down.',
          'Same serial as: a barcode and its text can show exactly the same value, so they never differ.',
        ],
      },
      { type: 'tip', text: 'The label name on the setup screen is only for finding the job later and is not printed.' },
    ],
  },
  {
    id: 'shipping-labels',
    title: 'Shipping Labels',
    summary: 'Crop the shipping label out of a marketplace PDF and print it on your roll.',
    icon: 'tag',
    blocks: [
      { type: 'text', text: 'Shipping Labels prints marketplace labels from Amazon, Flipkart and Meesho. It crops the label from the PDF you download and prints it on your label roll.' },
      {
        type: 'steps',
        items: [
          'Tap Shipping Labels on Home and choose your platform.',
          'Upload the label PDF.',
          'Check the preview, choose which labels to print, then tap Print.',
        ],
      },
      {
        type: 'bullets',
        items: [
          'Use the PDF exactly as it came from your seller panel.',
          'A PDF saved again with Ctrl+P, the browser Print dialog, System Print or Save as PDF, a screenshot or a photo may not work. The app will say "Wrong PDF" if it does not match the platform you chose.',
          'If the printer is not connected, the app asks you to connect it first.',
        ],
      },
    ],
  },
  {
    id: 'excel',
    title: 'Excel',
    summary: 'Print one label per row of a spreadsheet.',
    icon: 'tablecells',
    blocks: [
      { type: 'text', text: 'Excel makes labels in bulk. Each row of your sheet becomes one label, so a sheet of 200 products gives 200 labels without typing anything twice.' },
      { type: 'heading', text: 'Print from a sheet' },
      {
        type: 'steps',
        items: [
          'Tap Excel on Home. Choose the label shape and size, the same way as a new label.',
          'Pick your .xlsx or .csv file. Sez Print reads the sheet and shows a preview of the data.',
          'Pick the sheet if the file has more than one.',
          'Choose which columns to include. At least one column is needed.',
          'Optional: turn on "Print a different number of copies for each label" and choose the column that holds the number of copies. A blank or 0 means that label is not printed. Otherwise every label prints once.',
          'Tap Confirm. The labels open in the editor, where you can place and style the fields.',
          'Print. Each row prints as one label.',
        ],
      },
      { type: 'heading', text: 'Bind a field to a column' },
      {
        type: 'text',
        text: 'In the editor, select a text, barcode or QR field and set its content to Data Source, then pick the column name. That field is filled from each row as the labels print.',
      },
      { type: 'tip', text: 'Keep the first row of the sheet for column headings and keep the data in one block with no empty rows. The Data File page in Settings lists the files you have imported.' },
    ],
  },
  {
    id: 'pdf',
    title: 'PDF',
    summary: 'Print any PDF page on a label: crop, rotate, sharpen, watermark.',
    icon: 'doc.text',
    blocks: [
      { type: 'text', text: 'PDF prints any page of a PDF on your label roll. It is useful for invoices, tickets and labels that already come as a PDF.' },
      {
        type: 'steps',
        items: [
          'Tap PDF on Home and choose a PDF document. For marketplace shipping labels, use Shipping Labels instead.',
          'Set the output size to match your label.',
          'Use the tools below to prepare the page.',
          'Choose which pages to apply a tool to (This page, All pages, or a Custom range), then tap Print.',
        ],
      },
      { type: 'heading', text: 'Tools' },
      {
        type: 'bullets',
        items: [
          'Crop: Smart crop finds the sections of a page and you tap one to crop to it. Manual Crop lets you drag the window and its edges yourself. Use Manual Crop if the sections are unclear.',
          'Rotate: turn the page. With more than one page you choose which pages receive the rotation.',
          'Sharpness: Off, 25, 50, 75 or 100. Higher makes thin text and lines darker and more contrasty.',
          'Watermark: add text or an image as a Stamp (one mark you can drag into place) or Tiled (repeated across the page in a brick or straight pattern). Choose the colour and opacity.',
          'Color: Original keeps the PDF colours. B & W is solid black and white, best for text and barcodes. Halftone uses dots for gray areas, best for photos.',
        ],
      },
      { type: 'tip', text: 'For text and barcodes use B & W. Use Halftone only for photos.' },
    ],
  },
  {
    id: 'seznik-files',
    title: '.seznik files',
    summary: 'Share a finished label with someone and open labels sent to you.',
    icon: 'square.and.arrow.down.on.square',
    blocks: [
      { type: 'text', text: 'A .seznik file is a whole label in one file: the design, its pictures, its fonts and a small preview. Send it to another Sez Print user and they get the same label.' },
      { type: 'heading', text: 'Share a label' },
      {
        type: 'steps',
        items: [
          'Open the label and tap Share.',
          'Choose As .seznik to send the file, or As image to send a picture of the label.',
          'Pick the app to send it with, such as WhatsApp or email.',
        ],
      },
      { type: 'heading', text: 'Open a label sent to you' },
      {
        type: 'steps',
        items: [
          'On Home, under Print from file, tap Import. You can also choose Import label in the New Label sheet.',
          'Choose the .seznik file.',
          'The label is added to your labels and opens in the editor.',
        ],
      },
      { type: 'heading', text: 'Good to know' },
      {
        type: 'bullets',
        items: [
          'Printer settings are not part of the file: printer, darkness, speed, gap and offsets stay with your own phone and printer.',
          'If the label uses a font that is not on your phone, the app tells you. Install the font in the Font Library, or the phone font is used instead and the text can wrap differently.',
          'Anything your version of the app does not know, such as a newer clipart or border, is skipped and the app lists what was left out.',
          'Files made before the rename end in .sezlabel and still open.',
          'If you see "Update Sez Print to open this label", the file was made with a newer app. Update the app first.',
          'A file that is damaged or too large (over 30 MB) cannot be opened.',
        ],
      },
    ],
  },
  {
    id: 'printing',
    title: 'Printing and printers',
    summary: 'Connect over Bluetooth, set darkness and speed, and fix a print that is off.',
    icon: 'printer.fill',
    blocks: [
      { type: 'text', text: 'Sez Print works with the Tejas, Rudra and Josh printers right now. More printers are being added.' },
      { type: 'heading', text: 'Connect' },
      {
        type: 'steps',
        items: [
          'Turn the printer on and keep it close to the phone.',
          'Tap the printer chip at the top of Home. Red means not connected and green means ready.',
          'Allow Bluetooth, Location and Nearby devices when the phone asks. You can check them in Settings > App Permissions.',
          'Choose your printer from the list.',
        ],
      },
      { type: 'text', text: 'The app reconnects to your last printer when it opens. If the connection drops while the app is open, tap the chip to connect again.' },
      { type: 'heading', text: 'Print settings' },
      {
        type: 'bullets',
        items: [
          'Copies: how many of each label.',
          'Print darkness and print speed: higher darkness and a slower speed give darker, crisper print. Start with the defaults.',
          'Gap length: the space between labels on the roll.',
          'Orientation and offsets: rotate the print, or nudge it horizontally and vertically if it is a little off the label.',
          'Paper type: choose the one that matches your roll, for example Label or Receipt. Some printers also offer other types.',
        ],
      },
      { type: 'tip', text: 'If a print comes out blank or too dark, change one setting at a time, print a single label, and check it.' },
    ],
  },
];

export function helpTopic(id: string | undefined): HelpTopic | undefined {
  return HELP_TOPICS.find((t) => t.id === id);
}
