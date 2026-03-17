'use client';

import { useState, useCallback } from 'react';
import { Search, User, X, Check, Clock, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePatientSearch, useRecentPatients } from '@/lib/hooks/use-encounter-form';
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

  const { data: searchResults, isLoading: isSearching } = usePatientSearch(searchQuery);
  const { data: recentPatients, isLoading: isLoadingRecent } = useRecentPatients();

  // Use search results if searching, otherwise show recent patients
  const patients = searchQuery.length >= 2 ? searchResults : recentPatients;
  const isLoading = searchQuery.length >= 2 ? isSearching : isLoadingRecent;

  const handleSelect = useCallback((patient: Patient) => {
    onChange(patient.id, patient);
    setSearchQuery('');
    setIsOpen(false);
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange(null, null);
    setSearchQuery('');
  }, [onChange]);

  if (selectedPatient) {
    return (
      <Card className={cn('border-primary/50', error && 'border-destructive')}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold">
                    {selectedPatient.first_name} {selectedPatient.last_name}
                  </p>
                  <Badge variant="outline">{selectedPatient.mrn}</Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                  <span>{selectedPatient.gender === 'M' ? 'Male' : selectedPatient.gender === 'F' ? 'Female' : 'Other'}</span>
                  <span>•</span>
                  <span>{selectedPatient.date_of_birth}</span>
                  {selectedPatient.phone_number && (
                    <>
                      <span>•</span>
                      <span>{selectedPatient.phone_number}</span>
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
              className="shrink-0"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Clear selection</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search patients by name, MRN, or phone number..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className={cn('pl-9 pr-10', error && 'border-destructive')}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
          disabled={disabled}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive mt-1">{error}</p>
      )}

      {/* Dropdown results */}
      {isOpen && (
        <Card className="absolute z-50 mt-1 w-full shadow-lg max-h-[320px] overflow-y-auto">
          <CardContent className="p-2">
            {/* Section header */}
            {searchQuery.length < 2 && (
              <div className="flex items-center gap-2 px-2 py-1 text-xs text-accent-foreground mb-2">
                <Clock className="h-3 w-3" />
                <span>Recent Patients</span>
              </div>
            )}

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : patients && patients.length > 0 ? (
                <ul className="space-y-1">
                  {patients.map((patient) => (
                    <li key={patient.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(patient)}
                        className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-accent transition-colors text-left"
                      >
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {patient.first_name} {patient.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {patient.mrn} • {patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : 'Other'}
                          </p>
                        </div>
                        <Check className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100" />
                      </button>
                    </li>
                  ))}
                </ul>
            ) : searchQuery.length >= 2 ? (
              <p className="text-center text-muted-foreground py-4">
                No patients found for &quot;{searchQuery}&quot;
              </p>
            ) : (
              <p className="text-center text-muted-foreground py-4">
                No recent patients. Start typing to search.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

export default PatientSelector;
