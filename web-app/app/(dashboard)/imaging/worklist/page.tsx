/**
 * Imaging worklist page for radiologists/technologists.
 */
'use client';

import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ImagingWorklist } from '@/components/imaging';

export default function ImagingWorklistPage() {
  const { refresh, isRefreshing } = usePageRefresh();

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Imaging Worklist"
          helpContent="Orders pending imaging, sorted by priority (STAT > Urgent > Routine) and then by order time. Start an order to begin the imaging procedure."
        />

        <ImagingWorklist />
      </div>
    </PullToRefresh>
  );
}
