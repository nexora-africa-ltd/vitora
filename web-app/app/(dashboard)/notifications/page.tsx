/**
 * Notifications Page
 * Redirects to dashboard - notifications are accessed via the floating panel
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Loader2 } from 'lucide-react';

export default function NotificationsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard - notifications are in the floating panel
    router.replace('/');
  }, [router]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500/10">
        <Bell className="h-8 w-8 text-cyan-500" />
      </div>
      <Loader2 className="mb-4 h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-lg font-medium">Redirecting...</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Access notifications from the bell icon in the header
      </p>
    </div>
  );
}
