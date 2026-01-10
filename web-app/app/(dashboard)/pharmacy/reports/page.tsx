/**
 * Pharmacy Reports Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * Main reports page with tabs for different report types:
 * - Stock Summary
 * - Expiry Report
 * - Dispensing Report
 * - Stock Movement
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Package, Clock, Activity, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StockSummaryReport } from '@/components/pharmacy/reports/stock-summary-report';
import { ExpiryReport } from '@/components/pharmacy/reports/expiry-report';
import { DispensingReport } from '@/components/pharmacy/reports/dispensing-report';
import { StockMovementReport } from '@/components/pharmacy/reports/stock-movement-report';

export default function PharmacyReportsPage() {
  const [activeTab, setActiveTab] = useState('stock-summary');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/pharmacy">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pharmacy Reports</h1>
            <p className="text-muted-foreground">
              View and export inventory and dispensing reports
            </p>
          </div>
        </div>
      </div>

      {/* Reports Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="stock-summary" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Stock Summary</span>
            <span className="sm:hidden">Stock</span>
          </TabsTrigger>
          <TabsTrigger value="expiry" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Expiry Report</span>
            <span className="sm:hidden">Expiry</span>
          </TabsTrigger>
          <TabsTrigger value="dispensing" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Dispensing Report</span>
            <span className="sm:hidden">Dispensing</span>
          </TabsTrigger>
          <TabsTrigger value="movement" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Stock Movement</span>
            <span className="sm:hidden">Movement</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock-summary">
          <StockSummaryReport />
        </TabsContent>

        <TabsContent value="expiry">
          <ExpiryReport />
        </TabsContent>

        <TabsContent value="dispensing">
          <DispensingReport />
        </TabsContent>

        <TabsContent value="movement">
          <StockMovementReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
