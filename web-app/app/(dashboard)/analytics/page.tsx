import { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { AnalyticsPageContent } from '@/components/analytics/analytics-page-content';

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
        helpContent="Facility-level operational intelligence. The Dashboard tab shows encounter volumes, revenue trends, top diagnoses, and demographics. The Explore tab provides embedded Metabase dashboards for ad-hoc analysis."
      />

      <AnalyticsPageContent />
    </div>
  );
}
