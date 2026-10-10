// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Connects a LAN desktop session to Vitora Cloud for cloud-only workflows.
 * Visit /cloud-sign-in?callbackUrl=/cloud-only-route from a desktop hub session.
 * Inputs: username, password, and an optional TOTP or backup code for cloud MFA.
 */

'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { connectCloudSession, verifyCloudSessionMfa } from '@/lib/api/client';

function getSafeCallbackUrl(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

export default function CloudSignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(searchParams.get('callbackUrl'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await connectCloudSession(username, password);
    setIsSubmitting(false);

    if (result.connected) {
      router.replace(callbackUrl);
      return;
    }
    if (result.reason === 'mfa_required') {
      setMfaToken(result.mfaToken);
      return;
    }
    setError(
      result.reason === 'unavailable'
        ? 'Vitora Cloud is not reachable. Check your internet connection and try again.'
        : 'Cloud sign-in was not accepted. Verify your credentials and try again.'
    );
  };

  const handleMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mfaToken) return;
    setError(null);
    setIsSubmitting(true);
    const verified = await verifyCloudSessionMfa(mfaToken, { token: mfaCode });
    setIsSubmitting(false);
    if (verified) {
      router.replace(callbackUrl);
      return;
    }
    setError('Cloud verification failed. Check the code and try again.');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect to Vitora Cloud</CardTitle>
        </CardHeader>
        <CardContent>
          {mfaToken ? (
            <form className="space-y-4" onSubmit={handleMfa}>
              <div className="space-y-2">
                <Label htmlFor="cloud-mfa-code">Verification code</Label>
                <Input
                  id="cloud-mfa-code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  onChange={(event) => setMfaCode(event.target.value)}
                  required
                  value={mfaCode}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Verifying...' : 'Verify Cloud Session'}
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleCredentials}>
              <div className="space-y-2">
                <Label htmlFor="cloud-username">Username or email</Label>
                <Input
                  id="cloud-username"
                  autoComplete="username"
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  value={username}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cloud-password">Password</Label>
                <Input
                  id="cloud-password"
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Connecting...' : 'Connect to Cloud'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
