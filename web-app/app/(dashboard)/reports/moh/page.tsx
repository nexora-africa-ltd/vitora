import { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { MOHReportsDashboard } from '@/components/moh-reports/moh-reports-dashboard';

export const metadata: Metadata = {
  title: 'MOH Reports | Vitora HMIS',
  description:
    'Generate and submit MOH 705, 711, and 717 monthly reports to DHIS2/KHIS.',
};

export default function MOHReportsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="MOH Reports"
        helpContent="Generate Kenya MOH mandatory monthly reports (705 — Outpatient Morbidity, 711 — Integrated RH/HIV/Malaria/Nutrition, 717 — Workload Summary). Reports are generated as drafts, then reviewed and submitted to DHIS2/KHIS."
      />

      <MOHReportsDashboard />
    </div>
  );
}
