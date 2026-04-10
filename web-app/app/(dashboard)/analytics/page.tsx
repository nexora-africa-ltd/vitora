import { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';

export const metadata: Metadata = {
  title: 'Analytics | Vitora HMIS',
  description:
    'Operational analytics — encounter trends, revenue breakdown, top diagnoses, bed occupancy, and patient demographics.',
};

export default function AnalyticsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Analytics"
        helpContent="Facility-level operational intelligence. View encounter volumes, revenue trends, top diagnoses, bed occupancy, and patient demographics across configurable time periods."
      />

      <AnalyticsDashboard />
    </div>
  );
}
