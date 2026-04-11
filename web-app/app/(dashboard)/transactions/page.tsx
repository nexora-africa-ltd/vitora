/**
 * Transactions Dashboard Page
 * Overview for invoices, payments, and bills
 */
'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText, CreditCard, Receipt } from 'lucide-react';

import { BillingDashboard } from '@/components/billing/BillingDashboard';
import { InvoiceList } from '@/components/billing/InvoiceList';
import { PaymentList } from '@/components/billing/PaymentList';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDailyCollectionReport, useInvoices, usePayments } from '@/lib/hooks/billing';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useBillingStore } from '@/lib/stores/billing';
import { useFacility } from '@/lib/context/facility-context';
import { useBillingSocket } from '@/lib/hooks/use-websocket';
import type { Invoice, Payment, InvoiceStatus, PaymentMethod, PaymentStatus } from '@/lib/types/billing';

export default function TransactionsPage() {
  const router = useRouter();
  const { facility } = useFacility();
  useBillingSocket(facility?.id ?? null);
  const { activeTab, setActiveTab } = useBillingStore();

  // Invoice filter state
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | undefined>();
  const debouncedInvoiceSearch = useDebounce(invoiceSearch, 300);

  // Payment filter state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | undefined>();
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | undefined>();

  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices({
    search: debouncedInvoiceSearch || undefined,
    status: invoiceStatus,
  });
  const { data: paymentsData, isLoading: paymentsLoading } = usePayments({
    method: paymentMethod,
    status: paymentStatus,
  });

  const today = new Date().toISOString().split('T')[0] as string;
  const { data: dailyReport, isLoading: reportLoading } = useDailyCollectionReport(today);

  const handleCreateInvoice = () => {
    router.push('/transactions/invoices/new');
  };

  const handleSelectInvoice = (invoice: Invoice) => {
    router.push(`/transactions/invoices/${invoice.id}`);
  };

  const handleViewReceipt = (payment: Payment) => {
    router.push(`/transactions/receipts/${payment.id}`);
  };

  const handleInvoiceFilter = useCallback((filters: { status?: InvoiceStatus; search?: string }) => {
    setInvoiceSearch(filters.search ?? '');
    setInvoiceStatus(filters.status);
  }, []);

  const handlePaymentFilter = useCallback((filters: { method?: PaymentMethod; status?: PaymentStatus }) => {
    setPaymentMethod(filters.method);
    setPaymentStatus(filters.status);
  }, []);

  const handleDateChange = (date: string) => {
    console.log('Date changed:', date);
  };

  const pendingCount =
    invoicesData?.results?.filter((inv) => inv.status === 'PENDING').length || 0;

  const overdueCount =
    invoicesData?.results?.filter((inv) => inv.status === 'OVERDUE').length || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">
            Manage invoices, payments, and bills
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCreateInvoice}>
            <Plus className="h-4 w-4 mr-2" />
            New Invoice
          </Button>
        </div>
      </div>

      <BillingDashboard
        dailyReport={dailyReport || null}
        isLoading={reportLoading}
        pendingInvoicesCount={pendingCount}
        overdueInvoicesCount={overdueCount}
        onDateChange={handleDateChange}
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as typeof activeTab)}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="invoices" className="gap-2">
            <FileText className="h-4 w-4" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Payments
          </TabsTrigger>
          <TabsTrigger value="bills" className="gap-2">
            <Receipt className="h-4 w-4" />
            Bills
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-4">
          <InvoiceList
            invoices={invoicesData?.results || []}
            isLoading={invoicesLoading}
            onSelect={handleSelectInvoice}
            onCreateNew={handleCreateInvoice}
            onFilter={handleInvoiceFilter}
          />
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <PaymentList
            payments={paymentsData?.results || []}
            isLoading={paymentsLoading}
            onViewReceipt={handleViewReceipt}
            onFilter={handlePaymentFilter}
          />
        </TabsContent>

        <TabsContent value="bills" className="space-y-4">
          <Card variant="dashed">
            <CardHeader>
              <CardTitle>Bills (Coming Soon)</CardTitle>
              <CardDescription>
                Supplier bills and payables will be implemented in a future phase.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Placeholder: bill capture, approvals, and payment scheduling.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
