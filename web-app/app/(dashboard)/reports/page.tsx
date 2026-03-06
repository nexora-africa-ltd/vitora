import Link from 'next/link';
import { FlaskConical, Pill, CreditCard, Activity } from 'lucide-react';
import { DashboardOverview } from '@/components/reports/dashboard-overview';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

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
    <div className="container mx-auto py-6 space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Reports & Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Monitor facility performance with real-time KPIs and reports
        </p>
      </div>

      {/* Dashboard Overview */}
      <DashboardOverview />

      {/* Module-Specific Reports */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Module Analytics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {moduleReports.map((report) => (
            <Link key={report.href} href={report.href}>
              <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <report.icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{report.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{report.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
