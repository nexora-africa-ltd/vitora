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

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Pill, Package, FileText, AlertTriangle, Loader2, History, BarChart3 } from 'lucide-react';
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
import { useDebounce } from '@/lib/hooks/use-debounce';
import { StockStatus, PrescriptionStatus, DrugCategory, DrugForm, DrugSchedule } from '@/lib/types/pharmacy';
import { useFacility } from '@/lib/context/facility-context';
import { usePharmacySocket } from '@/lib/hooks/use-websocket';

export default function PharmacyPage() {
  const router = useRouter();
  const { facility } = useFacility();
  usePharmacySocket(facility?.id ?? null);

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
  const [alertsResolved, setAlertsResolved] = useState(false);

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
  });

  const {
    data: alertsData,
    isLoading: alertsLoading,
    error: alertsError,
    refetch: refetchAlerts,
  } = useStockAlerts({
    resolved: alertsResolved,
  });

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
  const unresolvedAlertsCount = alertsData?.results?.filter((a) => !a.resolved).length ?? 0;
  const pendingRxCount = pendingRx?.length ?? 0;

  // Calculate total pages
  const drugsTotalPages = Math.ceil((drugsData?.count ?? 0) / drugsPageSize);
  const stockTotalPages = Math.ceil((stockData?.count ?? 0) / stockPageSize);
  const rxTotalPages = Math.ceil((rxData?.count ?? 0) / rxPageSize);
  const dispensingTotalPages = Math.ceil((dispensingData?.count ?? 0) / dispensingPageSize);

  // Show loading state when initial data is loading
  const isInitialLoading = drugsLoading && !drugsData;

  if (isInitialLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Pharmacy"
          helpContent="Manage drugs, inventory, prescriptions, and dispensing workflows."
        />
        <div className="flex items-center justify-center py-12" data-testid="loading-spinner">
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
        helpContent="Manage drugs, inventory, prescriptions, and dispensing workflows."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowDirectDispenseDialog(true)}
              data-testid="direct-dispense-button"
              className="w-full sm:w-auto"
            >
              <Pill className="h-4 w-4 mr-2" />
              Direct Dispense
            </Button>
            <Link href="/pharmacy/reports" data-testid="pharmacy-reports">
              <Button variant="outline" className="w-full sm:w-auto">
                <BarChart3 className="h-4 w-4 mr-2" />
                Reports
              </Button>
            </Link>
          </div>
        }
      />

      {/* Dashboard Summary - Key Widgets */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Alerts Widget */}
        <div className="lg:col-span-1">
          <AlertsWidget />
        </div>

        {/* Quick Stats */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base sm:text-lg">Quick Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-0.5">
                <p className="text-xs sm:text-sm text-muted-foreground">Total Drugs</p>
                <p className="text-xl sm:text-2xl font-bold">{drugsData?.count ?? 0}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs sm:text-sm text-muted-foreground">Stock Batches</p>
                <p className="text-xl sm:text-2xl font-bold">{stockData?.count ?? 0}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs sm:text-sm text-muted-foreground">Pending Rx</p>
                <p className="text-xl sm:text-2xl font-bold">{pendingRxCount}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs sm:text-sm text-muted-foreground">Active Alerts</p>
                <p className="text-xl sm:text-2xl font-bold text-destructive">{unresolvedAlertsCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="drugs" className="space-y-4">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1 sm:grid sm:grid-cols-5">
          <TabsTrigger value="drugs" className="flex-1 gap-1.5 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
            <Pill className="h-4 w-4" />
            <span className="hidden sm:inline">Drugs</span>
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex-1 gap-1.5 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Inventory</span>
          </TabsTrigger>
          <TabsTrigger value="prescriptions" className="flex-1 gap-1.5 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 relative">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Prescriptions</span>
            {pendingRxCount > 0 && (
              <Badge
                variant="destructive"
                className="ml-0.5 h-5 w-5 p-0 flex items-center justify-center text-xs"
                data-testid="pending-count"
              >
                {pendingRxCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dispensing" className="flex-1 gap-1.5 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Dispensing</span>
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex-1 gap-1.5 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 relative">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Alerts</span>
            {unresolvedAlertsCount > 0 && (
              <Badge
                variant="destructive"
                className="ml-0.5 h-5 w-5 p-0 flex items-center justify-center text-xs"
              >
                {unresolvedAlertsCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Drugs Tab */}
        <TabsContent value="drugs" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => router.push('/pharmacy/drugs/new')} data-testid="add-drug-button" size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Add Drug
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

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => router.push('/pharmacy/stock/receive')} size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
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
            drugs={drugsData?.results.map(d => ({ id: d.id, display_name: d.generic_name + ' ' + d.strength }))}
          />
        </TabsContent>

        {/* Prescriptions Tab */}
        <TabsContent value="prescriptions" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => router.push('/pharmacy/prescriptions/new')} size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              New Prescription
            </Button>
          </div>
          <PrescriptionsTable
            prescriptions={rxData?.results ?? []}
            isLoading={rxLoading}
            error={rxError as Error | null}
            page={rxPage}
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
        <TabsContent value="alerts" className="space-y-4">
          <AlertsPanel
            alerts={alertsData?.results ?? []}
            isLoading={alertsLoading}
            error={alertsError as Error | null}
            onRefresh={() => refetchAlerts()}
            autoRefreshInterval={300} // Auto-refresh every 5 minutes (300 seconds)
          />
        </TabsContent>
      </Tabs>

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
