/**
 * Services Config Page
 *
 * CRUD management for billing services and service categories.
 * Allows staff to manage the service catalog: add/edit services,
 * set prices, organize by category, and toggle active status.
 */
'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  BadgeCent,
  CheckCircle2,
  Edit,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  Trash2,
  XCircle,
  Filter,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { HelpPopover } from '@/components/shared/help-popover';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import {
  useServices,
  useServiceCategories,
  useCreateService,
  useUpdateService,
  useDeleteService,
  useCreateServiceCategory,
  useUpdateServiceCategory,
  useDeleteServiceCategory,
} from '@/lib/hooks/billing';
import type {
  Service,
  ServiceCategory,
  ServiceCreateData,
  ServiceCategoryCreateData,
} from '@/lib/types/billing';

// ---------------------------------------------------------------------------
// Service Form Dialog
// ---------------------------------------------------------------------------

function ServiceFormDialog({
  open,
  onOpenChange,
  service,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service;
  categories: ServiceCategory[];
}) {
  const isEdit = !!service;
  const createService = useCreateService();
  const updateService = useUpdateService();

  const [form, setForm] = useState({
    name: service?.name ?? '',
    code: service?.code ?? '',
    category: service?.category?.toString() ?? '',
    unit_price: service?.unit_price ?? '',
    description: service?.description ?? '',
    sha_code: service?.sha_code ?? '',
    icd10_code: service?.icd10_code ?? '',
    is_active: service?.is_active ?? true,
    is_taxable: service?.is_taxable ?? false,
    requires_quantity: service?.requires_quantity ?? false,
  });

  const handleSubmit = useCallback(async () => {
    if (!form.name || !form.code || !form.category || !form.unit_price) {
      toast.error('Please fill in all required fields');
      return;
    }

    const data: ServiceCreateData = {
      name: form.name,
      code: form.code,
      category: Number(form.category),
      unit_price: form.unit_price,
      description: form.description || undefined,
      sha_code: form.sha_code || undefined,
      icd10_code: form.icd10_code || undefined,
      is_active: form.is_active,
      is_taxable: form.is_taxable,
      requires_quantity: form.requires_quantity,
    };

    try {
      if (isEdit && service) {
        await updateService.mutateAsync({ id: service.id, data });
        toast.success('Service updated');
      } else {
        await createService.mutateAsync(data);
        toast.success('Service created');
      }
      onOpenChange(false);
    } catch {
      toast.error(isEdit ? 'Failed to update service' : 'Failed to create service');
    }
  }, [form, isEdit, service, createService, updateService, onOpenChange]);

  const isPending = createService.isPending || updateService.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{isEdit ? 'Edit Service' : 'New Service'}</DialogTitle>
            <HelpPopover content="Define a billable service with pricing. Services appear on invoices and can be linked to SHA codes for claims." />
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="svc-name">Name *</Label>
              <Input id="svc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Consultation" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-code">Code *</Label>
              <Input id="svc-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CONS-001" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="svc-category">Category *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger id="svc-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-price">Unit Price (KES) *</Label>
              <Input id="svc-price" type="number" step="0.01" min="0" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} placeholder="500.00" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="svc-desc">Description</Label>
            <Input id="svc-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="svc-sha">SHA Code</Label>
              <Input id="svc-sha" value={form.sha_code} onChange={(e) => setForm({ ...form, sha_code: e.target.value })} placeholder="SHA code for claims" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-icd10">ICD-10 Code</Label>
              <Input id="svc-icd10" value={form.icd10_code} onChange={(e) => setForm({ ...form, icd10_code: e.target.value })} placeholder="ICD-10 code" />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch id="svc-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label htmlFor="svc-active">Active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="svc-taxable" checked={form.is_taxable} onCheckedChange={(v) => setForm({ ...form, is_taxable: v })} />
              <Label htmlFor="svc-taxable">Taxable</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="svc-qty" checked={form.requires_quantity} onCheckedChange={(v) => setForm({ ...form, requires_quantity: v })} />
              <Label htmlFor="svc-qty">Requires Quantity</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Service'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Category Form Dialog
// ---------------------------------------------------------------------------

function CategoryFormDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: ServiceCategory;
}) {
  const isEdit = !!category;
  const createCategory = useCreateServiceCategory();
  const updateCategory = useUpdateServiceCategory();

  const [form, setForm] = useState({
    name: category?.name ?? '',
    code: category?.code ?? '',
    description: category?.description ?? '',
    display_order: category?.display_order?.toString() ?? '0',
    is_active: category?.is_active ?? true,
  });

  const handleSubmit = useCallback(async () => {
    if (!form.name || !form.code) {
      toast.error('Name and code are required');
      return;
    }

    const data: ServiceCategoryCreateData = {
      name: form.name,
      code: form.code,
      description: form.description || undefined,
      display_order: Number(form.display_order) || 0,
      is_active: form.is_active,
    };

    try {
      if (isEdit && category) {
        await updateCategory.mutateAsync({ id: category.id, data });
        toast.success('Category updated');
      } else {
        await createCategory.mutateAsync(data);
        toast.success('Category created');
      }
      onOpenChange(false);
    } catch {
      toast.error(isEdit ? 'Failed to update category' : 'Failed to create category');
    }
  }, [form, isEdit, category, createCategory, updateCategory, onOpenChange]);

  const isPending = createCategory.isPending || updateCategory.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{isEdit ? 'Edit Category' : 'New Category'}</DialogTitle>
            <HelpPopover content="Service categories group related services together (e.g., Consultation, Laboratory, Pharmacy)." />
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name *</Label>
              <Input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Consultation" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-code">Code *</Label>
              <Input id="cat-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CONS" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cat-desc">Description</Label>
            <Input id="cat-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cat-order">Display Order</Label>
              <Input id="cat-order" type="number" min="0" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch id="cat-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label htmlFor="cat-active">Active</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ServicesConfigPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Data
  const { data: servicesData, isLoading: servicesLoading, refetch: refetchServices } = useServices({
    search: search || undefined,
    category: categoryFilter !== 'all' ? Number(categoryFilter) : undefined,
    is_active: activeFilter !== 'all' ? activeFilter === 'true' : undefined,
    page,
    page_size: pageSize,
  });
  const { data: categoriesData, isLoading: categoriesLoading, refetch: refetchCategories } = useServiceCategories();

  const services = servicesData?.results ?? [];
  const categories = categoriesData?.results ?? [];

  const deleteService = useDeleteService();
  const deleteCategory = useDeleteServiceCategory();

  // Dialog state
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | undefined>();
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'service' | 'category'; id: number; name: string } | null>(null);

  // Stats
  const activeServices = services.filter((s) => s.is_active).length;
  const activeCategories = categories.filter((c) => c.is_active).length;
  const avgPrice = services.length > 0
    ? (services.reduce((sum, s) => sum + Number(s.unit_price || 0), 0) / services.length).toFixed(0)
    : '0';

  // Pagination
  const totalCount = servicesData?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const handleRefresh = async () => {
    await refresh();
    await Promise.all([refetchServices(), refetchCategories()]);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'service') {
        await deleteService.mutateAsync(deleteTarget.id);
        toast.success(`Service "${deleteTarget.name}" deleted`);
      } else {
        await deleteCategory.mutateAsync(deleteTarget.id);
        toast.success(`Category "${deleteTarget.name}" deleted`);
      }
    } catch {
      toast.error(`Failed to delete ${deleteTarget.type}`);
    }
    setDeleteTarget(null);
  };

  const openEditService = (service: Service) => {
    setEditingService(service);
    setServiceDialogOpen(true);
  };

  const openNewService = () => {
    setEditingService(undefined);
    setServiceDialogOpen(true);
  };

  const openEditCategory = (category: ServiceCategory) => {
    setEditingCategory(category);
    setCategoryDialogOpen(true);
  };

  const openNewCategory = () => {
    setEditingCategory(undefined);
    setCategoryDialogOpen(true);
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Service Catalog"
          helpContent="Manage billable services and service categories. Services define what can be added to invoices, including pricing and SHA codes."
        />

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            title="Total Services"
            value={servicesData?.count ?? 0}
            description="In catalog"
            icon={<BadgeCent className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Active Services"
            value={activeServices}
            description="Available for billing"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            valueClassName="text-2xl font-semibold text-emerald-600"
          />
          <AdminStatCard
            title="Categories"
            value={categories.length}
            description={`${activeCategories} active`}
            icon={<FolderOpen className="h-4 w-4 text-muted-foreground" />}
          />
          <AdminStatCard
            title="Avg Price"
            value={`KES ${avgPrice}`}
            description="Across all services"
            icon={<Tag className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        <Tabs defaultValue="services">
          <TabsList>
            <TabsTrigger value="services" className="gap-2">
              <BadgeCent className="h-4 w-4" />
              <span className="sm:hidden">Services</span>
              <span className="hidden sm:inline">Services</span>
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-2">
              <FolderOpen className="h-4 w-4" />
              <span className="sm:hidden">Categories</span>
              <span className="hidden sm:inline">Categories</span>
            </TabsTrigger>
          </TabsList>

          {/* --- Services Tab --- */}
          <TabsContent value="services" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
                  <div className="relative min-w-0">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      autoComplete="off"
                      className="pl-9"
                      name="svc-search"
                      placeholder="Search services…"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                    <SelectTrigger aria-label="Filter by category">
                      <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v); setPage(1); }}>
                    <SelectTrigger aria-label="Filter by status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={openNewService}>
                    <Plus className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">New Service</span>
                    <span className="sm:hidden">New</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BadgeCent className="h-5 w-5" />
                  Services
                  <Badge variant="secondary" className="ml-1">{servicesData?.count ?? 0}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {servicesLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <ResponsiveTable
                    data={services}
                    emptyMessage="No services found. Create one to get started."
                    keyExtractor={(s) => s.id}
                    defaultSortColumn="name"
                    defaultSortDirection="asc"
                    mobileCard={(s) => (
                      <Card className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium truncate">{s.name}</p>
                            <p className="font-mono text-sm text-muted-foreground">{s.code}</p>
                          </div>
                          <Badge variant={s.is_active ? 'default' : 'secondary'}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{s.category_name}</span>
                          <span className="font-medium">KES {Number(s.unit_price).toLocaleString()}</span>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditService(s)}>
                            <Edit className="mr-1 h-3 w-3" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget({ type: 'service', id: s.id, name: s.name })}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </Card>
                    )}
                    columns={[
                      {
                        key: 'name',
                        header: 'Service',
                        sortable: true,
                        cell: (s) => (
                          <div className="min-w-0">
                            <p className="font-medium truncate">{s.name}</p>
                            <p className="font-mono text-sm text-muted-foreground truncate">{s.code}</p>
                          </div>
                        ),
                      },
                      {
                        key: 'category_name',
                        header: 'Category',
                        sortable: true,
                        hideOnMobile: true,
                        cell: (s) => s.category_name ?? '—',
                      },
                      {
                        key: 'unit_price',
                        header: 'Price (KES)',
                        sortable: true,
                        sortType: 'number',
                        sortFn: (a, b) => Number(a.unit_price) - Number(b.unit_price),
                        cell: (s) => Number(s.unit_price).toLocaleString(),
                      },
                      {
                        key: 'sha_code',
                        header: 'SHA Code',
                        sortable: true,
                        hideOnMobile: true,
                        cell: (s) => s.sha_code || '—',
                      },
                      {
                        key: 'is_active',
                        header: 'Status',
                        sortable: true,
                        sortFn: (a, b) => Number(a.is_active) - Number(b.is_active),
                        cell: (s) => (
                          <Badge variant={s.is_active ? 'default' : 'secondary'}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        ),
                      },
                      {
                        key: 'actions',
                        header: '',
                        className: 'w-[100px] text-right',
                        cell: (s) => (
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEditService(s)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget({ type: 'service', id: s.id, name: s.name })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ),
                      },
                    ]}
                  />
                )}
              </CardContent>
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={!hasPrev}>
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!hasNext}>
                  Next
                </Button>
              </div>
            )}
          </TabsContent>

          {/* --- Categories Tab --- */}
          <TabsContent value="categories" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={openNewCategory}>
                <Plus className="mr-2 h-4 w-4" />
                New Category
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5" />
                  Service Categories
                  <Badge variant="secondary" className="ml-1">{categories.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {categoriesLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <ResponsiveTable
                    data={categories}
                    emptyMessage="No categories yet. Create one to organize your services."
                    keyExtractor={(c) => c.id}
                    defaultSortColumn="display_order"
                    defaultSortDirection="asc"
                    mobileCard={(c) => (
                      <Card className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium truncate">{c.name}</p>
                            <p className="font-mono text-sm text-muted-foreground">{c.code}</p>
                          </div>
                          <Badge variant={c.is_active ? 'default' : 'secondary'}>
                            {c.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        {c.description && (
                          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{c.description}</p>
                        )}
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditCategory(c)}>
                            <Edit className="mr-1 h-3 w-3" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget({ type: 'category', id: c.id, name: c.name })}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </Card>
                    )}
                    columns={[
                      {
                        key: 'name',
                        header: 'Category',
                        sortable: true,
                        cell: (c) => (
                          <div className="min-w-0">
                            <p className="font-medium truncate">{c.name}</p>
                            <p className="font-mono text-sm text-muted-foreground truncate">{c.code}</p>
                          </div>
                        ),
                      },
                      {
                        key: 'description',
                        header: 'Description',
                        sortable: true,
                        hideOnMobile: true,
                        cell: (c) => (
                          <span className="text-sm text-muted-foreground line-clamp-1">
                            {c.description || '—'}
                          </span>
                        ),
                      },
                      {
                        key: 'display_order',
                        header: 'Order',
                        sortable: true,
                        sortType: 'number',
                        cell: (c) => c.display_order,
                      },
                      {
                        key: 'is_active',
                        header: 'Status',
                        sortable: true,
                        sortFn: (a, b) => Number(a.is_active) - Number(b.is_active),
                        cell: (c) => (
                          <Badge variant={c.is_active ? 'default' : 'secondary'}>
                            {c.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        ),
                      },
                      {
                        key: 'actions',
                        header: '',
                        className: 'w-[100px] text-right',
                        cell: (c) => (
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEditCategory(c)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget({ type: 'category', id: c.id, name: c.name })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ),
                      },
                    ]}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Service Form Dialog */}
        {serviceDialogOpen && (
          <ServiceFormDialog
            open={serviceDialogOpen}
            onOpenChange={(open) => {
              setServiceDialogOpen(open);
              if (!open) setEditingService(undefined);
            }}
            service={editingService}
            categories={categories}
          />
        )}

        {/* Category Form Dialog */}
        {categoryDialogOpen && (
          <CategoryFormDialog
            open={categoryDialogOpen}
            onOpenChange={(open) => {
              setCategoryDialogOpen(open);
              if (!open) setEditingCategory(undefined);
            }}
            category={editingCategory}
          />
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deleteTarget?.type}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete &ldquo;{deleteTarget?.name}&rdquo;. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PullToRefresh>
  );
}
