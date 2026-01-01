import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { APP_NAME } from '@/lib/utils/constants';

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: 'Hospital Management Information System for Kenya',
  applicationName: APP_NAME,
  authors: [{ name: 'Vitora Team' }],
  keywords: ['HMIS', 'Healthcare', 'Kenya', 'Hospital Management'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
