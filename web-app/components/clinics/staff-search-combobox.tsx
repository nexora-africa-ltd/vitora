/**
 * Staff Search Combobox
 *
 * A searchable dropdown for selecting staff members by name, email, or employee ID.
 * Used for assigning staff to clinics instead of requiring manual user ID entry.
 */
'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, Search, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useStaffList } from '@/lib/hooks/use-rbac';
import { useDebounce } from '@/lib/hooks/use-debounce';
import type { StaffProfile } from '@/lib/types/rbac';

interface StaffSearchComboboxProps {
  /** Currently selected user ID */
  value: number | undefined;
  /** Callback when a staff member is selected */
  onSelect: (userId: number, staff: StaffProfile) => void;
  /** Placeholder text when no selection */
  placeholder?: string;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Message when no results found */
  emptyMessage?: string;
  /** Disable the combobox */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** User IDs to exclude from the list (e.g., already assigned staff) */
  excludeUserIds?: number[];
}

/**
 * StaffSearchCombobox - A searchable dropdown for selecting staff members.
 *
 * Features:
 * - Debounced search by name, email, or employee ID
 * - Shows staff details (name, email, role, department)
 * - Excludes already-assigned staff
 * - Loading states during search
 */
export function StaffSearchCombobox({
  value,
  onSelect,
  placeholder = 'Select staff member...',
  searchPlaceholder = 'Search by name, email, or employee ID...',
  emptyMessage = 'No staff members found.',
  disabled = false,
  className,
  excludeUserIds = [],
}: StaffSearchComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch staff list with search
  const { data: staffData, isLoading } = useStaffList({
    search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
    is_active: true, // Only show active staff
  });

  // Filter out excluded users
  const availableStaff = React.useMemo(() => {
    if (!staffData?.results) return [];
    return staffData.results.filter(
      (staff) => !excludeUserIds.includes(staff.user)
    );
  }, [staffData?.results, excludeUserIds]);

  // Find selected staff for display
  const selectedStaff = React.useMemo(() => {
    if (!value || !staffData?.results) return null;
    return staffData.results.find((s) => s.user === value);
  }, [value, staffData?.results]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', className)}
          disabled={disabled}
        >
          {selectedStaff ? (
            <div className="flex items-center gap-2 truncate">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{selectedStaff.full_name}</span>
              {selectedStaff.primary_role_name && (
                <Badge variant="secondary" className="ml-1 shrink-0 text-xs">
                  {selectedStaff.primary_role_name}
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] p-0"
        align="start"
        style={{ pointerEvents: 'auto' }}
        onWheel={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className="max-h-[200px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Searching...</span>
              </div>
            ) : searchQuery.length > 0 && searchQuery.length < 2 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search
              </div>
            ) : availableStaff.length === 0 ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : (
              <CommandGroup>
                {availableStaff.map((staff) => (
                  <CommandItem
                    key={staff.id}
                    value={staff.id.toString()}
                    onSelect={() => {
                      onSelect(staff.user, staff);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                    className="flex items-start gap-3 py-3"
                  >
                    <Check
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        value === staff.user ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{staff.full_name}</span>
                        {staff.employee_id && (
                          <Badge variant="outline" className="shrink-0 text-xs font-mono">
                            {staff.employee_id}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {staff.user_email}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {staff.primary_role_name && (
                          <Badge variant="secondary" className="text-xs">
                            {staff.primary_role_name}
                          </Badge>
                        )}
                        {staff.primary_department_name && (
                          <span className="text-xs text-muted-foreground">
                            {staff.primary_department_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
