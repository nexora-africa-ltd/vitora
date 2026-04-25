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

  if (isLoading) return <div className="h-20 bg-muted/40 rounded animate-pulse" />;

  const items = history ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} entr{items.length !== 1 ? 'ies' : 'y'}</p>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic p-4 text-center">No family history recorded.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20 text-sm group">
              <Badge variant="outline" className="text-xs shrink-0">{item.relationship_display}</Badge>
              <span className="font-medium truncate">{item.condition_name}</span>
              {item.age_at_onset && <span className="text-xs text-muted-foreground shrink-0">onset ~{item.age_at_onset}</span>}
              {item.deceased && <Badge variant="secondary" className="text-xs shrink-0">Deceased</Badge>}
              <span className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setEditItem(item)}>Edit</Button>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2 text-destructive" onClick={() => deleteMutation.mutate(item.id)}>Delete</Button>
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
