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
import { StockStatus, PrescriptionStatus, DrugCategory, DrugForm, DrugSchedule } from '@/lib/types/pharmacy';

export default function PharmacyPage() {
  const router = useRouter();

  // Direct dispense dialog state
  const [showDirectDispenseDialog, setShowDirectDispenseDialog] = useState(false);

  // Drugs state
  const [drugsPage, setDrugsPage] = useState(1);
  const [drugsSearch, setDrugsSearch] = useState('');
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
    search: drugsSearch || undefined,
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pharmacy</h1>
            <p className="text-muted-foreground">
              Manage drugs, inventory, prescriptions, and dispensing
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12" data-testid="loading-spinner">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pharmacy</h1>
          <p className="text-muted-foreground">
            Manage drugs, inventory, prescriptions, and dispensing
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowDirectDispenseDialog(true)}
            data-testid="direct-dispense-button"
          >
            <Pill className="h-4 w-4 mr-2" />
            Direct Dispense
          </Button>
          <Link href="/pharmacy/reports" data-testid="pharmacy-reports">
            <Button variant="outline">
              <BarChart3 className="h-4 w-4 mr-2" />
              Reports
            </Button>
          </Link>
        </div>
      </div>

      {/* Dashboard Summary - Key Widgets */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Alerts Widget */}
        <div className="lg:col-span-1">
          <AlertsWidget />
        </div>

        {/* Quick Stats */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Drugs</p>
                <p className="text-2xl font-bold">{drugsData?.count ?? 0}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Stock Batches</p>
                <p className="text-2xl font-bold">{stockData?.count ?? 0}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Pending Prescriptions</p>
                <p className="text-2xl font-bold">{pendingRxCount}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Active Alerts</p>
                <p className="text-2xl font-bold text-destructive">{unresolvedAlertsCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="drugs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="drugs" className="gap-2">
            <Pill className="h-4 w-4" />
            Drugs
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-2">
            <Package className="h-4 w-4" />
            Inventory
          </TabsTrigger>
          <TabsTrigger value="prescriptions" className="gap-2 relative">
            <FileText className="h-4 w-4" />
            Prescriptions
            {pendingRxCount > 0 && (
              <Badge
                variant="destructive"
                className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                data-testid="pending-count"
              >
                {pendingRxCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dispensing" className="gap-2">
            <History className="h-4 w-4" />
            Dispensing
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2 relative">
            <AlertTriangle className="h-4 w-4" />
            Alerts
            {unresolvedAlertsCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {unresolvedAlertsCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Drugs Tab */}
        <TabsContent value="drugs" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => router.push('/pharmacy/drugs/new')} data-testid="add-drug-button">
              <Plus className="h-4 w-4 mr-2" />
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
            <Button onClick={() => router.push('/pharmacy/stock/receive')}>
              <Plus className="h-4 w-4 mr-2" />
              Receive Stock
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
            <Button onClick={() => router.push('/pharmacy/prescriptions/new')}>
              <Plus className="h-4 w-4 mr-2" />
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
