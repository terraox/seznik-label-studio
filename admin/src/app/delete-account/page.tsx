import type { Metadata } from 'next';

/**
 * Public "how to delete your account" page for Seznik Label Studio. Google Play asks for this link in
 * the Data safety form. Keep it in step with admin/src/app/api/app/account/delete/route.ts (what is
 * deleted and what is kept) and with /privacy.
 */
export const metadata: Metadata = {
  title: { absolute: 'Delete your account · Seznik Label Studio' },
  description: 'How to delete your Seznik Label Studio account and what happens to your data.',
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = 'tech_support@seznik.in';
const UPDATED = '29 October 2026';

type Section = { heading: string; paragraphs?: string[]; steps?: string[]; items?: string[] };

const SECTIONS: Section[] = [
  {
    heading: 'Delete your account in the app',
    paragraphs: ['This is the quickest way. Your account is deleted straight away.'],
    steps: [
      'Open Seznik Label Studio and sign in.',
      'Go to the Setting tab.',
      'Tap Delete account.',
      'Tell us briefly why you are leaving. This is required, so we can improve the app.',
      'Confirm. Your account is deleted and you are signed out.',
    ],
  },
  {
    heading: 'Request deletion without the app',
    paragraphs: [
      'If you cannot open the app, for example because you uninstalled it or lost your phone, email ' +
        CONTACT_EMAIL +
        ' with the subject "Delete my account". Include the mobile number you registered with and your name as you entered it in the app. We may ask you to confirm that the number is yours before we delete the account. We will tell you when it is done.',
    ],
  },
  {
    heading: 'What is deleted',
    items: [
      'Your account: name, mobile number and password (stored only as a hash).',
      'The printers you connected and your connection history.',
      'Feedback, complaints and template requests you sent.',
      'The supplies you tapped in the in-app shop.',
      'Your mobile number is released, so it can be used to register again.',
    ],
  },
  {
    heading: 'What we keep',
    items: [
      'A deletion record: your name, mobile number, printer, the number of labels you printed, the reason you gave, your sign-up date, and your app version and platform. We keep it for our records and to prevent misuse.',
      'Print records and feature-use counts. They are no longer linked to you and cannot be used to identify you.',
      'If we blocked your number for misuse, we keep the number and the reason, so the block still applies.',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'The deletion record has no fixed expiry. We keep it until you ask us to erase it, or until we no longer need it for the purposes above. To have it erased, email ' +
        CONTACT_EMAIL +
        ' with your registered mobile number and ask us to erase your deletion record. We will erase it unless the law requires us to keep it or the number is blocked for misuse.',
    ],
  },
  {
    heading: 'Data on your phone',
    paragraphs: [
      'Your labels, templates, fonts and imported files are stored only on your phone. They are removed when you uninstall the app or clear its data. We cannot see or delete them for you.',
    ],
  },
  {
    heading: 'More information',
    paragraphs: [
      'Read the full privacy policy at https://api2.seznik.in/privacy. For any question, write to ' +
        CONTACT_EMAIL +
        '.',
    ],
  },
];

const styles = {
  page: {
    background: '#ffffff',
    color: '#1a1f2b',
    minHeight: '100vh',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    lineHeight: 1.6,
  },
  wrap: { maxWidth: 760, margin: '0 auto', padding: '40px 20px 64px' },
  title: { fontSize: 32, margin: '0 0 4px', lineHeight: 1.2 },
  meta: { color: '#5a6478', margin: '0 0 32px', fontSize: 14 },
  h2: { fontSize: 20, margin: '32px 0 8px' },
  p: { margin: '0 0 12px', fontSize: 16 },
  li: { margin: '0 0 8px', fontSize: 16 },
} as const;

export default function DeleteAccountPage() {
  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <h1 style={styles.title}>Delete your Seznik Label Studio account</h1>
        <p style={styles.meta}>Seznik Label Studio · Last updated {UPDATED}</p>
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 style={styles.h2}>{section.heading}</h2>
            {section.paragraphs?.map((text) => (
              <p key={text} style={styles.p}>
                {text}
              </p>
            ))}
            {section.steps ? (
              <ol>
                {section.steps.map((text) => (
                  <li key={text} style={styles.li}>
                    {text}
                  </li>
                ))}
              </ol>
            ) : null}
            {section.items ? (
              <ul>
                {section.items.map((text) => (
                  <li key={text} style={styles.li}>
                    {text}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  );
}
