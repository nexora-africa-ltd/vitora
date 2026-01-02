import { DashboardOverview } from '@/components/reports/dashboard-overview';

export const metadata = {
  title: 'Reports & Analytics | Vitora HMIS',
  description: 'View facility reports, KPIs, and analytics dashboards',
};

export default function ReportsPage() {
  return (
    <div className="container mx-auto py-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Reports & Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Monitor facility performance with real-time KPIs and reports
        </p>
      </div>

      {/* Dashboard Overview */}
      <DashboardOverview />
    </div>
  );
}
