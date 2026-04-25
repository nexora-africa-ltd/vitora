'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePatientPastSurgeries, useDeletePastSurgery } from '@/lib/hooks/use-past-surgeries';
import { PastSurgeryFormDialog } from './past-surgery-form-dialog';
import type { PastSurgery } from '@/lib/types/past-surgery';

const outcomeColors: Record<string, string> = {
  SUCCESSFUL: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  COMPLICATED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  UNKNOWN: 'bg-muted text-muted-foreground',
};

export function PatientPastSurgeriesTab({ patientId }: { patientId: number }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<PastSurgery | null>(null);
  const { data: surgeries, isLoading } = usePatientPastSurgeries(patientId);
  const deleteMutation = useDeletePastSurgery(patientId);

  if (isLoading) return <div className="h-20 bg-muted/40 rounded animate-pulse" />;

  const items = surgeries ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} surger{items.length !== 1 ? 'ies' : 'y'}</p>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic p-4 text-center">No past surgeries recorded.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20 text-sm group">
              <span className="font-medium truncate">{item.procedure_name}</span>
              {item.procedure_date && <span className="text-xs text-muted-foreground shrink-0">({item.procedure_date})</span>}
              <Badge className={`${outcomeColors[item.outcome] ?? ''} text-xs shrink-0`}>{item.outcome_display}</Badge>
              <span className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setEditItem(item)}>Edit</Button>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2 text-destructive" onClick={() => deleteMutation.mutate(item.id)}>Delete</Button>
              </span>
            </div>
          ))}
        </div>
      )}
      <PastSurgeryFormDialog open={showAdd} onOpenChange={setShowAdd} patientId={patientId} />
      {editItem && (
        <PastSurgeryFormDialog
          open={!!editItem}
          onOpenChange={(open) => !open && setEditItem(null)}
          patientId={patientId}
          editData={editItem}
        />
      )}
    </div>
  );
}
