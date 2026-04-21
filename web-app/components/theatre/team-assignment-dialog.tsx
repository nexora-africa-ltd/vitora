'use client';

import {
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  Search,
} from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TEAM_ROLES } from '@/lib/schemas/theatre.schema';
import type { StaffProfile } from '@/lib/types/rbac';
import { cn } from '@/lib/utils';

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
  staffPickerOpen,
  onStaffPickerOpenChange,
  staffSearch,
  onStaffSearchChange,
  staffResults,
  staffResultsLoading,
  selectedStaffId,
  onSelectedStaffIdChange,
  selectedRole,
  onSelectedRoleChange,
  teamNotes,
  onTeamNotesChange,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffPickerOpen: boolean;
  onStaffPickerOpenChange: (open: boolean) => void;
  staffSearch: string;
  onStaffSearchChange: (value: string) => void;
  staffResults: StaffProfile[];
  staffResultsLoading: boolean;
  selectedStaffId: number | null;
  onSelectedStaffIdChange: (value: number) => void;
  selectedRole: (typeof TEAM_ROLES)[number] | '';
  onSelectedRoleChange: (value: (typeof TEAM_ROLES)[number]) => void;
  teamNotes: string;
  onTeamNotesChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Surgical Team Member</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Staff member</label>
            <Popover open={staffPickerOpen} onOpenChange={onStaffPickerOpenChange}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={staffPickerOpen}
                  className="w-full justify-between"
                >
                  <span className="truncate">
                    {selectedStaffId ? getSelectedStaffLabel(staffResults, selectedStaffId) : 'Select staff member'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
                <Command shouldFilter={false}>
                  <div className="flex items-center border-b px-3" role="presentation">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <CommandInput
                      placeholder="Search staff..."
                      value={staffSearch}
                      onValueChange={onStaffSearchChange}
                      className="h-10"
                    />
                  </div>
                  <CommandList>
                    {staffResultsLoading ? (
                      <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading staff...
                      </div>
                    ) : null}
                    <CommandEmpty>No staff found.</CommandEmpty>
                    <CommandGroup>
                      {staffResults.map((staff) => (
                        <CommandItem
                          key={staff.id}
                          value={`${staff.full_name} ${staff.employee_id} ${staff.primary_role_name ?? ''}`}
                          onSelect={() => {
                            onSelectedStaffIdChange(staff.id);
                            onStaffPickerOpenChange(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedStaffId === staff.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <div className="min-w-0">
                            <p className="truncate">{staff.full_name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {staff.employee_id}
                              {staff.primary_role_name ? ` • ${staff.primary_role_name}` : ''}
                              {staff.primary_department_name ? ` • ${staff.primary_department_name}` : ''}
                            </p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Role</label>
            <Select value={selectedRole} onValueChange={(value) => onSelectedRoleChange(value as (typeof TEAM_ROLES)[number])}>
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
              value={teamNotes}
              onChange={(event) => onTeamNotesChange(event.target.value)}
              placeholder="Optional assignment notes or instructions"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={!selectedStaffId || !selectedRole || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Assign Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getSelectedStaffLabel(staffOptions: StaffProfile[], selectedStaffId: number): string {
  const staff = staffOptions.find((entry) => entry.id === selectedStaffId);
  if (!staff) {
    return 'Selected staff member';
  }
  return `${staff.full_name}${staff.primary_role_name ? ` • ${staff.primary_role_name}` : ''}`;
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
