// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Patient-context control for requesting a DHA Shared Health Record visit. */

'use client';

import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { useRequestSHRConsent } from '@/lib/hooks/use-shr';
import { extractSHAErrorInfo } from '@/lib/sha/error-utils';

export function SHRAccessPanel({ patientId, hasCrNumber }: { patientId: number; hasCrNumber: boolean }) {
  const { user } = useAuth();
  const requestConsent = useRequestSHRConsent();
  const requesterName = user
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username
    : '';
  const requestedBy = user?.role_display ? `${requesterName} (${user.role_display})` : requesterName;

  const requestAccess = async () => {
    if (!requestedBy.trim()) {
      toast.error('Your user profile is missing a name. Contact an administrator before requesting access.');
      return;
    }
    try {
      const visit = await requestConsent.mutateAsync({ patient_id: patientId, requested_by: requestedBy, visit_type: 'OP' });
      toast.success(visit.status === 'APPROVED' ? 'Shared record access is active.' : 'Consent OTP sent by DHA.');
    } catch (error) {
      toast.error(
        extractSHAErrorInfo(error)?.message || 'Unable to request shared record consent.'
      );
    }
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-medium">Shared Health Record</p><p className="text-sm text-muted-foreground">Request patient consent before viewing shared clinical records.</p></div></div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end"><p className="text-xs text-muted-foreground">Requested by: {requestedBy || 'Profile name unavailable'}</p><Button onClick={requestAccess} disabled={!hasCrNumber || !requestedBy || requestConsent.isPending}>{requestConsent.isPending ? 'Requesting...' : 'Request Access'}</Button></div>
      </CardContent>
    </Card>
  );
}
