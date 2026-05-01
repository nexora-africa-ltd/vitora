/**
 * OTP Whitelist Request Sheet
 *
 * Shown when a start-visit call fails with "restricted to biometric visits".
 * Allows the facility to submit an OTP whitelist request to DHA so that
 * future OTP-based consent is permitted for this beneficiary.
 */
'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, FileUp, Loader2, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { shaApi } from '@/lib/api/sha';
import { getApiErrorMessage } from '@/lib/api/client';

// ============================================================================
// Types
// ============================================================================

interface OtpWhitelistRequestSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The SHA member number (e.g. "SHA-8432995013637-1") — will be converted to CR ID format */
  shaNumber: string;
  /** The facility FR code */
  facilityFrCode: string;
  /** Beneficiary name (for display) */
  beneficiaryName?: string;
}

/**
 * Convert SHA number to Client Registry ID format.
 * DHA expects "CR..." not "SHA-...".
 * e.g. "SHA-8432995013637-1" → "CR8432995013637-1"
 */
function shaToCrId(shaNumber: string): string {
  if (!shaNumber) return '';
  if (shaNumber.startsWith('CR')) return shaNumber;
  if (shaNumber.startsWith('SHA-')) return `CR${shaNumber.slice(4)}`;
  return shaNumber;
}

const REASON_TYPES = [
  { value: 'BIOMETRIC_FAILURE', label: 'Biometric Failure' },
  { value: 'OLD', label: 'Elderly / Degraded Fingerprints' },
  { value: 'AMPUTEE', label: 'Amputee' },
  { value: 'POWER_OUTAGE', label: 'Power Outage' },
  { value: 'DEVICE_MALFUNCTION', label: 'Device Malfunction' },
  { value: 'OTHER', label: 'Other' },
] as const;

// ============================================================================
// Component
// ============================================================================

export function OtpWhitelistRequestSheet({
  open,
  onOpenChange,
  shaNumber,
  facilityFrCode,
  beneficiaryName,
}: OtpWhitelistRequestSheetProps) {
  const [reasonType, setReasonType] = useState('BIOMETRIC_FAILURE');
  const [reason, setReason] = useState('');
  const [biometricAttempts, setBiometricAttempts] = useState('3');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Editable fields pre-populated from props
  const [crId, setCrId] = useState('');
  const [frCode, setFrCode] = useState('');

  // Sync from props when sheet opens
  useEffect(() => {
    if (open) {
      setCrId(shaToCrId(shaNumber));
      setFrCode(facilityFrCode);
    }
  }, [open, shaNumber, facilityFrCode]);

  const handleSubmit = async () => {
    setError(null);

    if (!crId.trim()) {
      setError('Beneficiary CR ID is required.');
      return;
    }
    if (!frCode.trim()) {
      setError('Facility FR code is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('beneficiary_cr_id', crId.trim());
      formData.append('facility_fr_code', frCode.trim());
      formData.append('reason_type', reasonType);
      formData.append('reason', reason);
      formData.append('biometric_attempts', biometricAttempts);

      if (attachment) {
        formData.append('attachments', JSON.stringify([
          {
            document_title: attachment.name,
            document_type: 'SUPPORT_DOCUMENT',
            file_field_name: 'attachments_file_blob',
          },
        ]));
        formData.append('attachments_file_blob', attachment);
      }

      await shaApi.ilmRequestOtpWhitelist(formData);
      setSuccess(true);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after close animation
    setTimeout(() => {
      setSuccess(false);
      setError(null);
      setReason('');
      setBiometricAttempts('3');
      setAttachment(null);
      setReasonType('BIOMETRIC_FAILURE');
    }, 300);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full max-w-full sm:max-w-sm flex flex-col">
        <SheetHeader className="pb-0">
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Request OTP Whitelist
          </SheetTitle>
          <SheetDescription className="text-sm">
            Submit a whitelist request to DHA to allow OTP-based consent.
          </SheetDescription>
        </SheetHeader>

        {success ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-md bg-green-50 dark:bg-green-900/10 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    Whitelist request submitted
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                    DHA will review this request. Once approved, OTP consent will be available.
                  </p>
                </div>
              </div>
            </div>
            <Button onClick={handleClose} className="w-full" size="sm">
              Close
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col flex-1 gap-4">
            {/* Beneficiary name */}
            {beneficiaryName && (
              <p className="text-sm font-medium text-muted-foreground">{beneficiaryName}</p>
            )}

            {/* CR ID + FR Code — side by side */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="whitelist-cr-id" className="text-sm">
                  CR ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="whitelist-cr-id"
                  value={crId}
                  onChange={(e) => setCrId(e.target.value)}
                  placeholder="CR8432..."
                  className="font-mono text-sm h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="whitelist-fr-code" className="text-sm">
                  Facility Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="whitelist-fr-code"
                  value={frCode}
                  onChange={(e) => setFrCode(e.target.value)}
                  placeholder="e.g. 12345"
                  className="font-mono text-sm h-9"
                />
              </div>
            </div>

            {/* Reason Type + Biometric Attempts — side by side */}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="space-y-1">
                <Label htmlFor="whitelist-reason-type" className="text-sm">
                  Reason
                </Label>
                <Select value={reasonType} onValueChange={setReasonType}>
                  <SelectTrigger id="whitelist-reason-type" className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_TYPES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="whitelist-attempts" className="text-sm">
                  Attempts
                </Label>
                <Input
                  id="whitelist-attempts"
                  type="number"
                  min={0}
                  max={99}
                  value={biometricAttempts}
                  onChange={(e) => setBiometricAttempts(e.target.value)}
                  className="w-18 h-9 text-sm"
                />
              </div>
            </div>

            {/* Additional details */}
            <div className="space-y-1 flex-1 flex flex-col">
              <Label htmlFor="whitelist-reason" className="text-sm">
                Details (optional)
              </Label>
              <Textarea
                id="whitelist-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why biometric cannot be used..."
                className="text-sm resize-none flex-1 min-h-[60px]"
              />
            </div>

            {/* File attachment — inline */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('whitelist-attachment')?.click()}
                className="text-sm h-8"
              >
                <FileUp className="mr-1.5 h-3.5 w-3.5" />
                {attachment ? 'Change' : 'Attach File'}
              </Button>
              {attachment && (
                <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                  {attachment.name}
                </span>
              )}
              <input
                id="whitelist-attachment"
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-auto pt-2">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1"
                size="sm"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !crId.trim() || !frCode.trim()}
                className="flex-1"
                size="sm"
              >
                {isSubmitting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                )}
                Submit
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
