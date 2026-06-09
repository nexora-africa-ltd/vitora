'use client';

/**
 * License Activation Page
 *
 * Standalone page (outside dashboard layout) used during first-run
 * of a desktop installation. The user enters their activation code
 * (provided by Nexora after purchase) and the app activates itself.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { licensingApi } from '@/lib/api/licensing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { HelpPopover } from '@/components/shared/help-popover';

export default function ActivatePage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [installationId, setInstallationId] = useState(licensingApi.getInstallationId() || '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await licensingApi.activate({
        activation_code: code.trim().toUpperCase(),
        installation_id: installationId.trim(),
      });

      // Store the license token
      licensingApi.storeToken(response.license_token);
      setSuccess(true);

      // Redirect to dashboard after short delay
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Activation failed. Please check your code and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-7 w-7 text-primary" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <CardTitle className="text-xl">Activate Vitora HMIS</CardTitle>
            <HelpPopover content="Enter the activation code provided by Nexora Africa after your subscription purchase. Each code is single-use and tied to your organization." />
          </div>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
              <p className="text-sm font-medium text-green-700">Activation Successful!</p>
              <p className="text-xs text-muted-foreground">Redirecting to dashboard...</p>
            </div>
          ) : (
            <form onSubmit={handleActivate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="activation-code">Activation Code</Label>
                <Input
                  id="activation-code"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="font-mono text-center tracking-widest"
                  required
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="installation-id">Installation ID</Label>
                <Input
                  id="installation-id"
                  placeholder="Auto-generated"
                  value={installationId}
                  onChange={(e) => setInstallationId(e.target.value)}
                  className="font-mono text-xs"
                  required
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier for this installation. Auto-generated on first launch.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting || !code.trim()}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Activating...
                  </>
                ) : (
                  'Activate License'
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground pt-2">
                Need an activation code?{' '}
                <a
                  href="mailto:support@nexora.africa?subject=Activation%20Code%20Request"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Contact Nexora
                </a>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
