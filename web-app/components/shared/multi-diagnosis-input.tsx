'use client';

import { useCallback, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DiagnosisCodeInput, emptyDiagnosisCodeValue, type DiagnosisCodeValue } from './diagnosis-code-input';
import type { DiagnosisRole } from '@/lib/types/inpatient';

export interface DiagnosisEntry {
  role: DiagnosisRole;
  code: DiagnosisCodeValue;
}

const ROLE_OPTIONS: { value: DiagnosisRole; label: string }[] = [
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'SECONDARY', label: 'Secondary' },
  { value: 'COMPLICATION', label: 'Complication' },
];

const ROLE_COLORS: Record<DiagnosisRole, string> = {
  PRIMARY: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  SECONDARY: 'bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-400',
  COMPLICATION: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

interface MultiDiagnosisInputProps {
  value: DiagnosisEntry[];
  onChange: (entries: DiagnosisEntry[]) => void;
  label?: string;
  disabled?: boolean;
}

/**
 * Multi-diagnosis input supporting PRIMARY, SECONDARY, and COMPLICATION roles.
 * Wraps the existing DiagnosisCodeInput for each row.
 */
export function MultiDiagnosisInput({
  value,
  onChange,
  label = 'Discharge Diagnoses',
  disabled = false,
}: MultiDiagnosisInputProps) {
  const [addingRole, setAddingRole] = useState<DiagnosisRole>('SECONDARY');

  const hasPrimary = value.some((e) => e.role === 'PRIMARY');

  const handleAdd = useCallback(() => {
    const role = !hasPrimary ? 'PRIMARY' : addingRole;
    onChange([...value, { role, code: emptyDiagnosisCodeValue() }]);
    // Default next add to SECONDARY
    setAddingRole('SECONDARY');
  }, [value, onChange, hasPrimary, addingRole]);

  const handleRemove = useCallback((index: number) => {
    onChange(value.filter((_, i) => i !== index));
  }, [value, onChange]);

  const handleCodeChange = useCallback((index: number, code: DiagnosisCodeValue) => {
    const updated = value.map((entry, i) => i === index ? { ...entry, code } : entry);
    onChange(updated);
  }, [value, onChange]);

  const handleRoleChange = useCallback((index: number, role: DiagnosisRole) => {
    const updated = value.map((entry, i) => i === index ? { ...entry, role } : entry);
    onChange(updated);
  }, [value, onChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          {hasPrimary && (
            <Select value={addingRole} onValueChange={(v) => setAddingRole(v as DiagnosisRole)}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.filter((r) => r.value !== 'PRIMARY' || !hasPrimary).map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-xs">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAdd}
            disabled={disabled}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {!hasPrimary ? 'Add Primary' : 'Add Diagnosis'}
          </Button>
        </div>
      </div>

      {value.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-lg">
          No diagnoses added. Click &quot;Add Primary&quot; to start.
        </p>
      )}

      <div className="space-y-3">
        {value.map((entry, index) => (
          <div key={index} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge className={`shrink-0 text-xs ${ROLE_COLORS[entry.role]}`}>
                  {entry.role}
                </Badge>
                {entry.role === 'PRIMARY' ? (
                  <span className="text-xs text-muted-foreground">Principal diagnosis</span>
                ) : (
                  <Select
                    value={entry.role}
                    onValueChange={(v) => handleRoleChange(index, v as DiagnosisRole)}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-7 w-[130px] text-xs border-0 bg-transparent p-0">
                      <span className="text-xs text-muted-foreground">Change role</span>
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.filter((r) => r.value !== 'PRIMARY' || !hasPrimary || entry.role === 'PRIMARY').map((r) => (
                        <SelectItem key={r.value} value={r.value} className="text-xs">
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(index)}
                disabled={disabled}
                className="h-7 w-7 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <DiagnosisCodeInput
              value={entry.code}
              onChange={(code) => handleCodeChange(index, code)}
              disabled={disabled}
              showVersionToggle
            />
          </div>
        ))}
      </div>
    </div>
  );
}
