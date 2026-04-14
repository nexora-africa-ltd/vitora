/**
 * Drug Table Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Responsive table using ResponsiveTable component with mobile card layout.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Eye, ChevronLeft, ChevronRight, AlertTriangle, XCircle, Shield, Star, MoreVertical, Edit, Trash2, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Drug, DrugCategory, DrugForm, DrugSchedule } from '@/lib/types/pharmacy';
import { pharmacyApi } from '@/lib/api/pharmacy';

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

// Schedule badge colors using semantic classes
const SCHEDULE_COLORS: Record<DrugSchedule, string> = {
  OTC: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  POM: 'bg-primary/15 text-primary',
  P: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  CD: 'bg-destructive/15 text-destructive',
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [drugToDelete, setDrugToDelete] = useState<Drug | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    onSearch(value);
  };

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

  const handleEssentialChange = (checked: boolean | 'indeterminate') => {
    const isChecked = checked === true;
    setEssentialOnly(isChecked);
    setTimeout(() => {
      if (onFiltersChange) {
        onFiltersChange({
          category: categoryFilter || undefined,
          form: formFilter || undefined,
          schedule: scheduleFilter || undefined,
          is_essential: isChecked || undefined,
          is_active: activeOnly || undefined,
        });
      }
    }, 0);
  };

  const handleActiveChange = (checked: boolean | 'indeterminate') => {
    const isChecked = checked === true;
    setActiveOnly(isChecked);
    setTimeout(() => {
      if (onFiltersChange) {
        onFiltersChange({
          category: categoryFilter || undefined,
          form: formFilter || undefined,
          schedule: scheduleFilter || undefined,
          is_essential: essentialOnly || undefined,
          is_active: isChecked || undefined,
        });
      }
    }, 0);
  };

  const handleDeleteClick = (drug: Drug) => {
    setDrugToDelete(drug);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!drugToDelete) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await pharmacyApi.deleteDrug(drugToDelete.id);
      setDeleteDialogOpen(false);
      setDrugToDelete(null);
      window.location.reload();
    } catch (err: unknown) {
      console.error('Error deleting drug:', err);
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      setDeleteError(
        error.response?.data?.detail ||
        error.message ||
        'Cannot delete drug with existing stock'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div data-testid="drug-table-skeleton" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Skeleton className="h-10 w-full sm:w-64" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
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

  // Mobile card renderer
  const renderMobileCard = (drug: Drug) => {
    const isLowStock = drug.current_stock > 0 && drug.current_stock < drug.default_reorder_level;
    const isOutOfStock = drug.current_stock === 0;

    return (
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="font-medium text-left hover:underline cursor-pointer truncate"
                onClick={() => router.push(`/pharmacy/drugs/${drug.id}`)}
              >
                {drug.generic_name}
              </button>
              <Badge className={SCHEDULE_COLORS[drug.schedule]}>{drug.schedule}</Badge>
            </div>
            {drug.brand_names && drug.brand_names.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {drug.brand_names.join(', ')}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              {FORM_LABELS[drug.form]} • {drug.strength}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/pharmacy/drugs/${drug.id}`)}>
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/pharmacy/drugs/${drug.id}/edit`)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDeleteClick(drug)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center justify-between gap-4 pt-2 border-t">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Stock:</span>
            <span className={`text-sm font-medium ${isOutOfStock ? 'text-destructive' : isLowStock ? 'text-amber-600' : ''}`}>
              {drug.current_stock}
            </span>
            {isOutOfStock && <XCircle className="h-3.5 w-3.5 text-destructive" />}
            {isLowStock && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          </div>
          <div className="flex gap-1 flex-wrap justify-end">
            {drug.is_essential && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                <Star className="h-2.5 w-2.5 mr-0.5" />
                Essential
              </Badge>
            )}
            {drug.is_controlled && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                <Shield className="h-2.5 w-2.5 mr-0.5" />
                Controlled
              </Badge>
            )}
          </div>
        </div>
      </Card>
    );
  };

  const columns = [
    {
      key: 'code',
      header: 'Code',
      cell: (drug: Drug) => <span className="font-mono text-sm">{drug.code}</span>,
      hideOnMobile: true,
    },
    {
      key: 'generic_name',
      header: 'Drug Name',
      cell: (drug: Drug) => {
        return (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="font-medium text-left hover:underline cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/pharmacy/drugs/${drug.id}`);
              }}
            >
              {drug.generic_name}
            </button>
            {drug.brand_names && drug.brand_names.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {drug.brand_names.join(', ')}
              </div>
            )}
            <div className="flex gap-1 mt-1">
              {drug.is_essential && (
                <Badge
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/20 text-xs"
                  title="Kenya Essential Medicines List"
                >
                  <Star className="h-3 w-3 mr-1" />
                  Essential
                </Badge>
              )}
              {drug.is_controlled && (
                <Badge
                  variant="outline"
                  className="bg-destructive/10 text-destructive border-destructive/20 text-xs"
                  title="Controlled Drug"
                >
                  <Shield className="h-3 w-3 mr-1" />
                  Controlled
                </Badge>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'form',
      header: 'Form',
      cell: (drug: Drug) => FORM_LABELS[drug.form],
      hideOnMobile: true,
    },
    {
      key: 'strength',
      header: 'Strength',
      hideOnMobile: true,
    },
    {
      key: 'category',
      header: 'Category',
      cell: (drug: Drug) => {
        const categories = (drug.categories && Array.isArray(drug.categories) && drug.categories.length > 0)
          ? drug.categories
          : (drug.category ? [drug.category] : []);
        return (
          <div className="flex flex-wrap gap-1">
            {categories.length > 0 ? (
              categories.slice(0, 2).map((cat) => (
                <Badge key={cat} variant="secondary" className="text-xs">
                  {CATEGORY_LABELS[cat] ?? cat}
                </Badge>
              ))
            ) : (
              <Badge variant="outline" className="text-xs">-</Badge>
            )}
            {categories.length > 2 && (
              <Badge variant="outline" className="text-xs">+{categories.length - 2}</Badge>
            )}
          </div>
        );
      },
      hideOnMobile: true,
    },
    {
      key: 'current_stock',
      header: 'Stock',
      cell: (drug: Drug) => {
        const isLowStock = drug.current_stock > 0 && drug.current_stock < drug.default_reorder_level;
        const isOutOfStock = drug.current_stock === 0;
        return (
          <div>
            <div className="flex items-center gap-2">
              <span className={isOutOfStock ? 'text-destructive font-medium' : ''}>
                {drug.current_stock}
              </span>
              {isOutOfStock && <XCircle className="h-4 w-4 text-destructive" />}
              {isLowStock && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
            </div>
            {isOutOfStock && <div className="text-xs text-destructive mt-1">OOS</div>}
          </div>
        );
      },
    },
    {
      key: 'schedule',
      header: 'Schedule',
      cell: (drug: Drug) => <Badge className={SCHEDULE_COLORS[drug.schedule]}>{drug.schedule}</Badge>,
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (drug: Drug) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/pharmacy/drugs/${drug.id}/edit`);
            }}
            data-testid="edit-drug"
          >
            <Edit className="h-4 w-4" />
            <span className="sr-only">Modify drug</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteClick(drug);
            }}
            data-testid="delete-drug"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Remove drug</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="More actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/pharmacy/drugs/${drug.id}`)}>
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      className: 'w-[100px]',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm" role="search" aria-label="Search drugs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search drugs..."
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
              data-testid="drug-search"
              aria-label="Search drugs"
            />
          </div>
          {onFiltersChange && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="w-full sm:w-auto"
            >
              <Filter className="h-4 w-4 mr-2" />
              {showFilters ? 'Hide Filters' : 'Filters'}
            </Button>
          )}
        </div>

        {onFiltersChange && showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 border rounded-lg bg-muted/30">
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

            <div className="flex items-center space-x-2">
              <Checkbox
                id="essential-filter"
                data-testid="essential-filter"
                checked={essentialOnly}
                onCheckedChange={handleEssentialChange}
              />
              <Label htmlFor="essential-filter" className="text-sm cursor-pointer">
                Essential Only (KEML)
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
      <div data-testid="drug-table">
        <ResponsiveTable
          data={drugs}
          columns={columns}
          keyExtractor={(drug) => drug.id}
          onRowClick={(drug) => router.push(`/pharmacy/drugs/${drug.id}`)}
          mobileCard={renderMobileCard}
          emptyMessage="No drugs found"
        />
      </div>

      {/* Pagination */}
      {totalPages > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="pagination">
          <p className="text-sm text-muted-foreground text-center sm:text-left">
            {totalCount ? (
              <>Showing {drugs.length} of {totalCount} drugs</>
            ) : (
              <>Page {page} of {totalPages}</>
            )}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className="flex-1 sm:flex-none"
            >
              <ChevronLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
              className="flex-1 sm:flex-none"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4 sm:ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{drugToDelete?.generic_name}</strong> from the catalog.
              This action cannot be undone.
              {drugToDelete && drugToDelete.current_stock > 0 && (
                <span className="block mt-2 text-destructive font-semibold">
                  Warning: This drug has {drugToDelete.current_stock} units in stock and cannot be deleted.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
              {deleteError}
            </div>
          )}
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false);
              setDrugToDelete(null);
              setDeleteError(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting || (drugToDelete?.current_stock ?? 0) > 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
