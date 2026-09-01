/**
 * Diet Plans List Page
 * Browse and manage nutrition diet plans
 */

'use client';

import { PageHeader } from '@/components/shared/page-header';
import { DietPlanTable } from '@/components/allied-health/nutrition';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useCreateRouteAccess } from '@/lib/hooks/use-create-route-access';

export default function DietPlansPage() {
  const router = useRouter();
  const canCreateRoute = useCreateRouteAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diet Plans"
        helpContent="View and manage patient diet plans. Create meal plans with nutritional targets, food guidance, and supplements."
        actions={
          <Button
            onClick={() => router.push('/allied-health/nutrition/diet-plans/new')}
            disabled={!canCreateRoute('/allied-health/nutrition/diet-plans/new')}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Diet Plan
          </Button>
        }
      />
      <DietPlanTable hideCreateButton />
    </div>
  );
}
