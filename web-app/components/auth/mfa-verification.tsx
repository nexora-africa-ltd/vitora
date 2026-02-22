'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Key, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MFAVerificationProps {
  mfaToken: string;
  onCancel: () => void;
}

export function MFAVerification({ mfaToken, onCancel }: MFAVerificationProps) {
  const [token, setToken] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { verifyMFA } = useAuth();
  const router = useRouter();

  const handleVerify = async (method: 'token' | 'backup') => {
    setError(null);
    setIsLoading(true);

    try {
      const options = method === 'token'
        ? { token: token.replace(/\s/g, '') }
        : { backupCode: backupCode.replace(/\s/g, '') };

      await verifyMFA(mfaToken, options);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.length === 6) {
      handleVerify('token');
    }
  };

  const handleBackupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (backupCode.trim()) {
      handleVerify('backup');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>
            Enter your authentication code to complete login
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="token" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="token">Authenticator App</TabsTrigger>
              <TabsTrigger value="backup">Backup Code</TabsTrigger>
            </TabsList>

            <TabsContent value="token" className="space-y-4">
              <form onSubmit={handleTokenSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="token" className="text-sm font-medium">
                    6-digit code
                  </label>
                  <Input
                    id="token"
                    type="text"
                    placeholder="000000"
                    value={token}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setToken(value);
                    }}
                    className="text-center text-lg tracking-widest"
                    disabled={isLoading}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={token.length !== 6 || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Key className="mr-2 h-4 w-4" />
                      Verify Code
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="backup" className="space-y-4">
              <form onSubmit={handleBackupSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="backupCode" className="text-sm font-medium">
                    Backup code
                  </label>
                  <Input
                    id="backupCode"
                    type="text"
                    placeholder="ABCD-1234"
                    value={backupCode}
                    onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                    className="text-center font-mono"
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter one of your backup codes
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={!backupCode.trim() || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Key className="mr-2 h-4 w-4" />
                      Verify Backup Code
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="mt-6 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isLoading}
            >
              Back to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}