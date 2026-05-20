'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Pencil, Pill, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { inventoryApi } from '@/lib/api/inventory';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useToast } from '@/lib/hooks/use-toast';
import { getApiErrorMessage } from '@/lib/api/client';
import type { WardStock } from '@/lib/types/inventory';

export default function WardStockPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const { canPerformAction } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canAdd = canPerformAction('inventory.add_ward_stock');
  const canManage = canPerformAction('inventory.manage_ward_stock');

  const [page, setPage] = useState(1);
  const [storeFilter, setStoreFilter] = useState<string>('all');

  // Dialog states
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<WardStock | null>(null);
  const [deleteItem, setDeleteItem] = useState<WardStock | null>(null);

  // Form states
  const [formDrug, setFormDrug] = useState('');
  const [formStore, setFormStore] = useState('');
  const [formQty, setFormQty] = useState('0');
  const [formPar, setFormPar] = useState('10');
  const [formMax, setFormMax] = useState('50');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-ward-stock', page, storeFilter],
    queryFn: () =>
      inventoryApi.listWardStock({
        page,
        page_size: 20,
        store_location: storeFilter !== 'all' ? Number(storeFilter) : undefined,
      }),
  });

  const { data: storesData } = useQuery({
    queryKey: ['inventory-store-locations-all'],
    queryFn: () => inventoryApi.listStoreLocations({ page_size: 200, is_active: true }),
  });

  const { data: drugsData } = useQuery({
    queryKey: ['pharmacy-drugs-all'],
    queryFn: () => pharmacyApi.listDrugs({ page_size: 500 }),
  });

  const items = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  const belowParCount = items.filter((i) => i.is_below_par).length;
  const aboveMaxCount = items.filter((i) => i.is_above_max).length;

  const createMutation = useMutation({
    mutationFn: (payload: { store_location: number; drug: number; quantity_available: number; par_level: number; max_level: number }) =>
      inventoryApi.createWardStock(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-ward-stock'] });
      toast({ title: 'Ward stock created', variant: 'success' });
      closeAddDialog();
    },
    onError: (err) => {
      toast({ title: 'Failed to create', description: getApiErrorMessage(err), variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: payload }: { id: number; data: { par_level: number; max_level: number } }) =>
      inventoryApi.updateWardStock(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-ward-stock'] });
      toast({ title: 'Ward stock updated', variant: 'success' });
      setEditItem(null);
    },
    onError: (err) => {
      toast({ title: 'Failed to update', description: getApiErrorMessage(err), variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryApi.deleteWardStock(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-ward-stock'] });
      toast({ title: 'Ward stock removed', variant: 'success' });
      setDeleteItem(null);
    },
    onError: (err) => {
      toast({ title: 'Failed to delete', description: getApiErrorMessage(err), variant: 'destructive' });
    },
  });

  function closeAddDialog() {
    setAddOpen(false);
    setFormDrug('');
    setFormStore('');
    setFormQty('0');
    setFormPar('10');
    setFormMax('50');
  }

  function openEditDialog(item: WardStock) {
    setEditItem(item);
    setFormPar(String(item.par_level));
    setFormMax(String(item.max_level));
  }

  function handleCreate() {
    if (!formDrug || !formStore) return;
    createMutation.mutate({
      store_location: Number(formStore),
      drug: Number(formDrug),
      quantity_available: Number(formQty) || 0,
      par_level: Number(formPar) || 10,
      max_level: Number(formMax) || 50,
    });
  }

  function handleUpdate() {
    if (!editItem) return;
    updateMutation.mutate({
      id: editItem.id,
      data: { par_level: Number(formPar), max_level: Number(formMax) },
    });
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Ward Stock"
          helpContent="Monitor stock levels at ward stores. Items below par level need replenishment. Use consume, replenish, and return actions from the detail page."
          actions={
            canAdd ? (
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Add Ward Stock</span>
                <span className="sm:hidden">Add</span>
              </Button>
            ) : undefined
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Items', value: totalCount },
            { label: 'Below Par Level', value: belowParCount, alert: belowParCount > 0 },
            { label: 'Above Max Level', value: aboveMaxCount, alert: aboveMaxCount > 0 },
          ].map((stat) => (
            <Card key={stat.label} className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardContent className="relative p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className={`text-lg sm:text-2xl font-bold ${stat.alert ? 'text-destructive' : ''}`}>
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={storeFilter}
            onValueChange={(v) => { setStoreFilter(v); setPage(1); }}
          >
            <SelectTrigger className="sm:w-56">
              <SelectValue placeholder="All Store Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Store Locations</SelectItem>
              {(storesData?.results || []).map((store) => (
                <SelectItem key={store.id} value={String(store.id)}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ResponsiveTable<WardStock>
            data={items}
            keyExtractor={(item) => item.id}
            onRowClick={(item) => router.push(`/inventory/ward-stock/${item.id}`)}
            defaultSortColumn="drug_name"
            defaultSortDirection="asc"
            columns={[
              {
                key: 'drug_name',
                header: 'Drug',
                sortable: true,
                cell: (item) => <span className="font-medium">{item.drug_name}</span>,
              },
              {
                key: 'store_location_name',
                header: 'Store',
                sortable: true,
                cell: (item) => item.store_location_name,
              },
              {
                key: 'quantity_available',
                header: 'Qty Available',
                sortable: true,
                sortType: 'number',
                cell: (item) => (
                  <span
                    className={
                      item.is_below_par
                        ? 'text-destructive font-semibold'
                        : item.is_above_max
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : ''
                    }
                  >
                    {item.quantity_available}
                  </span>
                ),
              },
              {
                key: 'par_level',
                header: 'Par Level',
                sortable: true,
                sortType: 'number',
                hideOnMobile: true,
                cell: (item) => item.par_level,
              },
              {
                key: 'max_level',
                header: 'Max Level',
                sortable: true,
                sortType: 'number',
                hideOnMobile: true,
                cell: (item) => item.max_level,
              },
              {
                key: 'status',
                header: 'Status',
                sortFn: (a, b) => Number(a.is_below_par) - Number(b.is_below_par),
                sortable: true,
                cell: (item) =>
                  item.is_below_par ? (
                    <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                      <AlertTriangle className="mr-1 h-3 w-3" /> Below Par
                    </Badge>
                  ) : item.is_above_max ? (
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      Above Max
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                      OK
                    </Badge>
                  ),
              },
              ...(canManage
                ? [
                    {
                      key: 'actions' as const,
                      header: '',
                      cell: (item: WardStock) => (
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteItem(item)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
            mobileCard={(item) => (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{item.drug_name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{item.store_location_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Qty: {item.quantity_available} · Par: {item.par_level} · Max: {item.max_level}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.is_below_par ? (
                    <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 w-fit">
                      <AlertTriangle className="mr-1 h-3 w-3" /> Below Par
                    </Badge>
                  ) : item.is_above_max ? (
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 w-fit">
                      Above Max
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 w-fit">
                      OK
                    </Badge>
                  )}
                  {canManage && (
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(item)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteItem(item)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages} ({totalCount} items)
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add Ward Stock Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) closeAddDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Ward Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Drug</Label>
              <Select value={formDrug} onValueChange={setFormDrug}>
                <SelectTrigger>
                  <SelectValue placeholder="Select drug" />
                </SelectTrigger>
                <SelectContent>
                  {(drugsData?.results || []).map((drug) => (
                    <SelectItem key={drug.id} value={String(drug.id)}>
                      {drug.generic_name} ({drug.strength})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Store Location</Label>
              <Select value={formStore} onValueChange={setFormStore}>
                <SelectTrigger>
                  <SelectValue placeholder="Select store" />
                </SelectTrigger>
                <SelectContent>
                  {(storesData?.results || []).map((store) => (
                    <SelectItem key={store.id} value={String(store.id)}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Initial Qty</Label>
                <Input type="number" min={0} value={formQty} onChange={(e) => setFormQty(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Par Level</Label>
                <Input type="number" min={0} value={formPar} onChange={(e) => setFormPar(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Max Level</Label>
                <Input type="number" min={0} value={formMax} onChange={(e) => setFormMax(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAddDialog}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formDrug || !formStore || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Ward Stock Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Ward Stock Levels</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {editItem.drug_name} at {editItem.store_location_name}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Par Level</Label>
                  <Input type="number" min={0} value={formPar} onChange={(e) => setFormPar(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Max Level</Label>
                  <Input type="number" min={0} value={formMax} onChange={(e) => setFormMax(e.target.value)} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteItem} onOpenChange={(open) => { if (!open) setDeleteItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Ward Stock</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deleteItem?.drug_name}</strong> from{' '}
              <strong>{deleteItem?.store_location_name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PullToRefresh>
  );
}
