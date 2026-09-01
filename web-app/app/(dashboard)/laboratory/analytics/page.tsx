import { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { LabAnalyticsDashboard } from '@/components/laboratory/lab-analytics-dashboard';

export const metadata: Metadata = {
  title: 'Lab Analytics | Vitora HMIS',
  description:
    'Laboratory operational analytics - turnaround times, workload, critical values, and sample rejection rates',
};

export default function LabAnalyticsPage() {
  return (
    <div className="container mx-auto space-y-6 py-6">
      <PageHeader
        title="Lab Analytics"
        helpContent="Monitor laboratory operational metrics including turnaround times, technician workload, critical values, and sample rejection rates. Use the date filter to analyze different time periods."
      />

      <LabAnalyticsDashboard />
    </div>
  );
}
