/**
 * Pre-authorization Detail Page
 * Shows full preauth record with doctor consent tracking.
 */
'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import {
  FileCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { shaApi } from '@/lib/api/sha';
import { DoctorConsentCard } from '@/components/billing/sha/DoctorConsentCard';
import type { SHAPreauth } from '@/lib/schemas/sha.schema';

// ============================================================================
// Component
// ============================================================================

export default function PreauthDetailPage() {
  const params = useParams();
  const preauthId = Number(params.id);

  const { data: preauths } = useQuery({
    queryKey: ['preauths-list'],
    queryFn: () => shaApi.listLocalPreauths({}),
  });

  const preauth: SHAPreauth | undefined = preauths?.results.find(
    (p) => p.id === preauthId
  );

  if (!preauth) {
    return (
      <div className="space-y-4">
        <PageHeader title="Pre-authorization" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading pre-authorization details...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Preauth: ${preauth.intervention_code}`}
        helpContent="View pre-authorization request details and track approval status."
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            Intervention: {preauth.intervention_code}
            {preauth.dha_external_id && (
              <span className="text-muted-foreground"> • DHA ID: {preauth.dha_external_id}</span>
            )}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Created {preauth.created_at ? format(parseISO(preauth.created_at), 'dd MMM yyyy, HH:mm') : '—'}
          </p>
        </div>
        {getStatusBadge(preauth.status)}
      </div>

      {/* Main Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Request Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Status</span>
              <div className="mt-0.5">{getStatusBadge(preauth.status)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Intervention Code</span>
              <p className="font-mono mt-0.5">{preauth.intervention_code}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Consent Token</span>
              <p className="font-mono text-xs mt-0.5 break-all">{preauth.consent_token}</p>
            </div>
            {preauth.dha_external_id && (
              <div>
                <span className="text-muted-foreground">DHA External ID</span>
                <p className="font-mono text-xs mt-0.5">{preauth.dha_external_id}</p>
              </div>
            )}
            {preauth.correlation_id && (
              <div>
                <span className="text-muted-foreground">Correlation ID</span>
                <p className="font-mono text-xs mt-0.5">{preauth.correlation_id}</p>
              </div>
            )}
            {preauth.submitted_at && (
              <div>
                <span className="text-muted-foreground">Submitted At</span>
                <p className="mt-0.5">{format(parseISO(preauth.submitted_at), 'dd MMM yyyy, HH:mm')}</p>
              </div>
            )}
            {preauth.decided_at && (
              <div>
                <span className="text-muted-foreground">Decision At</span>
                <p className="mt-0.5">{format(parseISO(preauth.decided_at), 'dd MMM yyyy, HH:mm')}</p>
              </div>
            )}
            {preauth.cancelled_at && (
              <div>
                <span className="text-muted-foreground">Cancelled At</span>
                <p className="mt-0.5">{format(parseISO(preauth.cancelled_at), 'dd MMM yyyy, HH:mm')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Doctor Consent Card — shown when state is REQUESTED or has been resolved */}
      {preauth.doctor_consent_state && (
        <DoctorConsentCard preauth={preauth} />
      )}

      {/* Diagnoses */}
      {Array.isArray(preauth.diagnoses) && preauth.diagnoses.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Diagnoses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(preauth.diagnoses as unknown[]).map((code, i) => (
                <Badge key={i} variant="outline" className="font-mono">
                  {String(code)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getStatusBadge(status: string) {
  switch (status) {
    case 'approved':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 w-fit">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Approved
        </Badge>
      );
    case 'denied':
      return (
        <Badge variant="destructive" className="w-fit">
          <XCircle className="mr-1 h-3 w-3" />
          Denied
        </Badge>
      );
    case 'submitted':
      return (
        <Badge variant="secondary" className="w-fit">
          <Clock className="mr-1 h-3 w-3" />
          Submitted
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="outline" className="text-muted-foreground w-fit">
          <Ban className="mr-1 h-3 w-3" />
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="w-fit">
          <FileCheck className="mr-1 h-3 w-3" />
          Draft
        </Badge>
      );
  }
}
