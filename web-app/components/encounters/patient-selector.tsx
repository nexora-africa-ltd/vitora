'use client';

import { useState, useCallback } from 'react';
import { Search, User, X, Clock, ChevronDown, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePatientSearch, useRecentPatients } from '@/lib/hooks/use-encounter-form';
import { getApiErrorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import type { Patient } from '@/lib/types/patient';

interface PatientSelectorProps {
  value: number | null;
  selectedPatient: Patient | null;
  onChange: (patientId: number | null, patient: Patient | null) => void;
  disabled?: boolean;
  error?: string;
}

export function PatientSelector({
  value,
  selectedPatient,
  onChange,
  disabled = false,
  error,
}: PatientSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const {
    data: searchResults,
    isLoading: isSearching,
    error: searchError,
  } = usePatientSearch(searchQuery);
  const {
    data: recentPatients,
    isLoading: isLoadingRecent,
    error: recentError,
  } = useRecentPatients();

  // Use search results if searching, otherwise show recent patients
  const patients = searchQuery.length >= 2 ? searchResults : recentPatients;
  const isLoading = searchQuery.length >= 2 ? isSearching : isLoadingRecent;
  const activeQueryError = searchQuery.length >= 2 ? searchError : recentError;
  const queryErrorMessage = activeQueryError ? getApiErrorMessage(activeQueryError) : null;

  const handleSelect = useCallback(
    (patient: Patient) => {
      onChange(patient.id, patient);
      setSearchQuery('');
      setIsOpen(false);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange(null, null);
    setSearchQuery('');
  }, [onChange]);

  if (selectedPatient) {
    return (
      <Card className={cn('border-primary/50', error && 'border-destructive')}>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:h-10 sm:w-10">
                <User className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <p className="truncate text-sm font-semibold sm:text-base">
                    {selectedPatient.first_name} {selectedPatient.last_name}
                  </p>
                  <Badge variant="outline" className="shrink-0 text-[10px] sm:text-xs">
                    {selectedPatient.mrn}
                  </Badge>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground sm:mt-1 sm:gap-2 sm:text-sm">
                  <span>
                    {selectedPatient.gender === 'M'
                      ? 'Male'
                      : selectedPatient.gender === 'F'
                        ? 'Female'
                        : 'Other'}
                  </span>
                  <span>•</span>
                  <span>{selectedPatient.date_of_birth}</span>
                  {selectedPatient.phone_number && (
                    <>
                      <span className="hidden sm:inline">•</span>
                      <span className="hidden sm:inline">{selectedPatient.phone_number}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              disabled={disabled}
              className="h-7 w-7 shrink-0 sm:h-8 sm:w-8"
            >
              <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="sr-only">Clear selection</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative">
      <div className="relative z-50">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by name, MRN, or phone..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className={cn('pl-9 pr-10 text-sm', error && 'border-destructive')}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
          disabled={disabled}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
        </Button>
      </div>

      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}

      {/* Dropdown results */}
      {isOpen && (
        <Card className="absolute z-50 mt-1 w-full shadow-lg">
          <CardContent className="max-h-[320px] touch-pan-y overflow-y-auto overscroll-contain p-2">
            {/* Section header */}
            {searchQuery.length < 2 && (
              <div className="mb-2 flex items-center gap-2 px-2 py-1 text-xs text-accent-foreground">
                <Clock className="h-3 w-3" />
                <span>Recent Patients</span>
              </div>
            )}

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 p-2">
                    <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="mb-1 h-3.5 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : queryErrorMessage ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-destructive sm:text-sm">{queryErrorMessage}</p>
              </div>
            ) : patients && patients.length > 0 ? (
              <ul className="space-y-0.5">
                {patients.map((patient) => (
                  <li key={patient.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(patient)}
                      className="flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors hover:bg-accent"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {patient.first_name} {patient.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {patient.mrn} •{' '}
                          {patient.gender === 'M'
                            ? 'Male'
                            : patient.gender === 'F'
                              ? 'Female'
                              : 'Other'}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : searchQuery.length >= 2 ? (
              <p className="py-4 text-center text-xs text-muted-foreground sm:text-sm">
                No patients found for &quot;{searchQuery}&quot;
              </p>
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground sm:text-sm">
                No recent patients. Start typing to search.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Click outside to close */}
      {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
    </div>
  );
}

export default PatientSelector;
