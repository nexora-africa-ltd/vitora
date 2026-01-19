/**
 * Transactions Dashboard Page
 * Overview for invoices, payments, and bills
 */
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText, CreditCard, Receipt } from 'lucide-react';

import { BillingDashboard } from '@/components/billing/BillingDashboard';
import { InvoiceList } from '@/components/billing/InvoiceList';
import { PaymentList } from '@/components/billing/PaymentList';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDailyCollectionReport, useInvoices, usePayments } from '@/lib/hooks/billing';
import { useBillingStore } from '@/lib/stores/billing';
import type { Invoice, Payment } from '@/lib/types/billing';

export default function TransactionsPage() {
  const router = useRouter();
  const { activeTab, setActiveTab } = useBillingStore();

  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices();
  const { data: paymentsData, isLoading: paymentsLoading } = usePayments();

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
          />
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <PaymentList
            payments={paymentsData?.results || []}
            isLoading={paymentsLoading}
            onViewReceipt={handleViewReceipt}
          />
        </TabsContent>

        <TabsContent value="bills" className="space-y-4">
          <Card className="border-dashed border-2 border-muted-foreground/25">
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
