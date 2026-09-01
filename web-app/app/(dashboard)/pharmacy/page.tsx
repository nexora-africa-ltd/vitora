/**
 * Pharmacy Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Main pharmacy dashboard with tabs for:
 * - Drug Catalog
 * - Inventory (Stock Batches)
 * - Prescriptions
 * - Dispensing History
 * - Alerts
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Plus,
  Pill,
  Package,
  FileText,
  AlertTriangle,
  Loader2,
  History,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import {
  DrugTable,
  StockTable,
  AlertsPanel,
  PrescriptionsTable,
  DispensingHistoryTable,
  DirectDispenseDialog,
} from '@/components/pharmacy';
import { AlertsWidget } from '@/components/dashboard/alerts-widget';
import {
  useDrugs,
  useStockBatches,
  useStockAlerts,
  usePrescriptions,
  usePendingPrescriptions,
  useDispensings,
} from '@/lib/hooks/use-pharmacy';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { useDebounce } from '@/lib/hooks/use-debounce';
import {
  StockStatus,
  PrescriptionStatus,
  DrugCategory,
  DrugForm,
  DrugSchedule,
} from '@/lib/types/pharmacy';
import { useFacility } from '@/lib/context/facility-context';
import { usePharmacySocket } from '@/lib/hooks/use-websocket';
import { usePermissions } from '@/lib/hooks/use-permissions';

export default function PharmacyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const canCreatePrescription = hasPermission('pharmacy.add_prescription');
  const { facility } = useFacility();
  usePharmacySocket(facility?.id ?? null);

  const { data: bootstrap } = useQuery({
    queryKey: ['pharmacy-bootstrap'],
    queryFn: pharmacyApi.getBootstrap,
  });

  const pharmacyEnabled = bootstrap?.pharmacy_enabled ?? true;
  const inventoryModuleEnabled = bootstrap?.modules.inventory ?? true;
  const canCreatePrescriptionFromCapabilities =
    bootstrap?.permissions.can_create_prescription ?? true;
  const canDispenseFromCapabilities = bootstrap?.permissions.can_dispense ?? true;
  const canViewAlertsFromCapabilities = bootstrap?.permissions.can_view_alerts ?? true;
  const canViewAlerts =
    hasPermission('pharmacy.view_stockalert') && canViewAlertsFromCapabilities && pharmacyEnabled;

  const requestedTab = searchParams.get('tab');
  const initialTab =
    requestedTab === 'inventory' ||
    requestedTab === 'prescriptions' ||
    requestedTab === 'dispensing' ||
    requestedTab === 'alerts'
      ? requestedTab
      : 'drugs';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (
      requestedTab === 'drugs' ||
      (requestedTab === 'inventory' && inventoryModuleEnabled) ||
      requestedTab === 'prescriptions' ||
      requestedTab === 'dispensing' ||
      requestedTab === 'alerts'
    ) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab, inventoryModuleEnabled]);

  useEffect(() => {
    if (activeTab === 'inventory' && !inventoryModuleEnabled) {
      setActiveTab('drugs');
    }
  }, [activeTab, inventoryModuleEnabled]);

  useEffect(() => {
    if (activeTab === 'alerts' && !canViewAlerts) {
      setActiveTab('drugs');
    }
  }, [activeTab, canViewAlerts]);

  // Direct dispense dialog state
  const [showDirectDispenseDialog, setShowDirectDispenseDialog] = useState(false);

  // Drugs state
  const [drugsPage, setDrugsPage] = useState(1);
  const [drugsSearch, setDrugsSearch] = useState('');
  const debouncedDrugsSearch = useDebounce(drugsSearch, 300);
  const [drugsFilters, setDrugsFilters] = useState<{
    category?: DrugCategory;
    form?: DrugForm;
    schedule?: DrugSchedule;
    is_essential?: boolean;
    is_active?: boolean;
  }>({});
  const drugsPageSize = 20;

  // Stock batches state
  const [stockPage, setStockPage] = useState(1);
  const [stockStatus, setStockStatus] = useState<StockStatus | ''>('');
  const [stockSearch, setStockSearch] = useState('');
  const debouncedStockSearch = useDebounce(stockSearch, 300);
  const stockPageSize = 20;

  // Prescriptions state
  const [rxPage, setRxPage] = useState(1);
  const [rxStatus, setRxStatus] = useState<PrescriptionStatus | ''>('');
  const [rxSearch, setRxSearch] = useState('');
  const debouncedRxSearch = useDebounce(rxSearch, 300);
  const [rxDateFrom, setRxDateFrom] = useState('');
  const [rxDateTo, setRxDateTo] = useState('');
  const rxPageSize = 20;

  // Dispensing history state
  const [dispensingPage, setDispensingPage] = useState(1);
  const [dispensingPatientFilter, setDispensingPatientFilter] = useState('');
  const [dispensingDrugFilter, setDispensingDrugFilter] = useState('');
  const [dispensingDateFrom, setDispensingDateFrom] = useState('');
  const [dispensingDateTo, setDispensingDateTo] = useState('');
  const dispensingPageSize = 20;

  // Alerts state
  const alertsResolved = false;
  const [alertsPage, setAlertsPage] = useState(1);
  const alertsPageSize = 20;

  // Data fetching
  const {
    data: drugsData,
    isLoading: drugsLoading,
    error: drugsError,
  } = useDrugs({
    page: drugsPage,
    page_size: drugsPageSize,
    search: debouncedDrugsSearch || undefined,
    ...drugsFilters,
  });

  const {
    data: stockData,
    isLoading: stockLoading,
    error: stockError,
  } = useStockBatches({
    page: stockPage,
    page_size: stockPageSize,
    status: stockStatus || undefined,
    search: debouncedStockSearch || undefined,
  });

  const {
    data: alertsData,
    isLoading: alertsLoading,
    error: alertsError,
    refetch: refetchAlerts,
  } = useStockAlerts(
    {
      page: alertsPage,
      page_size: alertsPageSize,
      resolved: alertsResolved,
    },
    { enabled: canViewAlerts }
  );

  const {
    data: rxData,
    isLoading: rxLoading,
    error: rxError,
  } = usePrescriptions({
    page: rxPage,
    page_size: rxPageSize,
    status: rxStatus || undefined,
    search: debouncedRxSearch || undefined,
    date_from: rxDateFrom || undefined,
    date_to: rxDateTo || undefined,
  });

  const { data: pendingRx } = usePendingPrescriptions();

  const {
    data: dispensingData,
    isLoading: dispensingLoading,
    error: dispensingError,
    refetch: refetchDispensings,
  } = useDispensings({
    page: dispensingPage,
    page_size: dispensingPageSize,
  });

  // Calculate counts for badges
  const unresolvedAlertsCount = canViewAlerts ? (alertsData?.count ?? 0) : 0;
  const pendingRxCount = pendingRx?.length ?? 0;

  // Calculate total pages
  const drugsTotalPages = Math.ceil((drugsData?.count ?? 0) / drugsPageSize);
  const stockTotalPages = Math.ceil((stockData?.count ?? 0) / stockPageSize);
  const rxTotalPages = Math.ceil((rxData?.count ?? 0) / rxPageSize);
  const dispensingTotalPages = Math.ceil((dispensingData?.count ?? 0) / dispensingPageSize);
  const alertsTotalPages = Math.ceil((alertsData?.count ?? 0) / alertsPageSize);

  // Show loading state when initial data is loading
  const isInitialLoading = drugsLoading && !drugsData;

  if (isInitialLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Pharmacy"
          helpContent="Manage medications, consumables, inventory, prescriptions, and dispensing workflows."
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <PageHeader
        title="Pharmacy"
        helpContent="Manage medications, consumables, inventory, prescriptions, and dispensing workflows."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            {canDispenseFromCapabilities ? (
              <Button
                variant="outline"
                onClick={() => setShowDirectDispenseDialog(true)}
                data-testid="direct-dispense-button"
                className="w-full sm:w-auto"
              >
                <Pill className="mr-2 h-4 w-4" />
                Direct Dispense
              </Button>
            ) : null}
            <Link href="/pharmacy/reports" data-testid="pharmacy-reports">
              <Button variant="outline" className="w-full sm:w-auto">
                <BarChart3 className="mr-2 h-4 w-4" />
                Reports
              </Button>
            </Link>
          </div>
        }
      />

      {/* Dashboard Summary - Key Widgets */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Alerts Widget */}
        {canViewAlerts ? (
          <div className="lg:col-span-1">
            <AlertsWidget />
          </div>
        ) : null}

        {/* Quick Stats */}
        <div className={canViewAlerts ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base sm:text-lg">Quick Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground sm:text-sm">Total Items</p>
                <p className="text-xl font-bold sm:text-2xl">{drugsData?.count ?? 0}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground sm:text-sm">Stock Batches</p>
                <p className="text-xl font-bold sm:text-2xl">
                  {inventoryModuleEnabled ? (stockData?.count ?? 0) : 'N/A'}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground sm:text-sm">Pending Rx</p>
                <p className="text-xl font-bold sm:text-2xl">{pendingRxCount}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground sm:text-sm">Active Alerts</p>
                <p className="text-xl font-bold text-destructive sm:text-2xl">
                  {canViewAlerts ? unresolvedAlertsCount : 'N/A'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {!pharmacyEnabled ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              Pharmacy module is disabled for this facility.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap gap-1 p-1">
            <TabsTrigger
              value="drugs"
              className="flex-1 gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm"
            >
              <Pill className="h-4 w-4" />
              <span className="hidden sm:inline">Catalog</span>
            </TabsTrigger>
            {inventoryModuleEnabled ? (
              <TabsTrigger
                value="inventory"
                className="flex-1 gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm"
              >
                <Package className="h-4 w-4" />
                <span className="hidden sm:inline">Inventory</span>
              </TabsTrigger>
            ) : null}
            <TabsTrigger
              value="prescriptions"
              className="relative flex-1 gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Prescriptions</span>
              {pendingRxCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-0.5 flex h-5 min-w-[1.25rem] items-center justify-center px-1.5 text-xs tabular-nums"
                  data-testid="pending-count"
                >
                  {pendingRxCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="dispensing"
              className="flex-1 gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm"
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Dispensing</span>
            </TabsTrigger>
            {canViewAlerts ? (
              <TabsTrigger
                value="alerts"
                className="relative flex-1 gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm"
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="hidden sm:inline">Alerts</span>
                {unresolvedAlertsCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="ml-0.5 flex h-5 min-w-[1.25rem] items-center justify-center px-1.5 text-xs tabular-nums"
                  >
                    {unresolvedAlertsCount}
                  </Badge>
                )}
              </TabsTrigger>
            ) : null}
          </TabsList>

          {/* Drugs Tab */}
          <TabsContent value="drugs" className="space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={() => router.push('/pharmacy/drugs/new')}
                data-testid="add-drug-button"
                size="sm"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add Item
              </Button>
            </div>
            <DrugTable
              drugs={drugsData?.results ?? []}
              isLoading={drugsLoading}
              error={drugsError as Error | null}
              page={drugsPage}
              totalPages={drugsTotalPages}
              totalCount={drugsData?.count}
              onPageChange={setDrugsPage}
              onSearch={(query) => {
                setDrugsSearch(query);
                setDrugsPage(1);
              }}
              onFiltersChange={(filters) => {
                setDrugsFilters(filters);
                setDrugsPage(1);
              }}
            />
          </TabsContent>

          {inventoryModuleEnabled ? (
            <TabsContent value="inventory" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => router.push('/pharmacy/stock/receive')} size="sm">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Quick Receive
                </Button>
              </div>
              <StockTable
                batches={stockData?.results ?? []}
                isLoading={stockLoading}
                error={stockError as Error | null}
                page={stockPage}
                totalPages={stockTotalPages}
                onPageChange={setStockPage}
                onStatusFilter={(status) => {
                  setStockStatus(status);
                  setStockPage(1);
                }}
                onSearchFilter={(query) => {
                  setStockSearch(query);
                  setStockPage(1);
                }}
                drugs={drugsData?.results.map((d) => ({
                  id: d.id,
                  display_name: d.generic_name + ' ' + d.strength,
                }))}
              />
            </TabsContent>
          ) : null}

          {/* Prescriptions Tab */}
          <TabsContent value="prescriptions" className="space-y-4">
            <div className="flex justify-end">
              {canCreatePrescription && canCreatePrescriptionFromCapabilities ? (
                <Button onClick={() => router.push('/pharmacy/prescriptions/new')} size="sm">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Prescription
                </Button>
              ) : null}
            </div>
            <PrescriptionsTable
              prescriptions={rxData?.results ?? []}
              isLoading={rxLoading}
              error={rxError as Error | null}
              page={rxPage}
              pageSize={rxPageSize}
              totalCount={rxData?.count ?? 0}
              totalPages={rxTotalPages}
              onPageChange={setRxPage}
              onStatusFilter={(status) => {
                setRxStatus(status);
                setRxPage(1);
              }}
              onSearch={(query) => {
                setRxSearch(query);
                setRxPage(1);
              }}
            />
          </TabsContent>

          {/* Dispensing History Tab */}
          <TabsContent value="dispensing" className="space-y-4">
            <DispensingHistoryTable
              dispensings={dispensingData?.results ?? []}
              isLoading={dispensingLoading}
              error={dispensingError as Error | null}
              page={dispensingPage}
              totalPages={dispensingTotalPages}
              onPageChange={setDispensingPage}
              onPatientFilter={(patientId) => {
                setDispensingPatientFilter(patientId);
                setDispensingPage(1);
              }}
              onDrugFilter={(drugId) => {
                setDispensingDrugFilter(drugId);
                setDispensingPage(1);
              }}
              onDateRangeFilter={(from, to) => {
                setDispensingDateFrom(from);
                setDispensingDateTo(to);
                setDispensingPage(1);
              }}
            />
          </TabsContent>

          {/* Alerts Tab */}
          {canViewAlerts ? (
            <TabsContent value="alerts" className="space-y-4">
              <AlertsPanel
                alerts={alertsData?.results ?? []}
                isLoading={alertsLoading}
                error={alertsError as Error | null}
                page={alertsPage}
                totalPages={alertsTotalPages}
                totalCount={alertsData?.count ?? 0}
                onPageChange={setAlertsPage}
                onRefresh={() => refetchAlerts()}
                autoRefreshInterval={300} // Auto-refresh every 5 minutes (300 seconds)
              />
            </TabsContent>
          ) : null}
        </Tabs>
      )}

      {/* Direct Dispense Dialog */}
      <DirectDispenseDialog
        isOpen={showDirectDispenseDialog}
        onClose={() => setShowDirectDispenseDialog(false)}
        onSuccess={() => {
          refetchDispensings();
        }}
      />
    </div>
  );
}
