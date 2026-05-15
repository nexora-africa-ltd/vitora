'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  Check,
  ClipboardList,
  DollarSign,
  Send,
  Shield,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useInsurancePreauth,
  useSubmitPreauth,
  useApprovePreauth,
  useDenyPreauth,
  useCancelPreauth,
} from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import usePermissions from '@/lib/hooks/use-permissions';
import { PREAUTH_STATUS_LABELS } from '@/lib/types/insurance';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

export default function PreauthDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { canPerformAction } = usePermissions();
  const preauthId = Number(params.id);

  const canAdjudicate = canPerformAction('billing.adjudicate_claims');
  const canSubmitClaims = canPerformAction('billing.submit_insurance_claim');

  const { data: preauth, isLoading, refetch } = useInsurancePreauth(preauthId);
  const submitPreauth = useSubmitPreauth();
  const approvePreauth = useApprovePreauth();
  const denyPreauth = useDenyPreauth();
  const cancelPreauth = useCancelPreauth();

  // Dialog state
  const [approveOpen, setApproveOpen] = useState(false);
  const [approvedAmount, setApprovedAmount] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [denyOpen, setDenyOpen] = useState(false);
  const [denyReason, setDenyReason] = useState('');

  const handleSubmit = async () => {
    try {
      await submitPreauth.mutateAsync(preauthId);
      toast({ title: 'Pre-authorization submitted' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to submit pre-authorization.', variant: 'destructive' });
    }
  };

  const handleApprove = async () => {
    try {
      await approvePreauth.mutateAsync({
        id: preauthId,
        approved_amount: approvedAmount,
        validity_days: validityDays ? Number(validityDays) : undefined,
      });
      toast({ title: 'Pre-authorization approved' });
      setApproveOpen(false);
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to approve pre-authorization.', variant: 'destructive' });
    }
  };

  const handleDeny = async () => {
    try {
      await denyPreauth.mutateAsync({ id: preauthId, reason: denyReason });
      toast({ title: 'Pre-authorization denied' });
      setDenyOpen(false);
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to deny pre-authorization.', variant: 'destructive' });
    }
  };

  const handleCancel = async () => {
    try {
      await cancelPreauth.mutateAsync({ id: preauthId });
      toast({ title: 'Pre-authorization cancelled' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to cancel pre-authorization.', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!preauth) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-muted-foreground">
          <AlertCircle className="h-5 w-5" />
          Pre-authorization not found.
        </CardContent>
      </Card>
    );
  }

  const canSubmit = preauth.status === 'draft' && canSubmitClaims;
  const canApprove = preauth.status === 'submitted' && canAdjudicate;
  const canDeny = preauth.status === 'submitted' && canAdjudicate;
  const canCancel = ['draft', 'submitted'].includes(preauth.status) && canSubmitClaims;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Pre-auth ${preauth.preauth_number}`}
        helpContent="View pre-authorization details, requested services, and manage the approval lifecycle."
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push('/insurance/preauths')}>
            All Pre-auths
          </Button>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium">
            {preauth.patient_name}
            <span className="text-muted-foreground"> • {preauth.member_number}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {preauth.provider_name} • {preauth.preauth_type}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`${STATUS_COLORS[preauth.status] || ''} shrink-0 w-fit`}>
            {PREAUTH_STATUS_LABELS[preauth.status] || preauth.status}
          </Badge>
          {preauth.is_expired && <Badge variant="destructive">Expired</Badge>}
        </div>
      </div>

      {/* Action Buttons */}
      {(canSubmit || canApprove || canDeny || canCancel) && (
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-2">
              {canSubmit && (
                <Button size="sm" onClick={handleSubmit} disabled={submitPreauth.isPending} className="gap-1">
                  <Send className="h-3 w-3" /> Submit
                </Button>
              )}
              {canApprove && (
                <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700">
                      <Check className="h-3 w-3" /> Approve
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Approve Pre-authorization</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label>Approved Amount (KES) *</Label>
                        <Input type="number" value={approvedAmount} onChange={e => setApprovedAmount(e.target.value)} placeholder={preauth.estimated_cost} />
                      </div>
                      <div className="space-y-1">
                        <Label>Validity Period (days)</Label>
                        <Input type="number" value={validityDays} onChange={e => setValidityDays(e.target.value)} placeholder="30" />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
                        <Button onClick={handleApprove} disabled={approvePreauth.isPending || !approvedAmount}>Approve</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {canDeny && (
                <Dialog open={denyOpen} onOpenChange={setDenyOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" /> Deny
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Deny Pre-authorization</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label>Reason *</Label>
                        <Textarea value={denyReason} onChange={e => setDenyReason(e.target.value)} rows={3} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDenyOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDeny} disabled={denyPreauth.isPending || !denyReason}>Deny</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {canCancel && (
                <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:text-destructive" onClick={handleCancel} disabled={cancelPreauth.isPending}>
                  <XCircle className="h-3 w-3" /> Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Financial Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Estimated Cost</p>
            <p className="text-lg font-semibold">KES {Number(preauth.estimated_cost || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Approved Amount</p>
            <p className="text-lg font-semibold">{preauth.approved_amount ? `KES ${Number(preauth.approved_amount).toLocaleString()}` : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Validity</p>
            <p className="text-lg font-semibold">{preauth.validity_period_days ? `${preauth.validity_period_days} days` : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Type</p>
            <p className="text-lg font-semibold capitalize">{preauth.preauth_type}</p>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {preauth.approved_at && (
              <>
                <dt className="text-muted-foreground">Approved At</dt>
                <dd>{new Date(preauth.approved_at).toLocaleDateString()}</dd>
              </>
            )}
            {preauth.expires_at && (
              <>
                <dt className="text-muted-foreground">Expires At</dt>
                <dd>{new Date(preauth.expires_at).toLocaleDateString()}</dd>
              </>
            )}
            {preauth.external_preauth_id && (
              <>
                <dt className="text-muted-foreground">External ID</dt>
                <dd className="font-mono text-xs">{preauth.external_preauth_id}</dd>
              </>
            )}
            {preauth.diagnosis_codes?.length > 0 && (
              <>
                <dt className="text-muted-foreground">Diagnosis Codes</dt>
                <dd className="flex flex-wrap gap-1">
                  {preauth.diagnosis_codes.map(code => (
                    <Badge key={code} variant="outline" className="text-xs">{code}</Badge>
                  ))}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Created</dt>
            <dd>{new Date(preauth.created_at).toLocaleDateString()}</dd>
            <dt className="text-muted-foreground">Updated</dt>
            <dd>{new Date(preauth.updated_at).toLocaleDateString()}</dd>
          </dl>
        </CardContent>
      </Card>

      {/* Rejection Info */}
      {preauth.rejection_reason && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" /> Denial Reason
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{preauth.rejection_reason}</p>
          </CardContent>
        </Card>
      )}

      {/* Requested Services */}
      {preauth.requested_services?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Requested Services
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left font-medium p-2">Description</th>
                    <th className="text-left font-medium p-2">Code</th>
                    <th className="text-right font-medium p-2">Qty</th>
                    <th className="text-right font-medium p-2">Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {preauth.requested_services.map((svc, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="p-2">{svc.description}</td>
                      <td className="p-2 font-mono text-xs">{svc.code || '—'}</td>
                      <td className="p-2 text-right">{svc.quantity || 1}</td>
                      <td className="p-2 text-right">{svc.estimated_cost ? `KES ${Number(svc.estimated_cost).toLocaleString()}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clinical Notes */}
      {preauth.clinical_notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" /> Clinical Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{preauth.clinical_notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {preauth.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{preauth.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
