'use client';

import { useState } from 'react';
import {
  Loader2,
  Plus,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { StaffSearchCombobox } from '@/components/clinics/staff-search-combobox';
import { TEAM_ROLES } from '@/lib/schemas/theatre.schema';

export const TEAM_ROLE_LABELS: Record<(typeof TEAM_ROLES)[number], string> = {
  LEAD_SURGEON: 'Lead Surgeon',
  ASSISTANT_SURGEON: 'Assistant Surgeon',
  ANESTHESIOLOGIST: 'Anesthesiologist',
  ANESTHESIA_TECH: 'Anesthesia Tech',
  CIRCULATING_NURSE: 'Circulating Nurse',
  SCRUB_NURSE: 'Scrub Nurse',
  SCRUB_TECH: 'Scrub Tech',
  RECOVERY_NURSE: 'Recovery Nurse',
  OBSERVER: 'Observer',
};

export function TeamAssignmentDialog({
  open,
  onOpenChange,
  excludeUserIds,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** User IDs of already-assigned team members (excluded from search results). */
  excludeUserIds?: number[];
  onSubmit: (data: { staffUserId: number; role: (typeof TEAM_ROLES)[number]; notes: string }) => void;
  submitting: boolean;
}) {
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [selectedRole, setSelectedRole] = useState<(typeof TEAM_ROLES)[number] | ''>('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setSelectedUserId(undefined);
    setSelectedRole('');
    setNotes('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Surgical Team Member</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Staff member</label>
            <StaffSearchCombobox
              value={selectedUserId}
              onSelect={(userId) => setSelectedUserId(userId)}
              placeholder="Select staff member..."
              searchPlaceholder="Search by name, email, or employee ID..."
              emptyMessage="No staff found."
              excludeUserIds={excludeUserIds}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Role</label>
            <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as (typeof TEAM_ROLES)[number])}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {TEAM_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {TEAM_ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional assignment notes or instructions"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (selectedUserId && selectedRole) {
                onSubmit({ staffUserId: selectedUserId, role: selectedRole, notes: notes.trim() });
                reset();
              }
            }}
            disabled={!selectedUserId || !selectedRole || submitting}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Assign Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function getTeamAssignmentErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response
  ) {
    const data = (error.response as { data?: unknown }).data;
    if (typeof data === 'string') {
      return data;
    }
    if (typeof data === 'object' && data !== null) {
      const values = Object.values(data as Record<string, unknown>)
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .filter((value): value is string => typeof value === 'string');
      if (values.length > 0) {
        return values[0] ?? fallback;
      }
    }
  }

  return fallback;
}
