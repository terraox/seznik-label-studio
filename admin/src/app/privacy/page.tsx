import type { Metadata } from 'next';

/**
 * Public privacy policy for the Seznik Label Studio app (linked from Google Play and from the app).
 * No sign-in. Keep it in step with src/lib/legal-text.ts in the app and with what the server stores
 * (admin/prisma/schema.prisma, admin/src/app/api/app/account/delete/route.ts).
 */
export const metadata: Metadata = {
  title: { absolute: 'Privacy Policy · Seznik Label Studio' },
  description: 'How Seznik Label Studio collects, uses, shares and deletes your data.',
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = 'tech_support@seznik.in';
const UPDATED = '29 October 2026';

type Section = { heading: string; paragraphs?: string[]; items?: string[] };

const SECTIONS: Section[] = [
  {
    heading: 'Who we are',
    paragraphs: [
      'Seznik Label Studio ("the app", "we", "us") lets you design labels on your phone and print them to a Bluetooth thermal label printer. This policy explains what the app collects, why, who receives it, and how you can delete it. For any question about your data, write to ' +
        CONTACT_EMAIL +
        '.',
    ],
  },
  {
    heading: 'What we collect and store on our server',
    paragraphs: ['When you create an account and use the app, our server stores:'],
    items: [
      'Account details: your name, your mobile number, and your password. The password is stored only as a salted hash, never in readable form.',
      'The printer model you use (Tejas, Rudra or Josh) and the printers you connect, with the connection type.',
      'Device and app details: your phone model, platform (Android), app version, and when you last opened the app and last signed in.',
      'Print activity: when you print, the label size, the name of the template used, how many labels were printed, which part of the app started the print, the printer used and the time. We do not store the label pictures or the text and data you print.',
      'Product taps: which supplies in the in-app shop you tapped, linked to your account.',
      'Feature-use counts: how many times each feature was used on a given day. These counts are not linked to your account.',
      'What you send us on purpose: feedback, ratings, complaints and template requests, including any text you type in them.',
      'Technical logs: like most servers, ours records technical details of each request, such as the time and IP address, for security and troubleshooting.',
    ],
  },
  {
    heading: 'What stays on your phone',
    paragraphs: [
      'Your labels, templates, fonts, clip art, imported Excel, PDF and image files, and your print history are stored on your phone. They are not uploaded to us. They leave your phone only if you choose to share or send them, for example with the Share button.',
      'If you add a remote data link, the phone downloads the file straight from the address you entered. It does not pass through our server.',
    ],
  },
  {
    heading: 'Permissions the app asks for',
    items: [
      'Bluetooth / Nearby devices: to find, pair with and print to your label printer. On Android 11 and older, Android requires the location permission for Bluetooth scanning. We do not read, collect or store your location.',
      'Camera: to scan barcodes, QR codes and printed text. Scanning and text recognition run on your phone using Google ML Kit and Google Play services, and the pictures are not sent to us.',
      'Microphone: only when you use voice-to-text while editing a label. The audio is handled by your phone’s speech-recognition service (on Android, Google’s), which may process it on Google’s servers under Google’s privacy policy. We do not receive or store the audio.',
      'Photos and files: only the images and files you pick yourself through the system picker. We have no access to your other photos or files.',
      'Internet: to sign in, send the one-time code, load templates and clip art, and send the details listed above.',
    ],
  },
  {
    heading: 'How we use it',
    paragraphs: [
      'We do not sell your personal information, we do not show advertising, and the app contains no third-party advertising or analytics tools. We use the data:',
    ],
    items: [
      'To create and secure your account and sign you in, including checking your mobile number with a one-time code sent by SMS.',
      'To run the app: load templates, clip art and settings, and show the printers and supplies relevant to you.',
      'To support you, answer feedback and complaints, and fix problems.',
      'To understand how the app is used (for example which features are used most) so we can improve it.',
      'To keep the service safe, including blocking accounts that are misused.',
    ],
  },
  {
    heading: 'Who receives your data',
    paragraphs: ['We share data only with providers that help us run the app, and only what they need:'],
    items: [
      'MSG91, our SMS provider, receives your mobile number and the one-time code in order to send you the SMS.',
      'Our hosting and database providers (DigitalOcean for the server and Neon for the database) store the data described above on our behalf.',
      'Expo (the app update service) receives your IP address, app version and platform when the app checks for updates.',
      'Google, for the on-device scanning and the speech recognition described above, when you use those features.',
      'Authorities, if the law requires us to share information.',
    ],
  },
  {
    heading: 'Security',
    paragraphs: [
      'Data between the app and our server is sent over HTTPS. Passwords are stored as hashes. Only a small number of our team can see account data, and they sign in with a password and a second factor. No method is completely secure, so we cannot guarantee absolute security.',
    ],
  },
  {
    heading: 'How long we keep data, and deleting your account',
    paragraphs: [
      'We keep your account data while your account is active. You can delete your account at any time in the app under Settings, or request it by email. The steps are at https://api2.seznik.in/delete-account. In the app you are asked to tell us why. When you confirm:',
    ],
    items: [
      'Your account, feedback, template requests, product taps and printer connection history are deleted.',
      'Print records that remain are no longer linked to you.',
      'Your mobile number is freed so it can be registered again, unless we blocked it for misuse. If we blocked it, we keep the number and the reason so the block still works.',
      'We keep one deletion record: your name, mobile number, printer, the number of labels you printed, the reason you gave, your sign-up date, and your app version and platform. We keep it for our records and to prevent misuse.',
    ],
  },
  {
    heading: 'Your choices and rights',
    paragraphs: [
      'You can ask us to show you, correct or erase the data we hold about you, including the deletion record described above, by writing to ' +
        CONTACT_EMAIL +
        '. Include the mobile number you registered with so we can find your records. We will respond within a reasonable time and will erase the data unless the law requires us to keep it.',
      'You can turn off any permission in your phone’s Settings, Apps, Seznik Label Studio, Permissions. Features that need that permission will then stop working, but the rest of the app will keep working.',
    ],
  },
  {
    heading: 'Children',
    paragraphs: [
      'The app is not meant for children under 13, and we do not knowingly collect their data. If you believe a child has given us data, write to us and we will delete it.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'If we change what the app collects, we will update this page and its date. Using the app after a change means you accept it.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: ['Seznik Label Studio, tech support: ' + CONTACT_EMAIL],
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

export default function PrivacyPolicyPage() {
  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <h1 style={styles.title}>Privacy Policy</h1>
        <p style={styles.meta}>Seznik Label Studio · Last updated {UPDATED}</p>
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 style={styles.h2}>{section.heading}</h2>
            {section.paragraphs?.map((text) => (
              <p key={text} style={styles.p}>
                {text}
              </p>
            ))}
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
