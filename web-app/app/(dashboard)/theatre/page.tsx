'use client';

import {
  Calendar,
  Construction,
  ClipboardList,
  Activity,
  FileText,
  BarChart3,
  CheckSquare,
  Stethoscope,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const plannedFeatures = [
  {
    icon: Calendar,
    title: 'Theatre Scheduling',
    description: 'Surgery booking, theatre lists, and calendar-based planning',
    status: 'Planned',
  },
  {
    icon: CheckSquare,
    title: 'Pre-Op Checklist',
    description: 'Consent, labs, vitals, anesthesia review, and safety checklist',
    status: 'Planned',
  },
  {
    icon: ClipboardList,
    title: 'Intra-Op Documentation',
    description: 'Procedure notes, timings, staff, implants, and consumables tracking',
    status: 'Planned',
  },
  {
    icon: Activity,
    title: 'Post-Op Tracking',
    description: 'Recovery monitoring, complications, and post-op care follow-up',
    status: 'Planned',
  },
  {
    icon: FileText,
    title: 'Surgery Documentation',
    description: 'Structured operative notes and standardized templates',
    status: 'Planned',
  },
  {
    icon: BarChart3,
    title: 'Utilization Reports',
    description: 'Theatre utilization, turnaround time, and throughput analytics',
    status: 'Planned',
  },
];

export default function TheatrePage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Theatre"
        description="Surgery scheduling, peri-operative workflows, and theatre reporting"
      />

      <Card className="border-dashed border-2 border-muted-foreground/25">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Construction className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            The Theatre module is planned to be implemented in a future sprint. It will provide end-to-end theatre
            management including scheduling, pre/intra/post-op workflows, and utilization
            reporting.
          </p>
          <Badge variant="secondary" className="mt-4">
            <Stethoscope className="h-3 w-3 mr-1" />
            Planned Feature
          </Badge>

          <div className="flex flex-col sm:flex-row gap-2 mt-6">
            <Button asChild variant="outline">
              <Link href="/theatre/schedule">Go to Schedule</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/theatre/checklists">Go to Checklists</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/theatre/cases">Go to Cases</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/theatre/reports">Go to Reports</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Planned Features</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plannedFeatures.map((feature) => (
            <Card key={feature.title} className="opacity-75">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-muted">
                      <feature.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {feature.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
