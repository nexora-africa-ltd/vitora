/**
 * Physiotherapy Orders List Page
 */

'use client';

import { PageHeader } from '@/components/shared/page-header';
import { PhysioOrderTable } from '@/components/allied-health/physiotherapy';

export default function PhysiotherapyOrdersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Physiotherapy Orders"
        helpContent="Manage physiotherapy treatment orders. View pending, in-progress, and completed orders."
      />
      <PhysioOrderTable />
    </div>
  );
}
