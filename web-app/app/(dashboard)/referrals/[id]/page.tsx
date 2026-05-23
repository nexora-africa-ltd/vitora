/**
 * Referral Detail Page
 * Shows full referral details with action buttons for accept/decline/complete/cancel.
 */

'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeftRight,
  User,
  Stethoscope,
  Clock,
  Printer,
  CheckCircle2,
  XCircle,
  Ban,
  AlertTriangle,
  Building2,
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
import { referralsApi } from '@/lib/api/referrals';
import { signaturesApi } from '@/lib/api/certificates';
import { printReferralLetter } from '@/lib/documents/print-referral';
import { useFacility } from '@/lib/context/facility-context';
import {
  REFERRAL_STATUS_CONFIG,
  REFERRAL_PRIORITY_CONFIG,
  REFERRAL_TYPE_DISPLAY,
} from '@/lib/types/referral';
import type { ReferralStatus, ReferralPriority } from '@/lib/types/referral';
import { useToast } from '@/lib/hooks/use-toast';

const STATUS_COLORS: Record<ReferralStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  ACCEPTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  DECLINED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED: 'bg-muted text-muted-foreground',
  EXPIRED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

const PRIORITY_COLORS: Record<ReferralPriority, string> = {
  ROUTINE: 'bg-muted text-muted-foreground',
  URGENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  EMERGENCY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function ReferralDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { facilityDetail } = useFacility();
  const id = Number(params.id);

  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: referral, isLoading } = useQuery({
    queryKey: ['referral', id],
    queryFn: () => referralsApi.get(id),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['referral', id] });
    queryClient.invalidateQueries({ queryKey: ['referrals'] });
  };

  const handleAccept = async () => {
    setIsSubmitting(true);
    try {
      await referralsApi.accept(id);
      invalidate();
      toast({ title: 'Referral accepted' });
    } catch {
      toast({ title: 'Failed to accept referral', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await referralsApi.accept(id, 'Completed');
      invalidate();
      toast({ title: 'Referral marked complete' });
    } catch {
      toast({ title: 'Failed to complete referral', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!reason.trim()) return;
    setIsSubmitting(true);
    try {
      await referralsApi.decline(id, reason);
      setDeclineDialogOpen(false);
      setReason('');
      invalidate();
      toast({ title: 'Referral declined' });
    } catch {
      toast({ title: 'Failed to decline referral', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!reason.trim()) return;
    setIsSubmitting(true);
    try {
      await referralsApi.cancel(id, reason);
      setCancelDialogOpen(false);
      setReason('');
      invalidate();
      toast({ title: 'Referral cancelled' });
    } catch {
      toast({ title: 'Failed to cancel referral', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = async () => {
    if (!referral) return;
    let signature;
    try {
      const sigs = await signaturesApi.forDocument('ClinicalReferral', id);
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
    printReferralLetter({
      referral,
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

  if (isLoading || !referral) {
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
        title={`Referral ${referral.referral_number}`}
        helpContent="View referral details. Accept, decline, complete, or cancel as appropriate."
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {referral.patient_name}
            <span className="text-muted-foreground"> • {referral.patient_mrn}</span>
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {REFERRAL_TYPE_DISPLAY[referral.referral_type]} → {referral.target_service_display}
            {referral.destination_clinic_name && ` • ${referral.destination_clinic_name}`}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <SignatureBadge documentType="ClinicalReferral" documentId={id} canSign={referral.status === 'ACCEPTED' || referral.status === 'IN_PROGRESS'} />
          <Badge className={`${PRIORITY_COLORS[referral.priority]} shrink-0 w-fit`}>
            {REFERRAL_PRIORITY_CONFIG[referral.priority]?.label}
          </Badge>
          <Badge className={`${STATUS_COLORS[referral.status]} shrink-0 w-fit`}>
            {REFERRAL_STATUS_CONFIG[referral.status]?.label}
          </Badge>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-1" />
          Print
        </Button>
        {referral.status === 'PENDING' && referral.referral_type !== 'EXTERNAL' && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeclineDialogOpen(true)}
              disabled={isSubmitting}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Decline
            </Button>
            <Button size="sm" onClick={handleAccept} disabled={isSubmitting}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Accept
            </Button>
          </>
        )}
        {(referral.status === 'ACCEPTED' || referral.status === 'IN_PROGRESS'
          || (referral.status === 'PENDING' && referral.referral_type === 'EXTERNAL')) && (
          <Button size="sm" onClick={handleComplete} disabled={isSubmitting}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Complete
          </Button>
        )}
        {!referral.is_terminal && referral.status !== 'COMPLETED' && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setCancelDialogOpen(true)}
            disabled={isSubmitting}
          >
            <Ban className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        )}
      </div>

      {/* Content Cards */}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {/* Referral Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              Referral Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Type</span>
              <span>{referral.referral_type_display}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Target Service</span>
              <span>{referral.target_service_display}</span>
            </div>
            {referral.destination_clinic_name && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Clinic</span>
                <span>{referral.destination_clinic_name}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Priority</span>
              <Badge className={`${PRIORITY_COLORS[referral.priority]} text-xs`}>
                {referral.priority_display}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Referred By</span>
              <span>{referral.referred_by_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Created</span>
              <span>{format(new Date(referral.created_at), 'dd MMM yyyy, HH:mm')}</span>
            </div>
            {referral.expires_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Expires</span>
                <span>{format(new Date(referral.expires_at), 'dd MMM yyyy, HH:mm')}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clinical Context */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4" />
              Clinical Context
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">
              <span className="text-muted-foreground block mb-1">Reason for Referral</span>
              <span>{referral.reason}</span>
            </div>
            {referral.clinical_notes && (
              <div className="text-sm">
                <span className="text-muted-foreground block mb-1">Clinical Notes</span>
                <span>{referral.clinical_notes}</span>
              </div>
            )}
            {referral.relevant_diagnoses && referral.relevant_diagnoses.length > 0 && (
              <div className="text-sm">
                <span className="text-muted-foreground block mb-1">Relevant Diagnoses</span>
                <ul className="list-disc list-inside space-y-0.5">
                  {referral.relevant_diagnoses.map((d, i) => (
                    <li key={i}>
                      <span className="font-mono text-xs">{d.code}</span> – {d.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hospital Course */}
        {referral.hospital_course && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Stethoscope className="h-4 w-4" />
                Hospital Course
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{referral.hospital_course}</p>
            </CardContent>
          </Card>
        )}

        {/* Vitals Snapshot */}
        {referral.relevant_vitals && Object.values(referral.relevant_vitals).some(Boolean) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Vitals at Referral
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {referral.relevant_vitals.blood_pressure && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Blood Pressure</span>
                  <span>{referral.relevant_vitals.blood_pressure} mmHg</span>
                </div>
              )}
              {referral.relevant_vitals.pulse && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pulse</span>
                  <span>{referral.relevant_vitals.pulse} bpm</span>
                </div>
              )}
              {referral.relevant_vitals.temperature && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Temperature</span>
                  <span>{referral.relevant_vitals.temperature}°C</span>
                </div>
              )}
              {referral.relevant_vitals.respiratory_rate && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Resp. Rate</span>
                  <span>{referral.relevant_vitals.respiratory_rate} /min</span>
                </div>
              )}
              {referral.relevant_vitals.spo2 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">SpO2</span>
                  <span>{referral.relevant_vitals.spo2}%</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* External Facility (for external referrals) */}
        {referral.referral_type === 'EXTERNAL' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                External Facility
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {referral.external_facility_name && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Facility</span>
                  <span>{referral.external_facility_name}</span>
                </div>
              )}
              {referral.external_facility_code && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Code</span>
                  <span className="font-mono">{referral.external_facility_code}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Status Tracking */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Status Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {referral.accepted_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Accepted</span>
                <span>
                  {format(new Date(referral.accepted_at), 'dd MMM yyyy, HH:mm')}
                  {referral.accepted_by_name && ` by ${referral.accepted_by_name}`}
                </span>
              </div>
            )}
            {referral.completed_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Completed</span>
                <span>{format(new Date(referral.completed_at), 'dd MMM yyyy, HH:mm')}</span>
              </div>
            )}
            {referral.declined_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Declined</span>
                <span>
                  {format(new Date(referral.declined_at), 'dd MMM yyyy, HH:mm')}
                  {referral.declined_by_name && ` by ${referral.declined_by_name}`}
                </span>
              </div>
            )}
            {referral.decline_reason && (
              <div className="text-sm">
                <span className="text-muted-foreground block mb-1">Decline Reason</span>
                <span>{referral.decline_reason}</span>
              </div>
            )}
            {referral.cancelled_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cancelled</span>
                <span>
                  {format(new Date(referral.cancelled_at), 'dd MMM yyyy, HH:mm')}
                  {referral.cancelled_by_name && ` by ${referral.cancelled_by_name}`}
                </span>
              </div>
            )}
            {referral.cancel_reason && (
              <div className="text-sm">
                <span className="text-muted-foreground block mb-1">Cancel Reason</span>
                <span>{referral.cancel_reason}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Decline Dialog */}
      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Referral</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="decline-reason">Reason for declining</Label>
              <Textarea
                id="decline-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Service not available, patient criteria not met"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineDialogOpen(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleDecline}
              disabled={!reason.trim() || isSubmitting}
            >
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Referral</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Reason for cancellation</Label>
              <Textarea
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Patient declined, no longer needed"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={!reason.trim() || isSubmitting}
            >
              Cancel Referral
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
