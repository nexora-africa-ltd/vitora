'use client';

import { useState, useEffect } from 'react';
import { Shield, Key, CheckCircle, AlertCircle, Loader2, Copy, Eye, EyeOff } from 'lucide-react';
import { mfaApi } from '@/lib/api/mfa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface MFASetupWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function MFASetupWizard({ onComplete, onCancel }: MFASetupWizardProps) {
  const [step, setStep] = useState<'setup' | 'verify' | 'backup'>('setup');
  const [setupData, setSetupData] = useState<{
    secret: string;
    qr_code: string;
    provisioning_uri: string;
  } | null>(null);
  const [token, setToken] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start MFA setup
  useEffect(() => {
    const startSetup = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await mfaApi.startTOTPSetup();
        setSetupData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start MFA setup');
      } finally {
        setIsLoading(false);
      }
    };

    startSetup();
  }, []);

  const handleVerifyToken = async () => {
    if (!setupData || token.length !== 6) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await mfaApi.confirmTOTPSetup(token);
      setBackupCodes(result.backup_codes);
      setStep('backup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid token. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = () => {
    toast.success('MFA has been enabled successfully!');
    onComplete();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (step === 'setup') {
    return (
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Set Up Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              Add an extra layer of security to your account by enabling two-factor authentication.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">Setting up MFA...</span>
              </div>
            ) : setupData ? (
              <>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                  </p>

                  {setupData.qr_code && (
                    <div className="flex justify-center mb-4">
                      <img
                        src={`data:image/png;base64,${setupData.qr_code}`}
                        alt="QR Code for MFA setup"
                        className="border rounded-lg"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Or manually enter this code:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-muted rounded text-sm font-mono">
                        {setupData.secret}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(setupData.secret)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    {setupData.provisioning_uri && (
                      <a
                        href={setupData.provisioning_uri}
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
                      >
                        Open in Authenticator App →
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={onCancel} className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={() => setStep('verify')} className="flex-1">
                    Next: Enter Code
                  </Button>
                </div>
              </>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (step === 'verify') {
    return (
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Verify Your Code
            </DialogTitle>
            <DialogDescription>
              Enter the 6-digit code from your authenticator app to complete setup.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('setup')} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleVerifyToken}
                disabled={token.length !== 6 || isLoading}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify & Continue'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (step === 'backup') {
    return (
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              MFA Setup Complete!
            </DialogTitle>
            <DialogDescription>
              Save these backup codes in a secure place. You can use them to access your account if you lose your device.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> These codes are shown only once. Store them securely and don't share them.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Backup Codes</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowBackupCodes(!showBackupCodes)}
                >
                  {showBackupCodes ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, index) => (
                  <div
                    key={index}
                    className="p-2 bg-muted rounded font-mono text-sm text-center"
                  >
                    {showBackupCodes ? code : '••••••••'}
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(backupCodes.join('\n'))}
                className="w-full"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy All Codes
              </Button>
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Two-factor authentication is now enabled for your account. You'll need your authenticator app or a backup code for future logins.
              </AlertDescription>
            </Alert>

            <Button onClick={handleComplete} className="w-full">
              I've Saved My Backup Codes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
