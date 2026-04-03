'use client';

import { SquareDashedTopSolid, Construction, FileText } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function TheatreCasesPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Theatre Cases"
        description="Pre-op, intra-op, and post-op case documentation"
      />

      <Card className="border-dashed border-2 border-muted-foreground/25">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Construction className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            Theatre case tracking is planned for Phase 2. This will cover pre-op checklists,
            intra-op notes, post-op follow-up, and structured operative documentation.
          </p>
          <Badge variant="secondary" className="mt-4">
            <SquareDashedTopSolid className="h-3 w-3 mr-1" />
            Planned Phase 2 Feature
          </Badge>
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium">Documentation Ready</p>
              <p className="text-sm text-muted-foreground">
                Operative notes will use structured templates to standardize capture and
                support reporting.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
