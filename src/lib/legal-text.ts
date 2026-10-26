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
    updated: 'October 2026',
    sections: [
      {
        heading: 'What we collect',
        body: [
          'Account details: your name, mobile number and the printer you use. Your password is stored only as a secure hash.',
          'Usage details: how many labels you print, which features you use, and your phone model, platform and app version, so we can fix problems and improve the app.',
          'Anything you send us on purpose, such as feedback, complaints and template requests.',
        ],
      },
      {
        heading: 'What stays on your phone',
        body: [
          'Your labels, templates, fonts and imported files are stored on your phone. They are not uploaded unless you choose to share or send them.',
        ],
      },
      {
        heading: 'How we use it',
        body: [
          'To log you in, verify your number with a one-time code sent by SMS, support your account, understand how the app is used, and answer your messages.',
          'We do not sell your personal information.',
        ],
      },
      {
        heading: 'Who sees it',
        body: [
          'Our team can see account and usage details to give support. Services that help us run the app, such as the SMS provider that delivers your one-time code, only receive what they need to do that job.',
        ],
      },
      {
        heading: 'Your choices',
        body: [
          'You can delete your account from Settings. We then remove your personal details and keep only anonymous usage counts. Contact us from Settings, Suggestions and Complaints, for any other request about your data.',
        ],
      },
    ],
  },
};
