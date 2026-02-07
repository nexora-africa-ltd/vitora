/**
 * Imaging worklist page for radiologists/technologists.
 */
'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImagingWorklist } from '@/components/imaging';

export default function ImagingWorklistPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/imaging')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Imaging Worklist</h1>
          <p className="text-muted-foreground">
            Orders pending imaging - sorted by priority
          </p>
        </div>
      </div>

      {/* Worklist */}
      <ImagingWorklist />
    </div>
  );
}
