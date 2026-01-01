import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/lib/auth/context';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Vitora HMIS - Hospital Management Information System',
  description: 'Offline-first Hospital Management Information System for Kenya',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
