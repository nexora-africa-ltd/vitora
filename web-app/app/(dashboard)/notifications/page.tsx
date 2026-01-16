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
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
        <Bell className="h-8 w-8 text-cyan-500" />
      </div>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-4" />
      <p className="text-lg font-medium">Redirecting...</p>
      <p className="text-sm text-muted-foreground mt-1">
        Access notifications from the bell icon in the header
      </p>
    </div>
  );
}
