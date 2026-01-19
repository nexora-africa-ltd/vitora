'use client';

import { CheckSquare, ClipboardCheck, Construction, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function TheatreChecklistsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Theatre Checklists"
        description="Pre-op safety and readiness checklists"
      />

      <Card className="border-dashed border-2 border-muted-foreground/25">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Construction className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            Theatre checklists are planned for Phase 2. This will support pre-operative
            workflows like consent verification, labs, vitals, anesthesia review, and surgical
            safety checklists.
          </p>
          <Badge variant="secondary" className="mt-4">
            <CheckSquare className="h-3 w-3 mr-1" />
            Planned Phase 2 Feature
          </Badge>
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-start gap-3">
              <ClipboardCheck className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Pre-op Readiness</p>
                <p className="text-sm text-muted-foreground">
                  Consent, investigations, fasting status, allergies, and risk review.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Safety Checklist</p>
                <p className="text-sm text-muted-foreground">
                  WHO-style sign-in / time-out / sign-out checklist flows.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
