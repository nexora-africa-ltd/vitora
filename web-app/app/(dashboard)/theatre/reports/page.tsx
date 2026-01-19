'use client';

import { BarChart3, Construction, Clock, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function TheatreReportsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Theatre Reports"
        description="Utilization, turnaround time, and throughput analytics"
      />

      <Card className="border-dashed border-2 border-muted-foreground/25">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Construction className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            Theatre reporting is planned for Phase 2. This will provide utilization metrics,
            case duration tracking, turnaround time, and performance dashboards.
          </p>
          <Badge variant="secondary" className="mt-4">
            <BarChart3 className="h-3 w-3 mr-1" />
            Planned Phase 2 Feature
          </Badge>
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Turnaround Time</p>
                <p className="text-sm text-muted-foreground">Between-case and room utilization.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Throughput</p>
                <p className="text-sm text-muted-foreground">Cases per day/week by theatre.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <BarChart3 className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Utilization</p>
                <p className="text-sm text-muted-foreground">Booked vs. available time.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
