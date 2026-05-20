/**
 * Drug/Item Detail Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { use, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Package, Loader2, AlertTriangle, XCircle, Shield, Star, Search, Link2, ExternalLink, TrendingUp, Clock, DollarSign, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { useToast } from '@/lib/hooks/use-toast';
import { DrugCategory, DrugForm, DrugSchedule, HptSearchResult, StockBatch, StockStatus } from '@/lib/types/pharmacy';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

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
  MEDICAL_SUPPLY: 'Medical Supply',
  SURGICAL_CONSUMABLE: 'Surgical Consumable',
  REAGENT: 'Reagent',
  PPE: 'PPE',
  WOUND_CARE: 'Wound Care',
  DISPOSABLE: 'Disposable',
};

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
  UNIT: 'Unit/Piece',
  OTHER: 'Other',
};

const SCHEDULE_COLORS: Record<DrugSchedule, string> = {
  OTC: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  POM: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  P: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  CD: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function DrugDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const drugId = parseInt(resolvedParams.id);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [hptDialogOpen, setHptDialogOpen] = useState(false);
  const [hptQuery, setHptQuery] = useState('');
  const [hptResults, setHptResults] = useState<HptSearchResult[]>([]);
  const [hptSearching, setHptSearching] = useState(false);
  const [hptMapping, setHptMapping] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: drug, isLoading, error } = useQuery({
    queryKey: ['drug', drugId],
    queryFn: () => pharmacyApi.getDrug(drugId),
  });

  const { data: batches } = useQuery({
    queryKey: ['stock-batches', drugId],
    queryFn: () => pharmacyApi.listStockBatches({ drug: drugId }),
  });

  // Compute stock statistics from batches (must be above early returns)
  const stockStats = useMemo(() => {
    const batchList = batches?.results ?? [];
    const activeBatches = batchList.filter(b => b.status === 'AVAILABLE' || b.status === 'LOW');
    const totalAvailable = batchList.reduce((sum, b) => sum + b.quantity_available, 0);
    const avgPrice = activeBatches.length > 0
      ? activeBatches.reduce((sum, b) => sum + Number(b.selling_price), 0) / activeBatches.length
      : 0;
    const nearestExpiry = activeBatches.length > 0
      ? Math.min(...activeBatches.map(b => b.days_to_expiry))
      : null;
    const totalValue = batchList.reduce((sum, b) => sum + (b.quantity_available * Number(b.selling_price)), 0);

    // Status distribution for chart
    const statusCounts: Record<string, number> = {};
    for (const b of batchList) {
      statusCounts[b.status] = (statusCounts[b.status] || 0) + b.quantity_available;
    }
    const statusChartData = Object.entries(statusCounts)
      .filter(([, qty]) => qty > 0)
      .map(([status, qty]) => ({ status, qty }));

    // Expiry timeline for chart
    const expiryData = activeBatches
      .sort((a, b) => a.days_to_expiry - b.days_to_expiry)
      .slice(0, 8)
      .map(b => ({
        batch: b.batch_number.replace('BAT-', ''),
        days: b.days_to_expiry,
        qty: b.quantity_available,
      }));

    return { activeBatches: activeBatches.length, totalAvailable, avgPrice, nearestExpiry, totalValue, statusChartData, expiryData, totalBatches: batchList.length };
  }, [batches]);

  const handleDelete = async () => {
    if (!drug) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await pharmacyApi.deleteDrug(drug.id);
      router.push('/pharmacy');
    } catch (err: any) {
      setDeleteError(
        err.response?.data?.detail ||
        err.message ||
        'Failed to delete. This item may have existing stock.'
      );
      setIsDeleting(false);
    }
  };

  const handleHptSearch = async (query: string) => {
    setHptQuery(query);
    if (query.length < 2) { setHptResults([]); return; }
    setHptSearching(true);
    try {
      const data = await pharmacyApi.hptSearch(query);
      setHptResults(data.results);
    } catch {
      toast({ title: 'HPT search failed', variant: 'destructive' });
    } finally {
      setHptSearching(false);
    }
  };

  const handleHptMap = async (result: HptSearchResult) => {
    if (!drug) return;
    setHptMapping(true);
    try {
      await pharmacyApi.mapHpt(drug.id, {
        hpt_code: result.knhts_concept_id,
        hpt_product_id: result.product_id,
        ppb_code: result.ppb_registration_code || undefined,
      });
      toast({ title: 'Linked to HPT Registry' });
      await queryClient.invalidateQueries({ queryKey: ['drug', drugId] });
      setHptDialogOpen(false);
      setHptQuery('');
      setHptResults([]);
    } catch {
      toast({ title: 'Failed to map to HPT', variant: 'destructive' });
    } finally {
      setHptMapping(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="grid gap-4 sm:gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error || !drug) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Item Not Found" />
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error ? error.message : 'Item not found'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const isLowStock = drug.current_stock > 0 && drug.current_stock < drug.default_reorder_level;
  const isOutOfStock = drug.current_stock === 0;
  const isMedication = drug.item_type === 'MEDICATION' || !drug.item_type;
  const typeLabel = drug.item_type === 'REAGENT' ? 'Reagent' : drug.item_type === 'CONSUMABLE' ? 'Consumable' : 'Drug';

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="drug-detail">
      {/* Page Header */}
      <PageHeader
        title={drug.generic_name}
        helpContent={`View and manage this ${typeLabel.toLowerCase()} item. Edit details, check stock levels, and link to HPT registry.`}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" size="sm" onClick={() => router.push(`/pharmacy/drugs/${drug.id}/edit`)}>
              <Edit className="h-4 w-4 mr-1.5" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/pharmacy?tab=inventory')}>
              <Package className="h-4 w-4 mr-1.5" />
              Batches
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">Delete</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {drug.generic_name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove this item from the catalog. This action cannot be undone.
                    {drug.current_stock > 0 && (
                      <span className="block mt-2 text-destructive font-semibold">
                        Warning: This item has {drug.current_stock} units in stock and cannot be deleted.
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteError && (
                  <Alert variant="destructive">
                    <AlertDescription>{deleteError}</AlertDescription>
                  </Alert>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={isDeleting || drug.current_stock > 0}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {drug.code}
            <span className="text-muted-foreground"> • {FORM_LABELS[drug.form]} • {drug.strength}</span>
          </p>
          {drug.brand_names && drug.brand_names.length > 0 && (
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              Brands: {drug.brand_names.join(', ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {drug.item_type && drug.item_type !== 'MEDICATION' && (
            <Badge variant="outline" className="shrink-0 w-fit">
              {typeLabel}
            </Badge>
          )}
          <Badge className={`${SCHEDULE_COLORS[drug.schedule]} shrink-0 w-fit`}>
            {drug.schedule}
          </Badge>
          {isOutOfStock && (
            <Badge variant="destructive" className="shrink-0 w-fit">Out of Stock</Badge>
          )}
          {isLowStock && (
            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 shrink-0 w-fit">Low Stock</Badge>
          )}
        </div>
      </div>

      {/* Content Cards */}
      <div className="grid gap-4 sm:gap-6">
        {/* Stock Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Package className="h-4 w-4" />
                <span className="text-xs font-medium">Total Stock</span>
              </div>
              <p className={`text-2xl font-bold ${isOutOfStock ? 'text-destructive' : ''}`}>
                {stockStats.totalAvailable.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{drug.unit}s across {stockStats.activeBatches} batches</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs font-medium">Stock Value</span>
              </div>
              <p className="text-2xl font-bold">
                KES {stockStats.totalValue >= 1000 ? `${(stockStats.totalValue / 1000).toFixed(1)}k` : stockStats.totalValue.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Avg KES {stockStats.avgPrice.toFixed(0)}/unit</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Nearest Expiry</span>
              </div>
              <p className={`text-2xl font-bold ${stockStats.nearestExpiry !== null && stockStats.nearestExpiry < 90 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                {stockStats.nearestExpiry !== null ? `${stockStats.nearestExpiry}d` : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {stockStats.nearestExpiry !== null && stockStats.nearestExpiry < 30 ? 'Expiring soon!' : stockStats.nearestExpiry !== null && stockStats.nearestExpiry < 90 ? 'Within 3 months' : 'No urgent expiry'}
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Layers className="h-4 w-4" />
                <span className="text-xs font-medium">Batches</span>
              </div>
              <p className="text-2xl font-bold">{stockStats.totalBatches}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stockStats.activeBatches} active, {stockStats.totalBatches - stockStats.activeBatches} expired/other</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        {stockStats.totalBatches > 0 && (
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            {/* Expiry Timeline */}
            {stockStats.expiryData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Batch Expiry Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stockStats.expiryData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                        <XAxis dataKey="batch" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} label={{ value: 'Days', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                        <RechartsTooltip
                          formatter={(value: number) => [`${value} days`, 'Days to Expiry']}
                          labelFormatter={(label) => `Batch ${label}`}
                        />
                        <Bar dataKey="days" radius={[4, 4, 0, 0]}>
                          {stockStats.expiryData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.days < 30 ? 'hsl(0, 84%, 60%)' : entry.days < 90 ? 'hsl(38, 92%, 50%)' : 'hsl(142, 71%, 45%)'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" />{'<30d'}</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />{'30-90d'}</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-green-500" />{'>90d'}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stock by Status */}
            {stockStats.statusChartData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Stock by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stockStats.statusChartData}
                          dataKey="qty"
                          nameKey="status"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          label={({ status, qty }) => `${status} (${qty})`}
                          labelLine={false}
                        >
                          {stockStats.statusChartData.map((entry, index) => {
                            const colors: Record<string, string> = {
                              AVAILABLE: 'hsl(142, 71%, 45%)',
                              LOW: 'hsl(38, 92%, 50%)',
                              OUT_OF_STOCK: 'hsl(0, 84%, 60%)',
                              EXPIRED: 'hsl(0, 60%, 40%)',
                              QUARANTINE: 'hsl(25, 95%, 53%)',
                              RECALLED: 'hsl(271, 91%, 65%)',
                            };
                            return <Cell key={`cell-${index}`} fill={colors[entry.status] || 'hsl(215, 20%, 65%)'} />;
                          })}
                        </Pie>
                        <RechartsTooltip formatter={(value: number) => [`${value} units`, 'Quantity']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Item Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Item Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Code</p>
                <p className="font-mono text-sm font-medium">{drug.code}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium">{drug.generic_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Form</p>
                <p className="text-sm">{FORM_LABELS[drug.form]}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Strength</p>
                <p className="text-sm">{drug.strength}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Unit</p>
                <p className="text-sm">{drug.unit}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs text-muted-foreground">Categories</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {drug.categories.length > 0 ? (
                    drug.categories.map((cat) => (
                      <Badge key={cat} variant="secondary" className="text-xs">{CATEGORY_LABELS[cat]}</Badge>
                    ))
                  ) : (
                    <Badge variant="outline" className="text-xs">Uncategorized</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Flags */}
            {(drug.is_essential || drug.is_controlled || drug.is_narcotic) && (
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                {drug.is_essential && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                    <Star className="h-3 w-3 mr-1" />
                    Essential (KEML)
                  </Badge>
                )}
                {drug.is_controlled && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                    <Shield className="h-3 w-3 mr-1" />
                    Controlled
                  </Badge>
                )}
                {drug.is_narcotic && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                    <Shield className="h-3 w-3 mr-1" />
                    Narcotic
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stock Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Stock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Current Stock</p>
                <div className="flex items-center gap-1.5">
                  <p className={`text-xl font-bold ${isOutOfStock ? 'text-destructive' : ''}`}>
                    {drug.current_stock}
                  </p>
                  {isOutOfStock && <XCircle className="h-4 w-4 text-destructive" />}
                  {isLowStock && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reorder Level</p>
                <p className="text-sm font-semibold">{drug.default_reorder_level}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reorder Qty</p>
                <p className="text-sm font-semibold">{drug.default_reorder_quantity}</p>
              </div>
              {drug.reference_price && (
                <div>
                  <p className="text-xs text-muted-foreground">Ref. Price</p>
                  <p className="text-sm font-semibold">KES {parseFloat(String(drug.reference_price)).toFixed(2)}</p>
                </div>
              )}
            </div>

            {/* Batch list */}
            {batches && batches.results.length > 0 && (
              <div className="pt-3 border-t">
                <p className="text-xs text-muted-foreground mb-2">Recent Batches</p>
                <div className="space-y-2">
                  {batches.results.slice(0, 5).map((batch) => (
                    <div key={batch.id} className="flex justify-between items-center p-2 border rounded-md text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{batch.batch_number}</p>
                        <p className="text-xs text-muted-foreground">
                          Exp: {new Date(batch.expiry_date).toLocaleDateString()}
                          {batch.days_to_expiry < 90 && (
                            <span className="ml-1 text-yellow-600">({batch.days_to_expiry}d)</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="font-semibold">{batch.quantity_available}</p>
                        <Badge variant="outline" className="text-xs">{batch.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
                {batches.results.length > 5 && (
                  <Button variant="link" size="sm" onClick={() => router.push('/pharmacy?tab=inventory')} className="mt-2 px-0">
                    View all {batches.results.length} batches
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Regulatory / Additional — only for medications */}
        {isMedication && (drug.keml_code || drug.nhif_code || drug.shelf_life_months || drug.storage_requirements) && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Regulatory & Storage</CardTitle>
                <HelpPopover content="KEML codes, SHA insurance codes, and storage requirements for compliance tracking." />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {drug.keml_code && (
                  <div>
                    <p className="text-xs text-muted-foreground">KEML Code</p>
                    <p className="text-sm font-medium">{drug.keml_code}</p>
                  </div>
                )}
                {drug.nhif_code && (
                  <div>
                    <p className="text-xs text-muted-foreground">SHA Code</p>
                    <p className="text-sm font-medium">{drug.nhif_code}</p>
                  </div>
                )}
                {drug.shelf_life_months && (
                  <div>
                    <p className="text-xs text-muted-foreground">Shelf Life</p>
                    <p className="text-sm">{drug.shelf_life_months} months</p>
                  </div>
                )}
              </div>
              {drug.storage_requirements && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Storage</p>
                  <p className="text-sm">{drug.storage_requirements}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* HPT Registry */}
        {isMedication && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">HPT Registry</CardTitle>
                <HelpPopover content="Link this drug to the DHA Health Products & Technologies registry for SHA claims compliance." />
              </div>
            </CardHeader>
            <CardContent>
              {drug.hpt_code ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">KNHTS Code</p>
                      <p className="font-mono text-sm font-medium">{drug.hpt_code}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Product ID</p>
                      <p className="text-sm font-medium">{drug.hpt_product_id}</p>
                    </div>
                    {drug.ppb_code && (
                      <div>
                        <p className="text-xs text-muted-foreground">PPB Code</p>
                        <p className="text-sm font-medium">{drug.ppb_code}</p>
                      </div>
                    )}
                    {drug.hpt_last_synced && (
                      <div>
                        <p className="text-xs text-muted-foreground">Last Synced</p>
                        <p className="text-sm">{new Date(drug.hpt_last_synced).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setHptDialogOpen(true)}>
                    <Link2 className="h-4 w-4 mr-1.5" />
                    Re-link
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    Not linked to DHA HPT Registry.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setHptDialogOpen(true)}>
                    <Link2 className="h-4 w-4 mr-1.5" />
                    Link to HPT
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* HPT Search Dialog */}
      <Dialog open={hptDialogOpen} onOpenChange={setHptDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Link to HPT Registry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoComplete="off"
                className="pl-9"
                placeholder="Search HPT products…"
                value={hptQuery}
                onChange={(e) => handleHptSearch(e.target.value)}
              />
            </div>
            {hptSearching && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {hptResults.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-auto">
                {hptResults.map((result) => (
                  <button
                    key={result.product_id}
                    className="w-full text-left p-3 rounded-md border hover:bg-accent transition-colors"
                    disabled={hptMapping}
                    onClick={() => handleHptMap(result)}
                  >
                    <p className="font-medium text-sm">{result.generic_display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {result.form_description} • {result.route_description} • {result.strength_amount}{result.strength_unit}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mt-1">
                      KNHTS: {result.knhts_concept_id}
                      {result.ppb_registration_code && ` • PPB: ${result.ppb_registration_code}`}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {!hptSearching && hptQuery.length >= 2 && hptResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No HPT products found for &quot;{hptQuery}&quot;
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
