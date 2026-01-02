/**
 * Drug Table Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Eye, ChevronLeft, ChevronRight, AlertTriangle, XCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Drug, DrugCategory, DrugForm, DrugSchedule } from '@/lib/types/pharmacy';
import { useDebounce } from '@/lib/hooks/use-debounce';

interface DrugTableProps {
  drugs: Drug[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onSearch: (query: string) => void;
}

// Human-readable labels for drug forms
const FORM_LABELS: Record<DrugForm, string> = {
  TABLET: 'Tablet',
  CAPSULE: 'Capsule',
  SYRUP: 'Syrup',
  INJECTION: 'Injection',
  CREAM: 'Cream',
  OINTMENT: 'Ointment',
  DROPS: 'Drops',
  INHALER: 'Inhaler',
  SUPPOSITORY: 'Suppository',
  POWDER: 'Powder',
  SUSPENSION: 'Suspension',
  SOLUTION: 'Solution',
  GEL: 'Gel',
  PATCH: 'Patch',
  SPRAY: 'Spray',
};

// Human-readable labels for drug categories
const CATEGORY_LABELS: Record<DrugCategory, string> = {
  ANALGESIC: 'Analgesic',
  ANTIBIOTIC: 'Antibiotic',
  ANTIMALARIAL: 'Antimalarial',
  ANTIRETROVIRAL: 'Antiretroviral',
  ANTIHYPERTENSIVE: 'Antihypertensive',
  ANTIDIABETIC: 'Antidiabetic',
  ANTIHISTAMINE: 'Antihistamine',
  VITAMIN: 'Vitamin',
  VACCINE: 'Vaccine',
  CONTRACEPTIVE: 'Contraceptive',
  PSYCHOTROPIC: 'Psychotropic',
  CONTROLLED: 'Controlled',
  OTHER: 'Other',
};

// Schedule badge colors
const SCHEDULE_COLORS: Record<DrugSchedule, string> = {
  OTC: 'bg-green-100 text-green-800',
  POM: 'bg-blue-100 text-blue-800',
  P: 'bg-yellow-100 text-yellow-800',
  CD: 'bg-red-100 text-red-800',
};

export function DrugTable({
  drugs,
  isLoading,
  error,
  page,
  totalPages,
  onPageChange,
  onSearch,
}: DrugTableProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const debouncedSearch = useDebounce(searchValue, 300);

  // Trigger search when debounced value changes
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    onSearch(value);
  };

  if (isLoading) {
    return (
      <div data-testid="drug-table-skeleton" className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {['Code', 'Drug Name', 'Form', 'Strength', 'Category', 'Stock', 'Schedule'].map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <XCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive">{error.message}</p>
      </div>
    );
  }

  if (drugs.length === 0) {
    return (
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search drugs..."
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No drugs found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search drugs..."
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Drug Name</TableHead>
              <TableHead>Form</TableHead>
              <TableHead>Strength</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drugs.map((drug) => {
              const isLowStock = drug.current_stock > 0 && drug.current_stock < drug.default_reorder_level;
              const isOutOfStock = drug.current_stock === 0;

              return (
                <TableRow key={drug.id}>
                  <TableCell className="font-mono text-sm">{drug.code}</TableCell>
                  <TableCell className="font-medium">{drug.generic_name}</TableCell>
                  <TableCell>{FORM_LABELS[drug.form]}</TableCell>
                  <TableCell>{drug.strength}</TableCell>
                  <TableCell>{CATEGORY_LABELS[drug.category]}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{drug.current_stock}</span>
                      {isOutOfStock && (
                        <span data-testid="out-of-stock-indicator" title="Out of Stock">
                          <XCircle className="h-4 w-4 text-destructive" />
                        </span>
                      )}
                      {isLowStock && (
                        <span data-testid="low-stock-indicator" title="Low Stock">
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={SCHEDULE_COLORS[drug.schedule]}>{drug.schedule}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/pharmacy/drugs/${drug.id}`)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
