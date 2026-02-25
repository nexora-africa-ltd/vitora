'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Key, Loader2, Smartphone, Archive, LockKeyhole } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpPopover } from '@/components/shared/help-popover';
import { cn } from '@/lib/utils';
import { mfaToast } from './mfa-toast';

interface MFAVerificationProps {
  mfaToken: string;
  onCancel: () => void;
}

export function MFAVerification({ mfaToken, onCancel }: MFAVerificationProps) {
  const [token, setToken] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'token' | 'backup'>('token');
  const { verifyMFA } = useAuth();
  const router = useRouter();

  const handleVerify = async (method: 'token' | 'backup') => {
    setIsLoading(true);

    try {
      const options = method === 'token'
        ? { token: token.replace(/\s/g, '') }
        : { backupCode: backupCode.replace(/\s/g, '') };

      await verifyMFA(mfaToken, options);
      mfaToast.success();
      
      // Small delay to ensure localStorage writes are committed before navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Use replace to prevent going back to login page
      router.replace('/');
    } catch (err) {
      mfaToast.error(err);
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

  const handleTabChange = (value: string) => {
    setActiveTab(value as 'token' | 'backup');
    if (value === 'backup') {
      mfaToast.backupCodeHint();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-background via-background to-muted/30">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      </div>
      
      <Card className="relative w-full max-w-sm sm:max-w-md border-border/50 shadow-xl shadow-primary/5 backdrop-blur-sm">
        {/* Security indicator strip */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60 rounded-t-lg" />
        
        <CardHeader className="text-center pb-4 pt-6">
          <div className="mx-auto mb-4 relative">
            {/* Outer glow ring */}
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse scale-125" />
            {/* Icon container */}
            <div className="relative flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
              <LockKeyhole className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <CardTitle className="text-xl sm:text-2xl font-semibold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">Verification Required</CardTitle>
            <HelpPopover content="Enter the code from your authenticator app or use a backup code to complete login securely." />
          </div>
          <p className="text-sm text-muted-foreground mt-2">Complete two-factor authentication</p>
        </CardHeader>

        <CardContent className="space-y-5 pb-6">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-11 p-1 bg-muted/50">
              <TabsTrigger 
                value="token" 
                className={cn(
                  "gap-1.5 text-xs sm:text-sm transition-all data-[state=active]:shadow-sm",
                  "data-[state=active]:bg-background data-[state=active]:text-foreground"
                )}
              >
                <Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="sm:hidden">App</span>
                <span className="hidden sm:inline">Authenticator</span>
              </TabsTrigger>
              <TabsTrigger 
                value="backup" 
                className={cn(
                  "gap-1.5 text-xs sm:text-sm transition-all data-[state=active]:shadow-sm",
                  "data-[state=active]:bg-background data-[state=active]:text-foreground"
                )}
              >
                <Archive className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="sm:hidden">Backup</span>
                <span className="hidden sm:inline">Backup Code</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="token" className="mt-4">
              <form onSubmit={handleTokenSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="token" className="text-sm font-medium flex items-center gap-1.5">
                    6-digit code
                    <HelpPopover content="Open your authenticator app (Google Authenticator, Authy, etc.) and enter the current 6-digit code." size="sm" />
                  </label>
                  <Input
                    id="token"
                    type="text"
                    inputMode="numeric"
                    placeholder="• • • • • •"
                    value={token}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setToken(value);
                    }}
                    className={cn(
                      "text-center text-xl sm:text-2xl tracking-[0.4em] font-mono h-14",
                      "border-2 focus:border-primary focus:ring-2 focus:ring-primary/20",
                      "transition-all duration-200",
                      token.length === 6 && "border-green-500/50 bg-green-500/5"
                    )}
                    disabled={isLoading}
                    autoFocus
                    autoComplete="one-time-code"
                  />
                </div>

                <Button
                  type="submit"
                  className={cn(
                    "w-full h-11 sm:h-12 text-sm sm:text-base font-medium",
                    "bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary",
                    "shadow-lg shadow-primary/25 hover:shadow-primary/40",
                    "transition-all duration-200"
                  )}
                  disabled={token.length !== 6 || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Verify & Continue
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="backup" className="mt-4">
              <form onSubmit={handleBackupSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="backupCode" className="text-sm font-medium flex items-center gap-1.5">
                    Backup code
                    <HelpPopover content="Enter one of the backup codes you saved when setting up MFA. Each code can only be used once." size="sm" />
                  </label>
                  <Input
                    id="backupCode"
                    type="text"
                    placeholder="XXXX-XXXX"
                    value={backupCode}
                    onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                    className={cn(
                      "text-center font-mono text-lg sm:text-xl tracking-widest h-14",
                      "border-2 focus:border-primary focus:ring-2 focus:ring-primary/20",
                      "transition-all duration-200",
                      backupCode.length >= 8 && "border-green-500/50 bg-green-500/5"
                    )}
                    disabled={isLoading}
                  />
                </div>

                <Button
                  type="submit"
                  className={cn(
                    "w-full h-11 sm:h-12 text-sm sm:text-base font-medium",
                    "bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary",
                    "shadow-lg shadow-primary/25 hover:shadow-primary/40",
                    "transition-all duration-200"
                  )}
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
                      <span className="sm:hidden">Verify</span>
                      <span className="hidden sm:inline">Verify Backup Code</span>
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Divider */}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50" />
            </div>
          </div>
          
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              ← Back to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}