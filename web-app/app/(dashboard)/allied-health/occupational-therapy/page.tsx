/**
 * Occupational Therapy Orders List Page
 */

'use client';

import { PageHeader } from '@/components/shared/page-header';
import { OTOrderTable } from '@/components/allied-health/occupational-therapy';

export default function OccupationalTherapyOrdersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Occupational Therapy Orders"
        helpContent="Manage occupational therapy treatment orders. Support ADL training, cognitive rehabilitation, and vocational therapy."
      />
      <OTOrderTable />
    </div>
  );
}
