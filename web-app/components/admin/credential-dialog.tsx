'use client';

import { useState } from 'react';
import { Copy, Check, AlertTriangle, Mail } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CredentialDialogProps {
  open: boolean;
  onClose: () => void;
  username: string;
  tempPassword: string;
  fullName: string;
  email: string;
}

export function CredentialDialog({
  open,
  onClose,
  username,
  tempPassword,
  fullName,
  email,
}: CredentialDialogProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const copyAll = () => {
    const text = `Account Credentials for ${fullName}\n\nUsername: ${username}\nTemporary Password: ${tempPassword}\n\nPlease change your password after your first login.`;
    copyToClipboard(text, 'all');
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Account Credentials
          </DialogTitle>
          <DialogDescription>
            Save these credentials now. The temporary password <strong>cannot be retrieved</strong> after closing this dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
            <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
              The user will be required to change this password on first login.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Full Name</Label>
              <p className="text-sm font-medium">{fullName}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="text-sm">{email}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Username</Label>
              <div className="flex gap-2">
                <Input value={username} readOnly className="font-mono text-sm bg-muted" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(username, 'username')}
                >
                  {copiedField === 'username' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Temporary Password</Label>
              <div className="flex gap-2">
                <Input value={tempPassword} readOnly className="font-mono text-sm bg-muted" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(tempPassword, 'password')}
                >
                  {copiedField === 'password' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={copyAll}
          >
            {copiedField === 'all' ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copiedField === 'all' ? 'Copied!' : 'Copy All'}
          </Button>
          <Button type="button" onClick={onClose}>
            I&apos;ve Saved These Credentials
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
