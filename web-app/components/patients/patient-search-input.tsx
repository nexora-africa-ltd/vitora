'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { patientsApi } from '@/lib/api/patients';

interface PatientSearchInputProps {
  value: number | null;
  onChange: (patientId: number | null) => void;
  placeholder?: string;
  femaleOnly?: boolean;
}

/**
 * Reusable patient search input with autocomplete dropdown.
 * Searches by name or MRN and returns the selected patient ID.
 */
export function PatientSearchInput({
  value,
  onChange,
  placeholder = 'Search for patient...',
  femaleOnly = false,
}: PatientSearchInputProps) {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  // Fetch selected patient details for display
  const { data: selectedPatient } = useQuery({
    queryKey: ['patient-detail', value],
    queryFn: () => (value ? patientsApi.getPatient(value) : null),
    enabled: !!value,
  });

  // Search patients
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['patient-search', debouncedSearch, femaleOnly],
    queryFn: () =>
      patientsApi.getPatients({
        search: debouncedSearch,
        gender: femaleOnly ? 'F' : undefined,
        page_size: 10,
      }),
    enabled: debouncedSearch.length >= 2,
  });

  const handleSelect = useCallback(
    (patientId: number) => {
      onChange(patientId);
      setSearch('');
      setShowDropdown(false);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange(null);
    setSearch('');
  }, [onChange]);

  if (value && selectedPatient) {
    return (
      <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">
            {selectedPatient.first_name} {selectedPatient.last_name}
          </p>
          <p className="text-xs text-muted-foreground">{selectedPatient.mrn}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={handleClear} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => search.length >= 2 && setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder={placeholder}
          className="pl-8"
        />
      </div>

      {showDropdown && debouncedSearch.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground text-center">Searching...</div>
          ) : searchResults?.results?.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">No patients found</div>
          ) : (
            searchResults?.results?.map((patient) => (
              <button
                key={patient.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                onClick={() => handleSelect(patient.id)}
              >
                <p className="font-medium">
                  {patient.first_name} {patient.last_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {patient.mrn} • {patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : 'Other'}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
