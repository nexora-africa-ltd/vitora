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
import { Shield, ShieldCheck, ShieldOff, Key, AlertCircle, Loader2, RefreshCw, Fingerprint, Trash2, Download, Plus } from 'lucide-react';
import { mfaApi, type MFAStatus, type WebAuthnCredential } from '@/lib/api/mfa';
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
  // WebAuthn state
  const [webauthnCredentials, setWebauthnCredentials] = useState<WebAuthnCredential[]>([]);
  const [showAddPasskeyDialog, setShowAddPasskeyDialog] = useState(false);
  const [passkeyName, setPasskeyName] = useState('');
  const [showDeletePasskeyDialog, setShowDeletePasskeyDialog] = useState<number | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  // Backup codes download state
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [downloadToken, setDownloadToken] = useState('');

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

  // Load WebAuthn credentials
  const loadWebAuthnCredentials = async () => {
    try {
      const creds = await mfaApi.webauthnListCredentials();
      setWebauthnCredentials(creds);
    } catch {
      // Non-critical — silently ignore
    }
  };

  useEffect(() => {
    if (status?.mfa_enabled) {
      loadWebAuthnCredentials();
    }
  }, [status?.mfa_enabled]);

  // Add passkey
  const handleAddPasskey = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const { startRegistration } = await import('@simplewebauthn/browser');
      const optionsJSON = await mfaApi.webauthnRegisterBegin();
      const options = JSON.parse(optionsJSON);
      const credential = await startRegistration({ optionsJSON: options });
      await mfaApi.webauthnRegisterComplete(credential, passkeyName || 'Security Key');
      toast.success('Passkey registered successfully');
      setShowAddPasskeyDialog(false);
      setPasskeyName('');
      loadWebAuthnCredentials();
      loadStatus();
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setActionError('Registration was cancelled or timed out.');
      } else {
        setActionError(err instanceof Error ? err.message : 'Failed to register passkey.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Delete passkey
  const handleDeletePasskey = async () => {
    if (showDeletePasskeyDialog === null || !deletePassword.trim()) return;

    setActionLoading(true);
    setActionError(null);
    try {
      await mfaApi.webauthnDeleteCredential(showDeletePasskeyDialog, deletePassword);
      toast.success('Passkey deleted');
      setShowDeletePasskeyDialog(null);
      setDeletePassword('');
      loadWebAuthnCredentials();
      loadStatus();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete passkey.');
    } finally {
      setActionLoading(false);
    }
  };

  // Download backup codes
  const handleDownloadCodes = async () => {
    if (downloadToken.length !== 6) return;

    setActionLoading(true);
    setActionError(null);
    try {
      const result = await mfaApi.downloadBackupCodes(downloadToken);
      toast.success('Backup codes generated');
      setShowDownloadDialog(false);
      setDownloadToken('');
      loadStatus();
      showNewBackupCodes(result.backup_codes);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to download backup codes.');
    } finally {
      setActionLoading(false);
    }
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
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="p-4 rounded-lg border bg-muted/50">
                  <div className="text-sm text-muted-foreground">TOTP Devices</div>
                  <div className="text-2xl font-semibold">{status?.devices_count ?? 0}</div>
                </div>
                <div className="p-4 rounded-lg border bg-muted/50">
                  <div className="text-sm text-muted-foreground">Passkeys</div>
                  <div className="text-2xl font-semibold">{status?.webauthn_credentials_count ?? 0}</div>
                </div>
                <div className="p-4 rounded-lg border bg-muted/50">
                  <div className="text-sm text-muted-foreground">Backup Codes Left</div>
                  <div className="text-2xl font-semibold">{status?.backup_codes_remaining ?? 0}</div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 items-center">
            {!mfaEnabled ? (
              <Button onClick={() => setShowSetupWizard(true)}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                Enable MFA
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowAddPasskeyDialog(true)}>
                  <Fingerprint className="h-4 w-4 mr-2" />
                  <span className="sm:hidden">Passkey</span>
                  <span className="hidden sm:inline">Add Passkey</span>
                </Button>
                <Button variant="outline" onClick={() => setShowDownloadDialog(true)}>
                  <Download className="h-4 w-4 mr-2" />
                  <span className="sm:hidden">Codes</span>
                  <span className="hidden sm:inline">Re-download Codes</span>
                </Button>
                <Button variant="outline" onClick={() => setShowRegenerateDialog(true)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  <span className="sm:hidden">Regen</span>
                  <span className="hidden sm:inline">Regenerate Codes</span>
                </Button>

                {!mfaRequired && (
                  <Button variant="destructive" onClick={() => setShowDisableDialog(true)}>
                    <ShieldOff className="h-4 w-4 mr-2" />
                    Disable MFA
                  </Button>
                )}
              </>
            )}
          </div>

          {/* MFA Required Notice */}
          {mfaEnabled && mfaRequired && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
              <Shield className="h-4 w-4 shrink-0" />
              <p className="text-sm">
                MFA cannot be disabled because it's required for your role.
              </p>
            </div>
          )}

          {/* WebAuthn Credentials */}
          {mfaEnabled && webauthnCredentials.length > 0 && (
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Fingerprint className="h-4 w-4" />
                Registered Passkeys
              </h4>
              <div className="space-y-2">
                {webauthnCredentials.map((cred) => (
                  <div
                    key={cred.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{cred.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Added {new Date(cred.created_at).toLocaleDateString()}
                        {cred.last_used_at && (
                          <> · Last used {new Date(cred.last_used_at).toLocaleDateString()}</>
                        )}
                        {cred.backed_up && (
                          <Badge variant="secondary" className="ml-2 text-[10px] px-1 py-0">Synced</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setShowDeletePasskeyDialog(cred.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How MFA Works */}
          <div className="pt-4 border-t">
            <h4 className="font-medium mb-2">How it works</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Install an authenticator app like Google Authenticator or Authy</li>
              <li>Scan the QR code to link your account</li>
              <li>Enter the 6-digit code when logging in</li>
              <li>Optionally add a passkey (Windows Hello, Touch ID, security key) for faster login</li>
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

      {/* Add Passkey Dialog */}
      <Dialog open={showAddPasskeyDialog} onOpenChange={(open) => { setShowAddPasskeyDialog(open); setActionError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5" />
              Add Passkey
            </DialogTitle>
            <DialogDescription>
              Register a passkey using Windows Hello, Touch ID, Face ID, or a security key for faster login.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="passkeyName" className="text-sm font-medium">
                Name (optional)
              </label>
              <Input
                id="passkeyName"
                type="text"
                placeholder="e.g., Windows Hello, YubiKey"
                value={passkeyName}
                onChange={(e) => setPasskeyName(e.target.value)}
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
            <Button variant="outline" onClick={() => setShowAddPasskeyDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddPasskey} disabled={actionLoading}>
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Waiting for device...
                </>
              ) : (
                <>
                  <Fingerprint className="h-4 w-4 mr-2" />
                  Register Passkey
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Passkey Dialog */}
      <Dialog open={showDeletePasskeyDialog !== null} onOpenChange={() => { setShowDeletePasskeyDialog(null); setActionError(null); setDeletePassword(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Passkey</DialogTitle>
            <DialogDescription>
              Enter your password to confirm you want to remove this passkey.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="deletePasskeyPassword" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="deletePasskeyPassword"
                type="password"
                placeholder="Enter your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
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
            <Button variant="outline" onClick={() => setShowDeletePasskeyDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeletePasskey}
              disabled={!deletePassword.trim() || actionLoading}
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Download Backup Codes Dialog */}
      <Dialog open={showDownloadDialog} onOpenChange={(open) => { setShowDownloadDialog(open); setActionError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Re-download Backup Codes
            </DialogTitle>
            <DialogDescription>
              Enter a code from your authenticator app to get a fresh set of backup codes. Your old codes will be replaced.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="downloadToken" className="text-sm font-medium">
                6-digit code
              </label>
              <Input
                id="downloadToken"
                type="text"
                placeholder="000000"
                value={downloadToken}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setDownloadToken(value);
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
            <Button variant="outline" onClick={() => setShowDownloadDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDownloadCodes}
              disabled={downloadToken.length !== 6 || actionLoading}
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Get Codes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
