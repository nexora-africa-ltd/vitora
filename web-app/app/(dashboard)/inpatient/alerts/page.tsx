'use client';

import { useIsSupervisor } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { SupervisorAlertsPanel, ConstraintOverrideMetrics } from '@/components/inpatient';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';

export default function SupervisorAlertsPage() {
  const isSupervisor = useIsSupervisor();

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Supervisor Alerts"
        helpContent="Review and acknowledge critical constraint violations that were overridden during patient admissions. Monitor override metrics to identify patterns."
      />

      {!isSupervisor && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Limited Access</AlertTitle>
          <AlertDescription>
            Full alert acknowledgment features require supervisor permissions.
            Contact your administrator if you need access.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
        {/* Alerts Panel - Full width on mobile, half on xl */}
        <div className="xl:col-span-1">
          <SupervisorAlertsPanel />
        </div>

        {/* Metrics - Full width on mobile, half on xl */}
        <div className="xl:col-span-1">
          <ConstraintOverrideMetrics />
        </div>
      </div>
    </div>
  );
}
