/**
 * MFA Settings Component
 * 
 * Allows users to:
 * - View MFA status
 * - Enable MFA (with setup wizard)
 * - Disable MFA (with password confirmation)
 * - Regenerate backup codes (with TOTP verification)
 * 
 * DHA Compliance: P0 REQUIRED
 */
'use client';

import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldOff, Key, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { mfaApi, type MFAStatus } from '@/lib/api/mfa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { MFASetupWizard } from '@/components/auth/mfa-setup-wizard';
import { toast } from 'sonner';

export function MFASettingsTab() {
  const [status, setStatus] = useState<MFAStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [regenerateToken, setRegenerateToken] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load MFA status
  const loadStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await mfaApi.getStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MFA status');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // Handle MFA disable
  const handleDisable = async () => {
    if (!disablePassword.trim()) return;
    
    setActionLoading(true);
    setActionError(null);
    try {
      await mfaApi.disableMFA(disablePassword);
      toast.success('MFA has been disabled');
      setShowDisableDialog(false);
      setDisablePassword('');
      loadStatus();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to disable MFA');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle backup codes regeneration
  const handleRegenerate = async () => {
    if (regenerateToken.length !== 6) return;
    
    setActionLoading(true);
    setActionError(null);
    try {
      const result = await mfaApi.regenerateBackupCodes(regenerateToken);
      toast.success('Backup codes regenerated');
      setShowRegenerateDialog(false);
      setRegenerateToken('');
      loadStatus();
      
      // Show the new codes in a dialog
      showNewBackupCodes(result.backup_codes);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to regenerate backup codes');
    } finally {
      setActionLoading(false);
    }
  };

  // Show new backup codes in a dialog
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null);
  const showNewBackupCodes = (codes: string[]) => {
    setNewBackupCodes(codes);
  };

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={loadStatus} variant="outline" className="mt-4">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const mfaEnabled = status?.mfa_enabled ?? false;
  const mfaRequired = status?.mfa_required ?? false;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6" />
              <div>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Add an extra layer of security to your account
                </CardDescription>
              </div>
            </div>
            <Badge variant={mfaEnabled ? 'default' : 'secondary'}>
              {mfaEnabled ? (
                <><ShieldCheck className="h-3 w-3 mr-1" /> Enabled</>
              ) : (
                <><ShieldOff className="h-3 w-3 mr-1" /> Disabled</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* MFA Status Info */}
          <div className="space-y-4">
            {mfaRequired && !mfaEnabled && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>MFA is required for your role.</strong> You must enable two-factor authentication to comply with security policies.
                </AlertDescription>
              </Alert>
            )}

            {mfaEnabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 rounded-lg border bg-muted/50">
                  <div className="text-sm text-muted-foreground">Devices</div>
                  <div className="text-2xl font-semibold">{status?.devices_count ?? 0}</div>
                </div>
                <div className="p-4 rounded-lg border bg-muted/50">
                  <div className="text-sm text-muted-foreground">Backup Codes Remaining</div>
                  <div className="text-2xl font-semibold">{status?.backup_codes_remaining ?? 0}</div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            {!mfaEnabled ? (
              <Button onClick={() => setShowSetupWizard(true)}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                Enable MFA
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowRegenerateDialog(true)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate Backup Codes
                </Button>
                
                {!mfaRequired && (
                  <Button variant="destructive" onClick={() => setShowDisableDialog(true)}>
                    <ShieldOff className="h-4 w-4 mr-2" />
                    Disable MFA
                  </Button>
                )}
                
                {mfaRequired && (
                  <p className="text-sm text-muted-foreground">
                    MFA cannot be disabled because it's required for your role.
                  </p>
                )}
              </>
            )}
          </div>

          {/* How MFA Works */}
          <div className="pt-4 border-t">
            <h4 className="font-medium mb-2">How it works</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Install an authenticator app like Google Authenticator or Authy</li>
              <li>Scan the QR code to link your account</li>
              <li>Enter the 6-digit code when logging in</li>
              <li>Keep backup codes safe in case you lose your device</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* MFA Setup Wizard */}
      {showSetupWizard && (
        <MFASetupWizard
          onComplete={() => {
            setShowSetupWizard(false);
            loadStatus();
          }}
          onCancel={() => setShowSetupWizard(false)}
        />
      )}

      {/* Disable MFA Dialog */}
      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Enter your password to confirm you want to disable MFA. This will make your account less secure.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                disabled={actionLoading}
              />
            </div>
            
            {actionError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisableDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisable}
              disabled={!disablePassword.trim() || actionLoading}
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Disabling...
                </>
              ) : (
                'Disable MFA'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate Backup Codes Dialog */}
      <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Backup Codes</DialogTitle>
            <DialogDescription>
              Enter a code from your authenticator app to generate new backup codes. Your old codes will be invalidated.
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
                value={regenerateToken}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setRegenerateToken(value);
                }}
                className="text-center text-lg tracking-widest"
                disabled={actionLoading}
              />
            </div>
            
            {actionError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRegenerate}
              disabled={regenerateToken.length !== 6 || actionLoading}
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <Key className="h-4 w-4 mr-2" />
                  Regenerate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Backup Codes Dialog */}
      <Dialog open={!!newBackupCodes} onOpenChange={() => setNewBackupCodes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Backup Codes</DialogTitle>
            <DialogDescription>
              Save these codes in a secure place. They cannot be shown again.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-2">
            {newBackupCodes?.map((code, index) => (
              <div
                key={index}
                className="p-2 bg-muted rounded font-mono text-sm text-center"
              >
                {code}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (newBackupCodes) {
                  navigator.clipboard.writeText(newBackupCodes.join('\n'));
                  toast.success('Copied to clipboard');
                }
              }}
            >
              Copy All
            </Button>
            <Button onClick={() => setNewBackupCodes(null)}>
              I've Saved These Codes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
