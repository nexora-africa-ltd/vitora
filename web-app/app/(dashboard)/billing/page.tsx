/**
 * Billing Dashboard Page
 * Main billing overview with daily collections and quick actions
 */
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, FileText, CreditCard } from 'lucide-react';
import { BillingDashboard } from '@/components/billing/BillingDashboard';
import { InvoiceList } from '@/components/billing/InvoiceList';
import { PaymentList } from '@/components/billing/PaymentList';
import {
  useInvoices,
  usePayments,
  useDailyCollectionReport,
} from '@/lib/hooks/billing';
import { useBillingStore } from '@/lib/stores/billing';
import type { Invoice, Payment } from '@/lib/types/billing';

export default function BillingPage() {
  const router = useRouter();
  const { activeTab, setActiveTab } = useBillingStore();

  // Fetch data
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices();
  const { data: paymentsData, isLoading: paymentsLoading } = usePayments();
  const today = new Date().toISOString().split('T')[0] as string;
  const { data: dailyReport, isLoading: reportLoading } = useDailyCollectionReport(today);

  // Handlers
  const handleCreateInvoice = () => {
    router.push('/billing/invoices/new');
  };

  const handleSelectInvoice = (invoice: Invoice) => {
    router.push(`/billing/invoices/${invoice.id}`);
  };

  const handleViewReceipt = (payment: Payment) => {
    router.push(`/billing/receipts/${payment.id}`);
  };

  const handleDateChange = (date: string) => {
    // Could fetch report for different date
    console.log('Date changed:', date);
  };

  // Calculate pending/overdue counts
  const pendingCount = invoicesData?.results?.filter(
    (inv) => inv.status === 'PENDING'
  ).length || 0;

  const overdueCount = invoicesData?.results?.filter(
    (inv) => inv.status === 'OVERDUE'
  ).length || 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">
            Manage invoices, payments, and financial reports
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCreateInvoice}>
            <Plus className="h-4 w-4 mr-2" />
            New Invoice
          </Button>
        </div>
      </div>

      {/* Dashboard Overview */}
      <BillingDashboard
        dailyReport={dailyReport || null}
        isLoading={reportLoading}
        pendingInvoicesCount={pendingCount}
        overdueInvoicesCount={overdueCount}
        onDateChange={handleDateChange}
      />

      {/* Tabs for Invoices and Payments */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'invoices' | 'payments')} className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices" className="gap-2">
            <FileText className="h-4 w-4" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Payments
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
      </Tabs>
    </div>
  );
}
