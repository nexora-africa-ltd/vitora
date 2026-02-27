/**
 * Physiotherapy Treatment Types Catalog Page
 * Browse the catalog of physiotherapy treatment types with filtering
 */

'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  Activity,
  Filter,
  List,
  Grid,
  Stethoscope,
  AlertTriangle,
  Wrench,
} from 'lucide-react';
import { usePhysioTreatmentTypes } from '@/lib/hooks/use-physiotherapy';
import type { PhysiotherapyCategory, PhysiotherapyTreatmentType } from '@/lib/types/physiotherapy';
import { PHYSIO_CATEGORY_LABELS } from '@/components/allied-health/shared/treatment-type-select';

// Category filter options
const CATEGORY_OPTIONS: { value: PhysiotherapyCategory | ''; label: string }[] = [
  { value: '', label: 'All Categories' },
  { value: 'MUSCULOSKELETAL', label: 'Musculoskeletal' },
  { value: 'NEUROLOGICAL', label: 'Neurological' },
  { value: 'CARDIORESPIRATORY', label: 'Cardiorespiratory' },
  { value: 'PEDIATRIC', label: 'Pediatric' },
  { value: 'GERIATRIC', label: 'Geriatric' },
  { value: 'SPORTS', label: 'Sports' },
  { value: 'WOMENS_HEALTH', label: "Women's Health" },
  { value: 'POST_SURGICAL', label: 'Post-Surgical' },
  { value: 'PAIN_MANAGEMENT', label: 'Pain Management' },
  { value: 'ORTHOPEDIC', label: 'Orthopedic' },
  { value: 'VESTIBULAR', label: 'Vestibular' },
  { value: 'OTHER', label: 'Other' },
];

export default function TreatmentTypesPage() {
  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<PhysiotherapyCategory | ''>('');
  const [isActive, setIsActive] = useState<boolean | ''>('');
  const [shaClaimable, setShaClaimable] = useState<boolean | ''>('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selectedType, setSelectedType] = useState<PhysiotherapyTreatmentType | null>(null);

  // Build query params
  const params = {
    page,
    page_size: 20,
    ...(search && { search }),
    ...(category && { category }),
    ...(typeof isActive === 'boolean' && { is_active: isActive }),
    ...(typeof shaClaimable === 'boolean' && { sha_claimable: shaClaimable }),
  };

  const { data, isLoading, error } = usePhysioTreatmentTypes(params);

  const treatmentTypes = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  // Get category badge styling
  const getCategoryBadge = (cat: PhysiotherapyCategory) => {
    const config = PHYSIO_CATEGORY_LABELS[cat];
    return (
      <Badge className={config?.className || 'bg-gray-100 text-gray-800'}>
        {config?.label || cat}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treatment Types Catalog"
        helpContent="Browse the catalog of physiotherapy treatment types. View treatment details, recommended sessions, SHA codes, and pricing information."
      />

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('table')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Name or code..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={category}
                onValueChange={(v) => {
                  setCategory(v as PhysiotherapyCategory | '');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={typeof isActive === 'boolean' ? (isActive ? 'true' : 'false') : ''}
                onValueChange={(v) => {
                  setIsActive(v === '' ? '' : v === 'true');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">SHA Claimable</label>
              <Select
                value={typeof shaClaimable === 'boolean' ? (shaClaimable ? 'true' : 'false') : ''}
                onValueChange={(v) => {
                  setShaClaimable(v === '' ? '' : v === 'true');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Treatment Types Display */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : error ? (
            <div className="py-12 text-center text-destructive">
              Failed to load treatment types. Please try again.
            </div>
          ) : treatmentTypes.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title="No treatment types found"
              description="No treatment types match your filters. Try adjusting the search or category filter."
            />
          ) : viewMode === 'table' ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>SHA</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treatmentTypes.map((type) => (
                    <TableRow
                      key={type.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedType(type)}
                    >
                      <TableCell className="font-mono text-sm">{type.code}</TableCell>
                      <TableCell className="font-medium">{type.name}</TableCell>
                      <TableCell>{getCategoryBadge(type.category)}</TableCell>
                      <TableCell>{type.default_duration_minutes} min</TableCell>
                      <TableCell>{type.recommended_sessions}</TableCell>
                      <TableCell>
                        {type.sha_claimable ? (
                          <Badge variant="outline" className="text-green-600 border-green-300">
                            {type.sha_code || 'Yes'}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          KES {parseFloat(type.unit_price).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={type.is_active ? 'default' : 'secondary'}>
                          {type.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {treatmentTypes.map((type) => (
                <Card
                  key={type.id}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => setSelectedType(type)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base">{type.name}</CardTitle>
                        <span className="text-xs font-mono text-muted-foreground">
                          {type.code}
                        </span>
                      </div>
                      {getCategoryBadge(type.category)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {type.description || 'No description available'}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {type.default_duration_minutes} min
                      </div>
                      <div className="flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        {type.recommended_sessions} sessions
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="font-semibold">
                        KES {parseFloat(type.unit_price).toLocaleString()}
                      </span>
                      <div className="flex gap-1">
                        {type.sha_claimable && (
                          <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                            SHA
                          </Badge>
                        )}
                        <Badge variant={type.is_active ? 'default' : 'secondary'} className="text-xs">
                          {type.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <div className="text-sm text-muted-foreground">
                Showing {(page - 1) * 20 + 1} - {Math.min(page * 20, totalCount)} of {totalCount}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedType} onOpenChange={(open) => !open && setSelectedType(null)}>
        <DialogContent className="sm:max-w-[600px]">
          {selectedType && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedType.name}
                  {getCategoryBadge(selectedType.category)}
                </DialogTitle>
                <DialogDescription className="font-mono">{selectedType.code}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Description */}
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <p className="text-sm text-muted-foreground">
                    {selectedType.description || 'No description available'}
                  </p>
                </div>

                {/* Key details */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Duration
                    </div>
                    <div className="text-lg font-semibold">{selectedType.default_duration_minutes} min</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Activity className="h-4 w-4" />
                      Sessions
                    </div>
                    <div className="text-lg font-semibold">{selectedType.recommended_sessions}</div>
                    <div className="text-xs text-muted-foreground">{selectedType.recommended_frequency}</div>
                  </div>
                </div>

                {/* Pricing */}
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground">Unit Price</div>
                      <div className="text-xl font-bold">
                        KES {parseFloat(selectedType.unit_price).toLocaleString()}
                      </div>
                    </div>
                    {selectedType.sha_claimable && (
                      <Badge className="bg-green-100 text-green-800">
                        SHA Claimable: {selectedType.sha_code}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Equipment */}
                {selectedType.requires_equipment && selectedType.equipment_needed && (
                  <div>
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Equipment Needed
                    </label>
                    <p className="text-sm text-muted-foreground">{selectedType.equipment_needed}</p>
                  </div>
                )}

                {/* Contraindications */}
                {selectedType.contraindications && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                    <label className="text-sm font-medium flex items-center gap-2 text-orange-800">
                      <AlertTriangle className="h-4 w-4" />
                      Contraindications
                    </label>
                    <p className="text-sm text-orange-700 mt-1">{selectedType.contraindications}</p>
                  </div>
                )}

                {/* Precautions */}
                {selectedType.precautions && (
                  <div>
                    <label className="text-sm font-medium">Precautions</label>
                    <p className="text-sm text-muted-foreground">{selectedType.precautions}</p>
                  </div>
                )}

                {/* Status */}
                <div className="flex items-center justify-end">
                  <Badge variant={selectedType.is_active ? 'default' : 'secondary'}>
                    {selectedType.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
