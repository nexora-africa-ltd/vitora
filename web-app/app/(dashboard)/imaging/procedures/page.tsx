/**
 * Imaging Procedures Catalog page.
 * Full CRUD with seed defaults when catalog is empty.
 */
'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  CheckCircle2,
  XCircle,
  DollarSign,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Database,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import {
  useImagingProcedures,
  useCreateImagingProcedure,
  useUpdateImagingProcedure,
  useDeleteImagingProcedure,
  useSeedDefaultProcedures,
} from '@/lib/hooks/use-imaging';
import { ModalityBadge } from '@/components/imaging';
import { toast } from '@/lib/hooks';
import { usePermissions } from '@/lib/hooks/use-permissions';
import {
  ImagingModality,
  ImagingBodyRegion,
  ImagingProcedure,
  ImagingProcedureCreateData,
  MODALITY_LABELS,
  BODY_REGION_LABELS,
} from '@/lib/types/imaging';

type FormData = Partial<ImagingProcedureCreateData>;

export default function ImagingProceduresCatalogPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const { canPerformAction } = usePermissions();
  const canManageCatalog = canPerformAction('imaging.manage_catalog');
  const [search, setSearch] = useState('');
  const [modalityFilter, setModalityFilter] = useState<ImagingModality | ''>('');
  const [bodyRegionFilter, setBodyRegionFilter] = useState<ImagingBodyRegion | ''>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<ImagingProcedure | null>(null);
  const [formData, setFormData] = useState<FormData>({});

  const { data, isLoading } = useImagingProcedures({
    search: search || undefined,
    modality: modalityFilter || undefined,
    body_region: bodyRegionFilter || undefined,
    is_active: true,
    page_size: 50,
  });

  const createProcedure = useCreateImagingProcedure();
  const updateProcedure = useUpdateImagingProcedure();
  const deleteProcedure = useDeleteImagingProcedure();
  const seedDefaults = useSeedDefaultProcedures();

  const procedures = data?.results ?? [];
  const isEmpty = !isLoading && procedures.length === 0 && !search && !modalityFilter && !bodyRegionFilter;

  const openCreateDialog = () => {
    setEditingProcedure(null);
    setFormData({
      modality: 'XR',
      body_region: 'CHEST',
      cost: 0,
      sha_claimable: true,
      available_in_house: true,
      requires_contrast: false,
      requires_sedation: false,
      turnaround_hours: 24,
      is_active: true,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (proc: ImagingProcedure) => {
    setEditingProcedure(proc);
    setFormData({
      code: proc.code,
      name: proc.name,
      modality: proc.modality,
      body_region: proc.body_region,
      cost: Number(proc.cost),
      sha_claimable: proc.sha_claimable,
      available_in_house: proc.available_in_house,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.code || !formData.name) {
      toast({ title: 'Code and Name are required', variant: 'destructive' });
      return;
    }
    try {
      if (editingProcedure) {
        await updateProcedure.mutateAsync({
          code: editingProcedure.code,
          data: formData as Partial<ImagingProcedureCreateData>,
        });
        toast({ title: 'Procedure updated' });
      } else {
        await createProcedure.mutateAsync(formData as ImagingProcedureCreateData);
        toast({ title: 'Procedure created' });
      }
      setDialogOpen(false);
    } catch (error) {
      toast({
        title: editingProcedure ? 'Failed to update' : 'Failed to create',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (code: string) => {
    try {
      await deleteProcedure.mutateAsync(code);
      toast({ title: 'Procedure removed from catalog' });
    } catch (error) {
      toast({
        title: 'Failed to remove procedure',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleSeedDefaults = async () => {
    try {
      const result = await seedDefaults.mutateAsync();
      toast({ title: result.detail });
    } catch (error) {
      toast({
        title: 'Failed to seed procedures',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const isSaving = createProcedure.isPending || updateProcedure.isPending;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Procedures Catalog"
          helpContent="Manage your facility's imaging procedure catalog. Add, edit, or remove procedures. SHA-claimable procedures can be submitted for reimbursement."
          actions={
            canManageCatalog ? (
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Procedure
              </Button>
            ) : undefined
          }
        />

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search procedures..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={modalityFilter}
                onValueChange={(v) => setModalityFilter(v as ImagingModality | '')}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Modalities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Modalities</SelectItem>
                  {Object.entries(MODALITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={bodyRegionFilter}
                onValueChange={(v) => setBodyRegionFilter(v as ImagingBodyRegion | '')}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Body Regions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Body Regions</SelectItem>
                  {Object.entries(BODY_REGION_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Procedures Table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : isEmpty ? (
          <Card className="py-12">
            <CardContent className="text-center space-y-4">
              <Database className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
              <div>
                <p className="font-medium text-lg">No procedures in catalog</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {canManageCatalog
                    ? 'Seed common Kenya imaging procedures or add procedures manually.'
                    : 'No imaging procedures have been configured for this facility yet.'}
                </p>
              </div>
              {canManageCatalog && (
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <Button onClick={handleSeedDefaults} disabled={seedDefaults.isPending}>
                    {seedDefaults.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Database className="h-4 w-4 mr-2" />
                    )}
                    Seed Default Procedures
                  </Button>
                  <Button variant="outline" onClick={openCreateDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Manually
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <ResponsiveTable
              data={procedures}
              keyExtractor={(item) => item.id}
              columns={[
                {
                  key: 'code',
                  header: 'Code',
                  sortable: true,
                  cell: (item: ImagingProcedure) => (
                    <span className="font-mono text-sm">{item.code}</span>
                  ),
                },
                {
                  key: 'name',
                  header: 'Procedure',
                  sortable: true,
                  cell: (item: ImagingProcedure) => (
                    <span className="font-medium">{item.name}</span>
                  ),
                },
                {
                  key: 'modality',
                  header: 'Modality',
                  sortable: true,
                  cell: (item: ImagingProcedure) => (
                    <ModalityBadge modality={item.modality} />
                  ),
                },
                {
                  key: 'body_region',
                  header: 'Body Region',
                  sortable: true,
                  hideOnMobile: true,
                  cell: (item: ImagingProcedure) => (
                    <span className="text-sm">
                      {BODY_REGION_LABELS[item.body_region] || item.body_region}
                    </span>
                  ),
                },
                {
                  key: 'cost',
                  header: 'Cost (KES)',
                  sortable: true,
                  sortType: 'number' as const,
                  hideOnMobile: true,
                  cell: (item: ImagingProcedure) => (
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">{Number(item.cost).toLocaleString()}</span>
                    </div>
                  ),
                },
                {
                  key: 'sha_claimable',
                  header: 'SHA',
                  sortable: true,
                  cell: (item: ImagingProcedure) =>
                    item.sha_claimable ? (
                      <Badge variant="outline" className="text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700 shrink-0 w-fit">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Claimable
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground shrink-0 w-fit">
                        <XCircle className="h-3 w-3 mr-1" />
                        N/A
                      </Badge>
                    ),
                },
                {
                  key: 'actions',
                  header: '',
                  cell: (item: ImagingProcedure) => canManageCatalog ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(item)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(item.code)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null,
                },
              ]}
              mobileCard={(item: ImagingProcedure) => (
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.code}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <ModalityBadge modality={item.modality} size="sm" />
                        <span className="text-xs text-muted-foreground">
                          {BODY_REGION_LABELS[item.body_region]}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-sm font-medium">
                          KES {Number(item.cost).toLocaleString()}
                        </span>
                        {item.sha_claimable && (
                          <Badge variant="outline" className="text-emerald-700 border-emerald-300 dark:text-emerald-400 text-xs">
                            SHA
                          </Badge>
                        )}
                      </div>
                      {canManageCatalog && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(item)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(item.code)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </Card>
              )}
            />
            {procedures.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="font-medium">No procedures found</p>
                <p className="text-sm">Try adjusting your filters or search term.</p>
              </div>
            )}
          </>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProcedure ? 'Edit Procedure' : 'Add Procedure'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Code *</Label>
                  <Input
                    id="code"
                    placeholder="e.g. XR-CHEST-PA"
                    value={formData.code || ''}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    disabled={!!editingProcedure}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    placeholder="Chest X-Ray (PA View)"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Modality *</Label>
                  <Select
                    value={formData.modality || ''}
                    onValueChange={(v) => setFormData({ ...formData, modality: v as ImagingModality })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select modality" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MODALITY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Body Region *</Label>
                  <Select
                    value={formData.body_region || ''}
                    onValueChange={(v) => setFormData({ ...formData, body_region: v as ImagingBodyRegion })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select body region" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(BODY_REGION_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cost">Cost (KES) *</Label>
                  <Input
                    id="cost"
                    type="number"
                    min="0"
                    step="100"
                    value={formData.cost ?? ''}
                    onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="turnaround">Turnaround (hours)</Label>
                  <Input
                    id="turnaround"
                    type="number"
                    min="1"
                    value={formData.turnaround_hours ?? 24}
                    onChange={(e) => setFormData({ ...formData, turnaround_hours: parseInt(e.target.value) || 24 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sha_code">SHA Intervention Code</Label>
                  <Input
                    id="sha_code"
                    placeholder="SHA-XR-001"
                    value={formData.sha_intervention_code || ''}
                    onChange={(e) => setFormData({ ...formData, sha_intervention_code: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="special_preparation">Special Preparation</Label>
                  <Input
                    id="special_preparation"
                    placeholder="NPO for 4 hours"
                    value={formData.special_preparation || ''}
                    onChange={(e) => setFormData({ ...formData, special_preparation: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-6 pt-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="sha_claimable"
                    checked={formData.sha_claimable ?? true}
                    onCheckedChange={(v) => setFormData({ ...formData, sha_claimable: v })}
                  />
                  <Label htmlFor="sha_claimable" className="text-sm">SHA Claimable</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="available_in_house"
                    checked={formData.available_in_house ?? true}
                    onCheckedChange={(v) => setFormData({ ...formData, available_in_house: v })}
                  />
                  <Label htmlFor="available_in_house" className="text-sm">Available In-House</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="requires_contrast"
                    checked={formData.requires_contrast ?? false}
                    onCheckedChange={(v) => setFormData({ ...formData, requires_contrast: v })}
                  />
                  <Label htmlFor="requires_contrast" className="text-sm">Requires Contrast</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="requires_sedation"
                    checked={formData.requires_sedation ?? false}
                    onCheckedChange={(v) => setFormData({ ...formData, requires_sedation: v })}
                  />
                  <Label htmlFor="requires_sedation" className="text-sm">Requires Sedation</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingProcedure ? 'Save Changes' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
