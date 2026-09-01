'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  usePatientChronicConditions,
  useDeleteChronicCondition,
} from '@/lib/hooks/use-chronic-conditions';
import { ChronicConditionFormDialog } from './chronic-condition-form-dialog';
import type { ChronicCondition } from '@/lib/types/chronic-condition';

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  REMISSION: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  RESOLVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  UNKNOWN: 'bg-muted text-muted-foreground',
};

export function PatientChronicConditionsTab({ patientId }: { patientId: number }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<ChronicCondition | null>(null);
  const { data: conditions, isLoading } = usePatientChronicConditions(patientId);
  const deleteMutation = useDeleteChronicCondition(patientId);

  if (isLoading) return <div className="h-20 animate-pulse rounded bg-muted/40" />;

  const items = conditions ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} condition{items.length !== 1 ? 's' : ''}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="p-4 text-center text-sm italic text-muted-foreground">
          No chronic conditions recorded.
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 rounded-lg border bg-muted/20 p-2 text-sm"
            >
              <span className="truncate font-medium">{item.condition_name}</span>
              {item.icd10_code && (
                <span className="shrink-0 text-xs text-muted-foreground">({item.icd10_code})</span>
              )}
              <Badge className={`${statusColors[item.status] ?? ''} shrink-0 text-xs`}>
                {item.status_display}
              </Badge>
              <span className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setEditItem(item)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-destructive"
                  onClick={() => deleteMutation.mutate(item.id)}
                >
                  Delete
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
      <ChronicConditionFormDialog open={showAdd} onOpenChange={setShowAdd} patientId={patientId} />
      {editItem && (
        <ChronicConditionFormDialog
          open={!!editItem}
          onOpenChange={(open) => !open && setEditItem(null)}
          patientId={patientId}
          editData={editItem}
        />
      )}
    </div>
  );
}
