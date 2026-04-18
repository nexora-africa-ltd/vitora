import Link from 'next/link';
import { FlaskConical, Pill, CreditCard, Activity } from 'lucide-react';
import { DashboardOverview } from '@/components/reports/dashboard-overview';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { HelpPopover } from '@/components/shared/help-popover';

export const metadata = {
  title: 'Reports & Analytics | Vitora HMIS',
  description: 'View facility reports, KPIs, and analytics dashboards',
};

const moduleReports = [
  {
    title: 'Laboratory Analytics',
    description: 'Turnaround times, workload, critical values, and rejection rates',
    href: '/laboratory/analytics',
    icon: FlaskConical,
  },
  {
    title: 'Pharmacy Reports',
    description: 'Dispensing trends, stock levels, and expiry tracking',
    href: '/pharmacy/reports',
    icon: Pill,
  },
  {
    title: 'Financial Reports',
    description: 'Revenue, billing, and claims analytics',
    href: '/transactions/reports',
    icon: CreditCard,
  },
  {
    title: 'Clinical Quality',
    description: 'Quality measures and compliance reporting',
    href: '/quality',
    icon: Activity,
  },
];

export default function ReportsPage() {
  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <div className="print-hide-on-print">
        <PageHeader
          title="Reports & Analytics"
          helpContent="Monitor facility performance with real-time KPIs, charts, and module-specific analytics dashboards."
        />
      </div>

      {/* Dashboard Overview */}
      <DashboardOverview />

      {/* Module-Specific Reports — hidden in print (link cards have no value on paper) */}
      <section className="print-hide-section">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg sm:text-xl font-semibold">Module Analytics</h2>
          <HelpPopover content="Quick links to detailed analytics for each clinical and administrative module." />
        </div>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {moduleReports.map((report) => (
            <Link key={report.href} href={report.href}>
              <Card variant="interactive" className="h-full min-h-[8rem] relative overflow-hidden">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                  aria-hidden="true"
                />
                <CardHeader className="relative pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <report.icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{report.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="relative">
                  <p className="text-sm text-muted-foreground">{report.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
