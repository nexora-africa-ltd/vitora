/**
 * Pharmacy Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * Main pharmacy dashboard with tabs for:
 * - Drug Catalog
 * - Inventory (Stock Batches)
 * - Prescriptions
 * - Alerts
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pill, Package, FileText, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DrugTable, StockTable, AlertsPanel, PrescriptionsTable } from '@/components/pharmacy';
import {
  useDrugs,
  useStockBatches,
  useStockAlerts,
  usePrescriptions,
  usePendingPrescriptions,
} from '@/lib/hooks/use-pharmacy';
import { StockStatus, PrescriptionStatus, DrugCategory, DrugForm, DrugSchedule } from '@/lib/types/pharmacy';

export default function PharmacyPage() {
  const router = useRouter();

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

  // Calculate counts for badges
  const unresolvedAlertsCount = alertsData?.results?.filter((a) => !a.resolved).length ?? 0;
  const pendingRxCount = pendingRx?.length ?? 0;

  // Calculate total pages
  const drugsTotalPages = Math.ceil((drugsData?.count ?? 0) / drugsPageSize);
  const stockTotalPages = Math.ceil((stockData?.count ?? 0) / stockPageSize);
  const rxTotalPages = Math.ceil((rxData?.count ?? 0) / rxPageSize);

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
            onDateFilter={(dateFrom, dateTo) => {
              setRxDateFrom(dateFrom);
              setRxDateTo(dateTo);
              setRxPage(1);
            }}
          />
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <AlertsPanel
            alerts={alertsData?.results ?? []}
            isLoading={alertsLoading}
            error={alertsError as Error | null}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
