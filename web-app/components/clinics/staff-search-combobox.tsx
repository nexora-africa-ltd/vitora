/**
 * Staff Search Combobox
 *
 * A searchable dropdown for selecting staff members by name, email, or employee ID.
 * Used for assigning staff to clinics instead of requiring manual user ID entry.
 */
'use client';

import * as React from 'react';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { useStaffLookup } from '@/lib/hooks/use-rbac';
import { useDebounce } from '@/lib/hooks/use-debounce';
import type { StaffLookup } from '@/lib/types/rbac';

interface StaffSearchComboboxProps {
  /** Currently selected user ID */
  value: number | undefined;
  /** Callback when a staff member is selected */
  onSelect: (userId: number, staff: StaffLookup) => void;
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
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedSnapshot, setSelectedSnapshot] = React.useState<StaffLookup | null>(null);
  const debouncedSearch = useDebounce(searchQuery.trim(), 300);

  // Search the compact clinical directory, not the permission-restricted HR endpoint.
  const {
    data: staffData,
    isLoading,
    isError,
    refetch,
  } = useStaffLookup({
    search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
    page_size: 50,
  });

  // Filter out excluded users
  const availableStaff = React.useMemo(() => {
    if (!staffData?.results) return [];
    return staffData.results.filter((staff) => !excludeUserIds.includes(staff.user));
  }, [staffData?.results, excludeUserIds]);

  // Find selected staff for display
  const selectedStaff = React.useMemo(() => {
    if (!value) return null;
    const fromResults = staffData?.results?.find((s) => s.user === value) ?? null;
    if (fromResults) return fromResults;
    if (selectedSnapshot && selectedSnapshot.user === value) return selectedSnapshot;
    return null;
  }, [value, staffData?.results, selectedSnapshot]);

  const options = React.useMemo<SearchableSelectOption[]>(
    () =>
      availableStaff.map((staff) => ({
        value: String(staff.user),
        label: staff.full_name || staff.user_email,
        sublabel: [
          staff.user_email,
          staff.employee_id,
          staff.primary_role_name,
          staff.primary_department_name,
        ]
          .filter(Boolean)
          .join(' • '),
      })),
    [availableStaff]
  );

  return (
    <div className="space-y-2">
      <SearchableSelect
        options={searchQuery.length === 1 || isError ? [] : options}
        value={value ? String(value) : undefined}
        onValueChange={(nextValue) => {
          const userId = Number(nextValue);
          const staff = availableStaff.find((entry) => entry.user === userId);
          if (!staff) return;
          setSelectedSnapshot(staff);
          setSearchQuery('');
          onSelect(userId, staff);
        }}
        placeholder={selectedStaff?.full_name || placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={
          searchQuery.length === 1 ? 'Type at least 2 characters to search' : emptyMessage
        }
        disabled={disabled || isError}
        isLoading={isLoading}
        className={className}
        onSearchChange={setSearchQuery}
        filterOptions={false}
        footer={
          staffData && staffData.count > staffData.results.length ? (
            <p className="text-xs text-muted-foreground">
              More staff available. Search by name, email, or employee ID.
            </p>
          ) : undefined
        }
      />
      {isError && (
        <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <span>Unable to load staff. Check your connection or access permissions.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            aria-label="Retry staff lookup"
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
