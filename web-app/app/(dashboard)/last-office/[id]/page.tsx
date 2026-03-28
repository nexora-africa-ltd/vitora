'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Calendar, Clock, User, FileText, ShieldCheck, AlertTriangle, XCircle, Building2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  useDeathRecord,
  useCertifyDeathRecord,
  useReleaseBody,
  useReportToCivilRegistry,
  useVoidDeathRecord,
} from '@/lib/hooks/use-last-office';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate } from '@/lib/utils/format';
import { DEATH_RECORD_STATUS_COLORS, BODY_STATUS_COLORS } from '@/lib/types/last-office';

export default function DeathRecordDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const id = Number(params.id);

  const { data: record, isLoading } = useDeathRecord(id);
  const certifyMutation = useCertifyDeathRecord();
  const releaseBodyMutation = useReleaseBody();
  const reportMutation = useReportToCivilRegistry();
  const voidMutation = useVoidDeathRecord();

  // Dialog state
  const [certifyOpen, setCertifyOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [certNumber, setCertNumber] = useState('');
  const [releaseTo, setReleaseTo] = useState('');
  const [releaseIdNumber, setReleaseIdNumber] = useState('');
  const [releaseRelationship, setReleaseRelationship] = useState('');
  const [burialPermit, setBurialPermit] = useState('');
  const [voidReason, setVoidReason] = useState('');

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="container mx-auto py-6">
        <p className="text-muted-foreground">Death record not found.</p>
      </div>
    );
  }

  const handleCertify = async () => {
    try {
      await certifyMutation.mutateAsync({ id, data: { certificate_number: certNumber } });
      toast.success('Death record certified');
      setCertifyOpen(false);
      setCertNumber('');
    } catch {
      toast.error('Failed to certify death record');
    }
  };

  const handleReleaseBody = async () => {
    if (!releaseTo.trim()) {
      toast.error('Released to name is required');
      return;
    }
    try {
      await releaseBodyMutation.mutateAsync({
        id,
        data: {
          released_to: releaseTo,
          id_number: releaseIdNumber,
          relationship: releaseRelationship,
          burial_permit_number: burialPermit,
        },
      });
      toast.success('Body released successfully');
      setReleaseOpen(false);
    } catch {
      toast.error('Failed to release body');
    }
  };

  const handleReport = async () => {
    try {
      await reportMutation.mutateAsync(id);
      toast.success('Reported to civil registry');
    } catch {
      toast.error('Failed to report to civil registry');
    }
  };

  const handleVoid = async () => {
    if (voidReason.length < 10) {
      toast.error('Reason must be at least 10 characters');
      return;
    }
    try {
      await voidMutation.mutateAsync({ id, data: { reason: voidReason } });
      toast.success('Death record voided');
      setVoidOpen(false);
      setVoidReason('');
    } catch {
      toast.error('Failed to void death record');
    }
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title={`Death Record — ${record.patient_name}`}
          helpContent="View and manage death record details. Certify deaths, release bodies, and report to civil registry."
        />

        {/* Summary Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {record.patient_name}
              <span className="text-muted-foreground"> • {record.patient_mrn}</span>
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              DOB: {formatDate(record.patient_date_of_birth)} • Gender: {record.patient_gender}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge className={`${DEATH_RECORD_STATUS_COLORS[record.status]} shrink-0 w-fit`}>
              {record.status_display}
            </Badge>
            <Badge variant="outline" className={`${BODY_STATUS_COLORS[record.body_status]} shrink-0 w-fit`}>
              {record.body_status_display}
            </Badge>
          </div>
        </div>

        {/* Voided Banner */}
        {record.is_voided && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <p className="font-medium text-destructive">This record has been voided</p>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Voided by {record.voided_by_username} on {record.voided_at ? formatDate(record.voided_at) : 'N/A'}.
              Reason: {record.void_reason}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {!record.is_voided && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {!record.is_certified && (
              <Button onClick={() => setCertifyOpen(true)}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                Certify Death
              </Button>
            )}
            {record.is_certified && !record.is_released && (
              <Button onClick={() => setReleaseOpen(true)}>
                <User className="h-4 w-4 mr-2" />
                Release Body
              </Button>
            )}
            {record.is_certified && record.status !== 'REPORTED_TO_CIVIL_REGISTRY' && record.status !== 'RELEASED_TO_FAMILY' && (
              <Button variant="outline" onClick={handleReport} disabled={reportMutation.isPending}>
                <Building2 className="h-4 w-4 mr-2" />
                Report to Civil Registry
              </Button>
            )}
            {!record.is_released && (
              <Button variant="destructive" onClick={() => setVoidOpen(true)}>
                <XCircle className="h-4 w-4 mr-2" />
                Void Record
              </Button>
            )}
          </div>
        )}

        {/* Content Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Death Details */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Death Details</CardTitle>
                <HelpPopover content="Core information about the death including date, time, manner, and place." />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow icon={Calendar} label="Date of Death" value={formatDate(record.date_of_death)} />
              {record.time_of_death && (
                <DetailRow icon={Clock} label="Time of Death" value={record.time_of_death} />
              )}
              <DetailRow label="Manner of Death" value={record.manner_of_death_display} />
              <DetailRow label="Place of Death" value={record.place_of_death_display} />
              {record.place_of_death_detail && (
                <DetailRow label="Location Detail" value={record.place_of_death_detail} />
              )}
              <DetailRow label="Notification Source" value={record.notification_source_display} />
            </CardContent>
          </Card>

          {/* Cause of Death */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Cause of Death</CardTitle>
                <HelpPopover content="WHO International Form of Medical Certificate of Cause of Death — primary, antecedent, and underlying causes." />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Line a — Immediate Cause</p>
                <p className="text-sm">{record.primary_cause}</p>
                {record.primary_cause_icd10_code && (
                  <p className="text-xs text-muted-foreground">
                    ICD-10: {record.primary_cause_icd10_code} — {record.primary_cause_icd10_description}
                  </p>
                )}
              </div>
              {record.antecedent_cause && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Line b — Antecedent Cause</p>
                  <p className="text-sm">{record.antecedent_cause}</p>
                  {record.antecedent_cause_icd10_code && (
                    <p className="text-xs text-muted-foreground">
                      ICD-10: {record.antecedent_cause_icd10_code} — {record.antecedent_cause_icd10_description}
                    </p>
                  )}
                </div>
              )}
              {record.underlying_cause && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Line c — Underlying Cause</p>
                  <p className="text-sm">{record.underlying_cause}</p>
                  {record.underlying_cause_icd10_code && (
                    <p className="text-xs text-muted-foreground">
                      ICD-10: {record.underlying_cause_icd10_code} — {record.underlying_cause_icd10_description}
                    </p>
                  )}
                </div>
              )}
              {record.contributing_conditions && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Part II — Contributing Conditions</p>
                  <p className="text-sm">{record.contributing_conditions}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Certification */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Certification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {record.certified_by_username ? (
                <>
                  <DetailRow label="Certified By" value={record.certified_by_username} />
                  <DetailRow label="Certified At" value={record.certified_at ? formatDate(record.certified_at) : '—'} />
                  {record.death_certificate_number && (
                    <DetailRow label="Certificate No." value={record.death_certificate_number} />
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Not yet certified</p>
              )}
            </CardContent>
          </Card>

          {/* Morgue / Last Office */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Morgue / Last Office</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="Body Status" value={record.body_status_display} />
              {record.morgue_compartment && (
                <DetailRow label="Compartment" value={record.morgue_compartment} />
              )}
              {record.morgue_admission_date && (
                <DetailRow label="Morgue Admission" value={formatDate(record.morgue_admission_date)} />
              )}
              {record.released_to && (
                <>
                  <DetailRow label="Released To" value={record.released_to} />
                  {record.released_to_id_number && (
                    <DetailRow label="ID Number" value={record.released_to_id_number} />
                  )}
                  {record.released_to_relationship && (
                    <DetailRow label="Relationship" value={record.released_to_relationship} />
                  )}
                  {record.release_date && (
                    <DetailRow label="Release Date" value={formatDate(record.release_date)} />
                  )}
                  {record.burial_permit_number && (
                    <DetailRow label="Burial Permit" value={record.burial_permit_number} />
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Audit */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Audit Trail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="Recorded By" value={record.recorded_by_username} />
              <DetailRow label="Created" value={formatDate(record.created_at)} />
              <DetailRow label="Last Updated" value={formatDate(record.updated_at)} />
              {record.notes && <DetailRow label="Notes" value={record.notes} />}
            </CardContent>
          </Card>
        </div>

        {/* Certify Dialog */}
        <Dialog open={certifyOpen} onOpenChange={setCertifyOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Certify Death</DialogTitle>
                <HelpPopover content="Certifying a death confirms the medical certificate. Optionally provide a death certificate number." />
              </div>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="cert-number">Death Certificate Number (optional)</Label>
                <Input
                  id="cert-number"
                  value={certNumber}
                  onChange={(e) => setCertNumber(e.target.value)}
                  placeholder="e.g., DC-2026-001"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCertifyOpen(false)}>Cancel</Button>
              <Button onClick={handleCertify} disabled={certifyMutation.isPending}>
                {certifyMutation.isPending ? 'Certifying...' : 'Certify'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Release Body Dialog */}
        <Dialog open={releaseOpen} onOpenChange={setReleaseOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Release Body</DialogTitle>
                <HelpPopover content="Record the release of the body to family. Requires the name of the person collecting." />
              </div>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="released-to">Released To *</Label>
                <Input
                  id="released-to"
                  value={releaseTo}
                  onChange={(e) => setReleaseTo(e.target.value)}
                  placeholder="Full name of collector"
                />
              </div>
              <div>
                <Label htmlFor="release-id">ID Number</Label>
                <Input
                  id="release-id"
                  value={releaseIdNumber}
                  onChange={(e) => setReleaseIdNumber(e.target.value)}
                  placeholder="National ID or passport"
                />
              </div>
              <div>
                <Label htmlFor="release-rel">Relationship</Label>
                <Input
                  id="release-rel"
                  value={releaseRelationship}
                  onChange={(e) => setReleaseRelationship(e.target.value)}
                  placeholder="e.g., Spouse, Son, Daughter"
                />
              </div>
              <div>
                <Label htmlFor="burial-permit">Burial Permit Number</Label>
                <Input
                  id="burial-permit"
                  value={burialPermit}
                  onChange={(e) => setBurialPermit(e.target.value)}
                  placeholder="e.g., BP-2026-001"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReleaseOpen(false)}>Cancel</Button>
              <Button onClick={handleReleaseBody} disabled={releaseBodyMutation.isPending}>
                {releaseBodyMutation.isPending ? 'Releasing...' : 'Release Body'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Void Dialog */}
        <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Void Death Record</DialogTitle>
                <HelpPopover content="Voiding reverses the patient's deceased status. This action is audited. Provide a detailed reason." />
              </div>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                <p className="text-sm text-destructive font-medium">
                  This will reverse the patient&apos;s deceased status and mark them as alive.
                </p>
              </div>
              <div>
                <Label htmlFor="void-reason">Reason (min. 10 characters) *</Label>
                <Textarea
                  id="void-reason"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Explain why this record is being voided..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVoidOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={handleVoid}
                disabled={voidMutation.isPending || voidReason.length < 10}
              >
                {voidMutation.isPending ? 'Voiding...' : 'Void Record'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}
