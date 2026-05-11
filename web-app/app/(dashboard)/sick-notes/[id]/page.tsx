/**
 * Sick Note Detail Page
 * Shows full detail of a sick note with action buttons for issue/revoke/cancel.
 */

'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  FileText,
  User,
  Calendar,
  Stethoscope,
  Building2,
  Printer,
  CheckCircle2,
  XCircle,
  Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { SignatureBadge } from '@/components/shared/signature-badge';
import { sickNotesApi } from '@/lib/api/sick-notes';
import { signaturesApi } from '@/lib/api/certificates';
import { printSickNote } from '@/lib/documents/print-sick-note';
import { useFacility } from '@/lib/context/facility-context';
import type { SickNoteStatus } from '@/lib/types/sick-note';
import { SICK_NOTE_STATUS_CONFIG } from '@/lib/types/sick-note';
import { useToast } from '@/lib/hooks/use-toast';

const STATUS_COLORS: Record<SickNoteStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ISSUED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED: 'bg-muted text-muted-foreground',
  REVOKED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function SickNoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { facilityDetail } = useFacility();
  const id = Number(params.id);

  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: sickNote, isLoading } = useQuery({
    queryKey: ['sick-note', id],
    queryFn: () => sickNotesApi.get(id),
    enabled: !!id,
  });

  const handleIssue = async () => {
    setIsSubmitting(true);
    try {
      await sickNotesApi.issue(id);
      queryClient.invalidateQueries({ queryKey: ['sick-note', id] });
      queryClient.invalidateQueries({ queryKey: ['sick-notes'] });
      toast({ title: 'Sick note issued successfully' });
    } catch {
      toast({ title: 'Failed to issue sick note', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setIsSubmitting(true);
    try {
      await sickNotesApi.cancel(id);
      queryClient.invalidateQueries({ queryKey: ['sick-note', id] });
      queryClient.invalidateQueries({ queryKey: ['sick-notes'] });
      toast({ title: 'Sick note cancelled' });
    } catch {
      toast({ title: 'Failed to cancel sick note', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeReason.trim()) return;
    setIsSubmitting(true);
    try {
      await sickNotesApi.revoke(id, revokeReason);
      setRevokeDialogOpen(false);
      setRevokeReason('');
      queryClient.invalidateQueries({ queryKey: ['sick-note', id] });
      queryClient.invalidateQueries({ queryKey: ['sick-notes'] });
      toast({ title: 'Sick note revoked' });
    } catch {
      toast({ title: 'Failed to revoke sick note', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = async () => {
    if (!sickNote) return;
    let signature;
    try {
      const sigs = await signaturesApi.forDocument('SickNote', id);
      if (sigs.length > 0) {
        signature = {
          signer_full_name: sigs[0]!.signer_full_name,
          signed_at: sigs[0]!.signed_at,
          certificate_serial: sigs[0]!.certificate_serial,
          is_valid: sigs[0]!.is_valid,
        };
      }
    } catch {
      // Print without signature data if fetch fails
    }
    printSickNote({
      sickNote,
      signature,
      facility: facilityDetail
        ? {
            name: facilityDetail.name,
            address: `${facilityDetail.county_name ?? ''}, ${facilityDetail.sub_county_name ?? ''}`.replace(/^, |, $/g, ''),
            phone: '',
            license: facilityDetail.mfl_code || '',
          }
        : undefined,
    });
  };

  if (isLoading || !sickNote) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Sick Note ${sickNote.note_number}`}
        helpContent="View and manage this sick note. Issue to finalize, revoke if the patient returns early, or cancel if created in error."
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {sickNote.patient_name}
            <span className="text-muted-foreground"> • {sickNote.patient_mrn}</span>
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Created {format(new Date(sickNote.created_at), 'dd MMM yyyy, HH:mm')}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <SignatureBadge documentType="SickNote" documentId={id} canSign={sickNote.status === 'ISSUED'} />
          <Badge className={`${STATUS_COLORS[sickNote.status as SickNoteStatus] || ''} shrink-0 w-fit`}>
            {SICK_NOTE_STATUS_CONFIG[sickNote.status as SickNoteStatus]?.label || sickNote.status}
          </Badge>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {sickNote.status === 'DRAFT' && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              <Ban className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleIssue} disabled={isSubmitting}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Issue
            </Button>
          </>
        )}
        {sickNote.status === 'ISSUED' && (
          <>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setRevokeDialogOpen(true)}
              disabled={isSubmitting}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Revoke
            </Button>
          </>
        )}
      </div>

      {/* Content Cards */}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {/* Leave Period */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Leave Period
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Start Date</span>
              <span>{format(new Date(sickNote.leave_start_date), 'dd MMM yyyy')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">End Date</span>
              <span>{format(new Date(sickNote.leave_end_date), 'dd MMM yyyy')}</span>
            </div>
            <div className="flex justify-between text-sm font-medium">
              <span className="text-muted-foreground">Total Days</span>
              <span>{sickNote.leave_days} day{sickNote.leave_days !== 1 ? 's' : ''}</span>
            </div>
          </CardContent>
        </Card>

        {/* Diagnosis */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4" />
              Diagnosis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">
              <span className="text-muted-foreground block mb-1">Diagnosis</span>
              <span>{sickNote.diagnosis_text}</span>
            </div>
            {sickNote.diagnosis_code && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">ICD-10 Code</span>
                <span className="font-mono">{sickNote.diagnosis_code}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clinical Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Clinical Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sickNote.recommendations && (
              <div className="text-sm">
                <span className="text-muted-foreground block mb-1">Recommendations</span>
                <span>{sickNote.recommendations}</span>
              </div>
            )}
            {sickNote.notes && (
              <div className="text-sm">
                <span className="text-muted-foreground block mb-1">Notes</span>
                <span>{sickNote.notes}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Issued By</span>
              <span>{sickNote.issued_by_name}</span>
            </div>
            {sickNote.issued_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Issued At</span>
                <span>{format(new Date(sickNote.issued_at), 'dd MMM yyyy, HH:mm')}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Employer */}
        {(sickNote.employer_name || sickNote.employer_contact) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Employer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sickNote.employer_name && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Name</span>
                  <span>{sickNote.employer_name}</span>
                </div>
              )}
              {sickNote.employer_contact && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Contact</span>
                  <span>{sickNote.employer_contact}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Revocation / Cancellation Info */}
        {sickNote.status === 'REVOKED' && (
          <Card className="border-destructive/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-destructive flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                Revocation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm">
                <span className="text-muted-foreground block mb-1">Reason</span>
                <span>{sickNote.revoke_reason}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Revoked By</span>
                <span>{sickNote.revoked_by_name}</span>
              </div>
              {sickNote.revoked_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Revoked At</span>
                  <span>{format(new Date(sickNote.revoked_at), 'dd MMM yyyy, HH:mm')}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {sickNote.status === 'CANCELLED' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Ban className="h-4 w-4" />
                Cancellation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cancelled By</span>
                <span>{sickNote.cancelled_by_name}</span>
              </div>
              {sickNote.cancelled_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cancelled At</span>
                  <span>{format(new Date(sickNote.cancelled_at), 'dd MMM yyyy, HH:mm')}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Revoke Dialog */}
      <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Sick Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              This will invalidate the sick note. Please provide a reason.
            </p>
            <div className="space-y-2">
              <Label htmlFor="revoke-reason">Reason for revocation</Label>
              <Textarea
                id="revoke-reason"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="e.g. Patient returned to work early"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={!revokeReason.trim() || isSubmitting}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
