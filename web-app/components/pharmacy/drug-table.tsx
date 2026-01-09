/**
 * Drug Table Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Eye, ChevronLeft, ChevronRight, AlertTriangle, XCircle, Shield, Star } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Drug, DrugCategory, DrugForm, DrugSchedule } from '@/lib/types/pharmacy';
import { useDebounce } from '@/lib/hooks/use-debounce';

interface DrugTableProps {
  drugs: Drug[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  totalCount?: number;
  onPageChange: (page: number) => void;
  onSearch: (query: string) => void;
  onFiltersChange?: (filters: {
    category?: DrugCategory;
    form?: DrugForm;
    schedule?: DrugSchedule;
    is_essential?: boolean;
    is_active?: boolean;
  }) => void;
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
  totalCount,
  onPageChange,
  onSearch,
  onFiltersChange,
}: DrugTableProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<DrugCategory | ''>('');
  const [formFilter, setFormFilter] = useState<DrugForm | ''>('');
  const [scheduleFilter, setScheduleFilter] = useState<DrugSchedule | ''>('');
  const [essentialOnly, setEssentialOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const debouncedSearch = useDebounce(searchValue, 300);

  // Trigger search when debounced value changes
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    onSearch(value);
  };

  // Handle filter changes
  const handleFiltersChange = () => {
    if (onFiltersChange) {
      onFiltersChange({
        category: categoryFilter || undefined,
        form: formFilter || undefined,
        schedule: scheduleFilter || undefined,
        is_essential: essentialOnly || undefined,
        is_active: activeOnly || undefined,
      });
    }
  };

  // Trigger filters change when any filter changes
  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value as DrugCategory | '');
    setTimeout(() => {
      if (onFiltersChange) {
        onFiltersChange({
          category: (value as DrugCategory) || undefined,
          form: formFilter || undefined,
          schedule: scheduleFilter || undefined,
          is_essential: essentialOnly || undefined,
          is_active: activeOnly || undefined,
        });
      }
    }, 0);
  };

  const handleFormChange = (value: string) => {
    setFormFilter(value as DrugForm | '');
    setTimeout(() => {
      if (onFiltersChange) {
        onFiltersChange({
          category: categoryFilter || undefined,
          form: (value as DrugForm) || undefined,
          schedule: scheduleFilter || undefined,
          is_essential: essentialOnly || undefined,
          is_active: activeOnly || undefined,
        });
      }
    }, 0);
  };

  const handleScheduleChange = (value: string) => {
    setScheduleFilter(value as DrugSchedule | '');
    setTimeout(() => {
      if (onFiltersChange) {
        onFiltersChange({
          category: categoryFilter || undefined,
          form: formFilter || undefined,
          schedule: (value as DrugSchedule) || undefined,
          is_essential: essentialOnly || undefined,
          is_active: activeOnly || undefined,
        });
      }
    }, 0);
  };

  const handleEssentialChange = (checked: boolean) => {
    setEssentialOnly(checked);
    setTimeout(() => {
      if (onFiltersChange) {
        onFiltersChange({
          category: categoryFilter || undefined,
          form: formFilter || undefined,
          schedule: scheduleFilter || undefined,
          is_essential: checked || undefined,
          is_active: activeOnly || undefined,
        });
      }
    }, 0);
  };

  const handleActiveChange = (checked: boolean) => {
    setActiveOnly(checked);
    setTimeout(() => {
      if (onFiltersChange) {
        onFiltersChange({
          category: categoryFilter || undefined,
          form: formFilter || undefined,
          schedule: scheduleFilter || undefined,
          is_essential: essentialOnly || undefined,
          is_active: checked || undefined,
        });
      }
    }, 0);
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
        {/* Search and Filters */}
        <div className="flex flex-col gap-4">
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
          
          {onFiltersChange && (
            <div className="flex flex-wrap gap-4">
              <div className="w-48">
                <Select value={categoryFilter} onValueChange={handleCategoryChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Categories</SelectItem>
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-48">
                <Select value={formFilter} onValueChange={handleFormChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Form" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Forms</SelectItem>
                    {Object.entries(FORM_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-48">
                <Select value={scheduleFilter} onValueChange={handleScheduleChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Schedule" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Schedules</SelectItem>
                    <SelectItem value="OTC">OTC - Over The Counter</SelectItem>
                    <SelectItem value="POM">POM - Prescription Only</SelectItem>
                    <SelectItem value="P">P - Pharmacy Medicine</SelectItem>
                    <SelectItem value="CD">CD - Controlled Drug</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="essential-filter" 
                  checked={essentialOnly}
                  onCheckedChange={handleEssentialChange}
                />
                <Label htmlFor="essential-filter" className="text-sm cursor-pointer">
                  Essential Medicines Only
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="active-filter" 
                  checked={activeOnly}
                  onCheckedChange={handleActiveChange}
                />
                <Label htmlFor="active-filter" className="text-sm cursor-pointer">
                  Active Only
                </Label>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No drugs found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col gap-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search drugs by name, brand, or code..."
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        
        {onFiltersChange && (
          <div className="flex flex-wrap gap-4">
            <div className="w-48">
              <Select value={categoryFilter} onValueChange={handleCategoryChange}>
                <SelectTrigger data-testid="category-filter">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Categories</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="w-48">
              <Select value={formFilter} onValueChange={handleFormChange}>
                <SelectTrigger data-testid="form-filter">
                  <SelectValue placeholder="Form" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Forms</SelectItem>
                  {Object.entries(FORM_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="w-48">
              <Select value={scheduleFilter} onValueChange={handleScheduleChange}>
                <SelectTrigger data-testid="schedule-filter">
                  <SelectValue placeholder="Schedule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Schedules</SelectItem>
                  <SelectItem value="OTC">OTC - Over The Counter</SelectItem>
                  <SelectItem value="POM">POM - Prescription Only</SelectItem>
                  <SelectItem value="P">P - Pharmacy Medicine</SelectItem>
                  <SelectItem value="CD">CD - Controlled Drug</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="essential-filter"
                data-testid="essential-filter"
                checked={essentialOnly}
                onCheckedChange={handleEssentialChange}
              />
              <Label htmlFor="essential-filter" className="text-sm cursor-pointer">
                Essential Medicines Only (KEML)
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="active-filter"
                data-testid="active-filter"
                checked={activeOnly}
                onCheckedChange={handleActiveChange}
              />
              <Label htmlFor="active-filter" className="text-sm cursor-pointer">
                Active Only
              </Label>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border" data-testid="drug-table">
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
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="font-medium">{drug.generic_name}</div>
                      {drug.brand_names && drug.brand_names.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {drug.brand_names.join(', ')}
                        </div>
                      )}
                      <div className="flex gap-1 mt-1">
                        {drug.is_essential && (
                          <Badge 
                            variant="outline" 
                            className="bg-blue-50 text-blue-700 border-blue-200 text-xs"
                            title="Kenya Essential Medicines List"
                          >
                            <Star className="h-3 w-3 mr-1" />
                            Essential
                          </Badge>
                        )}
                        {drug.is_controlled && (
                          <Badge 
                            variant="outline" 
                            className="bg-red-50 text-red-700 border-red-200 text-xs"
                            title="Controlled Drug"
                          >
                            <Shield className="h-3 w-3 mr-1" />
                            Controlled
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{FORM_LABELS[drug.form]}</TableCell>
                  <TableCell>{drug.strength}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{CATEGORY_LABELS[drug.category]}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={isOutOfStock ? 'text-destructive font-medium' : ''}>
                        {drug.current_stock}
                      </span>
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
                    {isOutOfStock && (
                      <div className="text-xs text-destructive mt-1">Out of Stock</div>
                    )}
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
      <div className="flex items-center justify-between" data-testid="pagination">
        <p className="text-sm text-muted-foreground">
          {totalCount ? (
            <>Showing {drugs.length} of {totalCount} drugs</>
          ) : (
            <>Page {page} of {totalPages}</>
          )}
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
    </div>
  );
}
