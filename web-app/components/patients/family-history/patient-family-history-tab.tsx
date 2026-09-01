'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePatientFamilyHistory, useDeleteFamilyHistory } from '@/lib/hooks/use-family-history';
import { FamilyHistoryFormDialog } from './family-history-form-dialog';
import type { FamilyHistory } from '@/lib/types/family-history';

export function PatientFamilyHistoryTab({ patientId }: { patientId: number }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<FamilyHistory | null>(null);
  const { data: history, isLoading } = usePatientFamilyHistory(patientId);
  const deleteMutation = useDeleteFamilyHistory(patientId);

  if (isLoading) return <div className="h-20 animate-pulse rounded bg-muted/40" />;

  const items = history ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} entr{items.length !== 1 ? 'ies' : 'y'}
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
          No family history recorded.
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 rounded-lg border bg-muted/20 p-2 text-sm"
            >
              <Badge variant="outline" className="shrink-0 text-xs">
                {item.relationship_display}
              </Badge>
              <span className="truncate font-medium">{item.condition_name}</span>
              {item.age_at_onset && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  onset ~{item.age_at_onset}
                </span>
              )}
              {item.deceased && (
                <Badge variant="secondary" className="shrink-0 text-xs">
                  Deceased
                </Badge>
              )}
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
      <FamilyHistoryFormDialog open={showAdd} onOpenChange={setShowAdd} patientId={patientId} />
      {editItem && (
        <FamilyHistoryFormDialog
          open={!!editItem}
          onOpenChange={(open) => !open && setEditItem(null)}
          patientId={patientId}
          editData={editItem}
        />
      )}
    </div>
  );
}
