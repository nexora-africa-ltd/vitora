import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { PWARegister } from '@/components/pwa/pwa-register';
import { UmamiAnalytics } from '@/components/analytics/umami';
import { APP_NAME } from '@/lib/utils/constants';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: 'Offline-first Hospital Management Information System for Kenya',
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  icons: {
    icon: [
      {
        url: '/favicon-light.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/favicon-dark.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    shortcut: '/favicon-light.png',
    apple: '/favicon-light.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1516' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <PWARegister />
        <UmamiAnalytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
