/**
 * OTP Whitelist Request Sheet
 *
 * Shown when a start-visit call fails with "restricted to biometric visits".
 * Allows the facility to submit an OTP whitelist request to DHA so that
 * future OTP-based consent is permitted for this beneficiary.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  FileUp,
  Loader2,
  Send,
  CheckCircle2,
  RefreshCw,
  Clock,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import { useToast } from '@/lib/hooks/use-toast';
import { extractDHAErrorMessage, isPendingWhitelistError } from '@/lib/sha/error-parser';

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
  /** Patient date of birth (ISO string) — used to auto-select CHILD_BELOW_7_YEARS */
  patientDateOfBirth?: string;
  /** Optional callback fired after successful submission */
  onSubmitted?: () => void | Promise<void>;
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
  {
    value: 'BIOMETRIC_FAILURE',
    label: 'Biometric Failure',
    hint: 'Multiple failed fingerprint scans',
  },
  { value: 'OLD', label: 'Elderly / Degraded Fingerprints', hint: 'Age ≥60, worn fingerprints' },
  { value: 'AMPUTEE', label: 'Amputee', hint: 'Missing fingers/hands' },
  { value: 'MENTALLY_UNSTABLE', label: 'Mentally Unstable', hint: 'Patient unable to cooperate' },
  {
    value: 'CONSTRUCTION_WORKER',
    label: 'Construction Worker',
    hint: 'Damaged/worn fingerprints from labour',
  },
  {
    value: 'MEDICAL_CONDITION',
    label: 'Medical Condition',
    hint: 'Skin condition affecting fingerprints',
  },
  { value: 'CHILD_BELOW_7_YEARS', label: 'Child Below 7 Years', hint: 'Undeveloped fingerprints' },
  { value: 'EXPIRED', label: 'Expired Member', hint: 'Deceased beneficiary, next-of-kin claiming' },
  {
    value: 'PRIVACY_CONCERNS',
    label: 'Privacy Concerns',
    hint: 'Patient refuses biometric capture',
  },
  {
    value: 'TECHNICAL_ISSUES',
    label: 'Technical Issues',
    hint: 'Device malfunction, connectivity problems',
  },
  { value: 'DEVICE_MALFUNCTION', label: 'Device Malfunction', hint: 'Hardware failure' },
  { value: 'OTHER', label: 'Other', hint: 'Specify in details' },
] as const;

const OTP_WHITELIST_ALLOWED_DOCUMENT_TYPES = ['SUPPORT_DOCUMENT'] as const;
const REASON_MAX_LENGTH = 500;
const REASON_WARNING_THRESHOLD = 450;
const OTP_WHITELIST_ALLOWED_FILE_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);
const OTP_WHITELIST_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function buildReasonFallback(reasonType: string): string {
  const readable = reasonType.replace(/_/g, ' ').toLowerCase();
  return `Reason type: ${readable}`;
}

function isAllowedOtpWhitelistFile(file: File): boolean {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  const hasValidExtension = OTP_WHITELIST_ALLOWED_FILE_EXTENSIONS.has(ext);
  const hasValidMime = !file.type || OTP_WHITELIST_ALLOWED_MIME_TYPES.has(file.type);
  return hasValidExtension && hasValidMime;
}

// ============================================================================
// Component
// ============================================================================

export function OtpWhitelistRequestSheet({
  open,
  onOpenChange,
  shaNumber,
  facilityFrCode,
  beneficiaryName,
  patientDateOfBirth,
  onSubmitted,
}: OtpWhitelistRequestSheetProps) {
  const { toast } = useToast();
  const [reasonType, setReasonType] = useState('BIOMETRIC_FAILURE');
  const [reason, setReason] = useState('');
  const [biometricAttempts, setBiometricAttempts] = useState('3');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [alreadyPending, setAlreadyPending] = useState(false);
  const [whitelistStatus, setWhitelistStatus] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Editable fields pre-populated from props
  const [crId, setCrId] = useState('');
  const [frCode, setFrCode] = useState('');
  const selectedReasonMeta = REASON_TYPES.find((r) => r.value === reasonType);

  // Auto-select CHILD_BELOW_7_YEARS when patient is under 7
  useEffect(() => {
    if (open && patientDateOfBirth) {
      const dob = new Date(patientDateOfBirth);
      const now = new Date();
      const age =
        now.getFullYear() -
        dob.getFullYear() -
        (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
      if (age < 7) {
        setReasonType('CHILD_BELOW_7_YEARS');
        if (!reason) {
          setReason('Patient is below 7 years of age — undeveloped fingerprints.');
        }
      }
    }
  }, [open, patientDateOfBirth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync from props when sheet opens
  useEffect(() => {
    if (open) {
      setCrId(shaToCrId(shaNumber));
      setFrCode(facilityFrCode);
    }
  }, [open, shaNumber, facilityFrCode]);

  // Auto-check whitelist status when sheet opens with valid CR ID
  useEffect(() => {
    if (open && crId.trim()) {
      checkWhitelistStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, crId]);

  const checkWhitelistStatus = useCallback(async () => {
    if (!crId.trim()) return;
    setIsCheckingStatus(true);
    try {
      const result = await shaApi.ilmListOtpWhitelistStatus({
        beneficiary_cr_id: crId.trim(),
        facility_fr_code: frCode.trim() || undefined,
      });
      // DHA returns paginated results in `data`; pick the latest
      const data = result.data as { results?: Array<{ status?: string }> } | undefined;
      const latest = data?.results?.[0];
      if (latest?.status) {
        setWhitelistStatus(latest.status.toUpperCase());
      } else {
        setWhitelistStatus('PENDING');
      }
    } catch {
      setWhitelistStatus('PENDING');
    } finally {
      setIsCheckingStatus(false);
    }
  }, [crId, frCode]);

  const runSubmittedCallback = useCallback(async () => {
    if (!onSubmitted) return;
    try {
      await onSubmitted();
    } catch {
      // Parent refresh callback is best-effort; request flow should continue.
    }
  }, [onSubmitted]);

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
    if (!reason.trim()) {
      setError('Reason is required.');
      return;
    }
    if (reason.length > REASON_MAX_LENGTH) {
      setError(`Reason cannot exceed ${REASON_MAX_LENGTH} characters.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      const reasonValue = reason.trim() || buildReasonFallback(reasonType);
      formData.append('beneficiary_cr_id', crId.trim());
      formData.append('facility_fr_code', frCode.trim());
      formData.append('reason_type', reasonType);
      formData.append('reason', reasonValue);
      formData.append('biometric_attempts', biometricAttempts);

      if (attachment) {
        formData.append(
          'attachments',
          JSON.stringify([
            {
              document_title: attachment.name,
              document_type: OTP_WHITELIST_ALLOWED_DOCUMENT_TYPES[0],
              file_field_name: 'attachments_file_blob',
            },
          ])
        );
        formData.append('attachments_file_blob', attachment);
      }

      await shaApi.ilmRequestOtpWhitelist(formData);
      setSuccess(true);
      await runSubmittedCallback();
    } catch (err) {
      const msg = extractDHAErrorMessage(err);
      // DHA returns this when a whitelist request is already pending
      if (isPendingWhitelistError(msg)) {
        setAlreadyPending(true);
        setWhitelistStatus('PENDING');
        setError(msg);
        toast({
          title: 'Request already pending',
          description: msg,
          variant: 'destructive',
        });
        await runSubmittedCallback();
      } else {
        setError(msg);
        toast({
          title: 'Whitelist request failed',
          description: msg,
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after close animation
    setTimeout(() => {
      setSuccess(false);
      setAlreadyPending(false);
      setError(null);
      setReason('');
      setBiometricAttempts('3');
      setAttachment(null);
      setReasonType('BIOMETRIC_FAILURE');
      setWhitelistStatus(null);
    }, 300);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="flex w-full max-w-full flex-col sm:max-w-sm">
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
          <div className="mt-4 flex flex-1 flex-col space-y-4">
            <div className="rounded-md bg-green-50 p-3 dark:bg-green-900/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    Whitelist request submitted
                  </p>
                  <p className="mt-0.5 text-xs text-green-600 dark:text-green-400">
                    DHA will review this request. Once approved, OTP consent will be available.
                  </p>
                </div>
              </div>
            </div>

            {/* Status check */}
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Review Status</span>
                <WhitelistStatusBadge status={whitelistStatus} />
              </div>
              <p className="text-xs text-muted-foreground">
                DHA reviews typically take a few minutes to hours.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={checkWhitelistStatus}
                disabled={isCheckingStatus}
                className="w-full text-xs"
              >
                {isCheckingStatus ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Check Status
              </Button>
            </div>

            <div className="mt-auto pt-2">
              <Button onClick={handleClose} className="w-full" size="sm">
                Close
              </Button>
            </div>
          </div>
        ) : alreadyPending ? (
          <div className="mt-4 flex flex-1 flex-col space-y-4">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/10">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    Request already pending
                  </p>
                  <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                    A whitelist request for this beneficiary is already pending review at DHA. You
                    cannot submit another until the existing one is approved or rejected.
                  </p>
                </div>
              </div>
            </div>

            {/* Status check */}
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Review Status</span>
                <WhitelistStatusBadge status={whitelistStatus} />
              </div>
              <p className="text-xs text-muted-foreground">
                Check back periodically — DHA reviews typically take a few minutes to hours.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={checkWhitelistStatus}
                disabled={isCheckingStatus}
                className="w-full text-xs"
              >
                {isCheckingStatus ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Check Status
              </Button>
            </div>

            <div className="mt-auto pt-2">
              <Button onClick={handleClose} className="w-full" size="sm">
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-1 flex-col gap-4">
            {/* Warning: existing pending request detected */}
            {whitelistStatus === 'PENDING' && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-900/10">
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    A whitelist request is already pending for this beneficiary. Submitting again
                    will be rejected by DHA.
                  </p>
                </div>
              </div>
            )}

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
                  className="h-9 font-mono text-sm"
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
                  className="h-9 font-mono text-sm"
                />
              </div>
            </div>

            {/* Reason Type + Biometric Attempts — side by side */}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="space-y-1">
                <Label htmlFor="whitelist-reason-type" className="text-sm">
                  Reason Type
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
                {selectedReasonMeta?.hint && (
                  <p className="text-[11px] text-muted-foreground">{selectedReasonMeta.hint}</p>
                )}
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
            <div className="flex flex-1 flex-col space-y-1">
              <Label htmlFor="whitelist-reason" className="text-sm">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="whitelist-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={REASON_MAX_LENGTH}
                placeholder="Explain why biometric capture cannot be used for this beneficiary..."
                className="min-h-[60px] flex-1 resize-none text-sm"
              />
              <div className="flex justify-end">
                <span
                  className={`text-[11px] ${
                    reason.length >= REASON_MAX_LENGTH
                      ? 'text-destructive'
                      : reason.length >= REASON_WARNING_THRESHOLD
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground'
                  }`}
                >
                  {reason.length}/{REASON_MAX_LENGTH}
                </span>
              </div>
            </div>

            {/* File attachment — inline */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('whitelist-attachment')?.click()}
                className="h-8 text-sm"
              >
                <FileUp className="mr-1.5 h-3.5 w-3.5" />
                {attachment ? 'Change' : 'Attach File'}
              </Button>
              {attachment && (
                <span className="max-w-[180px] truncate text-xs text-muted-foreground">
                  {attachment.name}
                </span>
              )}
              <input
                id="whitelist-attachment"
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => {
                  const selected = e.target.files?.[0] ?? null;
                  if (!selected) {
                    setAttachment(null);
                    return;
                  }
                  if (!isAllowedOtpWhitelistFile(selected)) {
                    setAttachment(null);
                    setError(
                      'Unsupported file type. Allowed: PDF, DOC, DOCX, PNG, JPG, JPEG, WEBP.'
                    );
                    e.currentTarget.value = '';
                    return;
                  }
                  setError(null);
                  setAttachment(selected);
                }}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* Actions */}
            <div className="mt-auto flex gap-2 pt-2">
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
                disabled={isSubmitting || !crId.trim() || !frCode.trim() || !reason.trim()}
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

// ============================================================================
// Whitelist Status Badge (also exported for use in SHAConsentStep)
// ============================================================================

export function WhitelistStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <Badge variant="outline" className="gap-1 text-[10px]">
        <Clock className="h-3 w-3" />
        Not checked
      </Badge>
    );
  }
  switch (status) {
    case 'APPROVED':
      return (
        <Badge className="gap-1 border-green-200 bg-green-100 text-[10px] text-green-700 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          Approved
        </Badge>
      );
    case 'REJECTED':
      return (
        <Badge className="gap-1 border-red-200 bg-red-100 text-[10px] text-red-700 dark:bg-red-900/20 dark:text-red-400">
          <XCircle className="h-3 w-3" />
          Rejected
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="gap-1 border-amber-300 text-[10px] text-amber-700 dark:border-amber-600 dark:text-amber-400"
        >
          <Clock className="h-3 w-3" />
          Pending Review
        </Badge>
      );
  }
}
