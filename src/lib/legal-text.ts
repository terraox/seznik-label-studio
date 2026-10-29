export type LegalDocId = 'terms' | 'privacy';

export type LegalSection = { heading: string; body: string[] };

export type LegalDoc = { id: LegalDocId; title: string; updated: string; sections: LegalSection[] };

/**
 * Draft wording for the welcome screen. It describes what the app does today, but it has not been
 * reviewed by a lawyer: have it checked, and add the company name and contact details, before release.
 */
export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  terms: {
    id: 'terms',
    title: 'Terms of Service',
    updated: 'October 2026',
    sections: [
      {
        heading: 'Using Seznik Label Studio',
        body: [
          'Seznik Label Studio lets you design labels and print them on supported Seznik printers. By creating an account or logging in, you agree to these terms.',
          'You must give a real name and a mobile number you own. Keep your password private. You are responsible for what happens under your account.',
        ],
      },
      {
        heading: 'Your labels',
        body: [
          'The labels, templates and files you create are yours. You are responsible for the content you print, and you must not use the app to print anything unlawful or that infringes someone else’s rights.',
        ],
      },
      {
        heading: 'Printers and results',
        body: [
          'Print results depend on your printer, its settings and the paper you load. Previews are a guide only. We do not promise that every print will match the preview exactly.',
        ],
      },
      {
        heading: 'Shop links',
        body: [
          'The Shop lists printers and label rolls and opens the seller’s page to buy. Orders, prices, delivery and returns are handled by the seller, not by this app.',
        ],
      },
      {
        heading: 'Fair use',
        body: [
          'Do not try to break, copy or misuse the app or its servers. We may suspend an account that does, or that breaks these terms.',
        ],
      },
      {
        heading: 'Ending your account',
        body: [
          'You can delete your account at any time from Settings. We may update the app and these terms from time to time; using the app after a change means you accept it.',
        ],
      },
    ],
  },
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    updated: '29 October 2026',
    sections: [
      {
        heading: 'What we collect',
        body: [
          'Account details: your name, mobile number and the printer you use. Your password is stored only as a secure hash.',
          'Device and usage details: your phone model, platform and app version, when you last used the app, and what you print (label size, template name, number of labels, printer and time). We do not store the labels or the data you print. We also count how often each feature is used, without linking the counts to you.',
          'Anything you send us on purpose, such as feedback, complaints and template requests, and the supplies you tap in the shop.',
          'Our server also records technical details of each request, such as the time and IP address, for security.',
        ],
      },
      {
        heading: 'What stays on your phone',
        body: [
          'Your labels, templates, fonts, imported files and print history are stored on your phone. They are not uploaded unless you choose to share or send them.',
        ],
      },
      {
        heading: 'Permissions',
        body: [
          'Bluetooth (Nearby devices) connects your printer. On Android 11 and older, Android needs the location permission for Bluetooth scanning; we do not collect your location. The camera scans barcodes, QR codes and text on your phone, and the pictures are not sent to us. The microphone is used only for voice-to-text, which your phone’s speech service (Google’s on Android) may process on its servers; we do not receive the audio.',
        ],
      },
      {
        heading: 'How we use it',
        body: [
          'To log you in, verify your number with a one-time code sent by SMS, support your account, understand how the app is used, keep the service safe, and answer your messages.',
          'We do not sell your personal information and the app shows no ads.',
        ],
      },
      {
        heading: 'Who sees it',
        body: [
          'Our team can see account and usage details to give support. Services that help us run the app receive only what they need: MSG91 (your number and the one-time code, to send the SMS), DigitalOcean and Neon (hosting and database), Expo (IP address, app version and platform when the app checks for updates), and Google (on-device scanning and speech recognition when you use them).',
        ],
      },
      {
        heading: 'Deleting your account',
        body: [
          'You can delete your account from Settings. We then delete your account, feedback, requests, shop taps and printer history, and unlink your print records. We keep one deletion record (name, mobile number, printer, labels printed, your reason, sign-up date, app version and platform) for our records and to prevent misuse, and the number and reason if we blocked it. To ask us to erase that record or to correct your data, write to tech_support@seznik.in.',
        ],
      },
      {
        heading: 'Full policy',
        body: [
          'Read the full policy at https://api2.seznik.in/privacy.',
        ],
      },
    ],
  },
};
