import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Seznik Admin Panel', template: '%s · Seznik Admin' },
  description: 'SEZ Print desk — devices, library, feedback, and settings.',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions (e.g. ColorZilla's cz-shortcut-listen) and the theme toggle change these
    // two tags before React loads; that is expected, so the mismatch warning is switched off here only.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
