import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vitora HMIS',
  description: 'Hospital Management Information System for Kenya',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
