'use client';

import { useRouter } from 'next/navigation';
import { Settings, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';

const sections = [
  {
    title: 'Configuration',
    description: 'Set up KRA eTIMS device credentials and API connection',
    href: '/inventory/etims/config',
    icon: Settings,
  },
  {
    title: 'Invoices',
    description: 'View and manage eTIMS invoice submissions to KRA',
    href: '/inventory/etims/invoices',
    icon: FileText,
  },
];

export default function ETIMSPage() {
  const router = useRouter();

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="eTIMS"
        helpContent="KRA electronic Tax Invoice Management System integration. Configure your device credentials and track invoice submissions."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Card
            key={s.href}
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => router.push(s.href)}
          >
            <CardContent className="flex items-start gap-4 p-4 sm:p-6">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
