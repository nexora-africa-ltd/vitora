// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Connects a LAN desktop session to Vitora Cloud for cloud-only workflows.
 * Visit /cloud-sign-in?callbackUrl=/cloud-only-route from a desktop hub session.
 * Inputs: the authenticated local hub session; the hub signs its own exchange proof.
 */

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { connectCloudSession } from '@/lib/api/client';

function getSafeCallbackUrl(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

export default function CloudSignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(searchParams.get('callbackUrl'));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const handleConnect = async () => {
    setError(null);
    setIsSubmitting(true);
    const result = await connectCloudSession();
    setIsSubmitting(false);

    if (result.connected) {
      setIsConnected(true);
      router.replace(callbackUrl);
      return;
    }
    setError(
      result.reason === 'unavailable'
        ? 'Vitora Cloud is not reachable. Check your internet connection and try again.'
        : result.detail ||
            'This desktop could not verify the active hub session. Contact an administrator if the issue persists.'
    );
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect to Vitora Cloud</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect using your active hub session. Your password and MFA codes are never requested
            or sent to Vitora Cloud.
          </p>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {isConnected
              ? 'Cloud session connected.'
              : isSubmitting
                ? 'Requesting cloud session...'
                : 'Ready to connect.'}
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            disabled={isSubmitting || isConnected}
            onClick={handleConnect}
            type="button"
          >
            {isSubmitting ? 'Connecting...' : isConnected ? 'Connected' : 'Connect Cloud'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
