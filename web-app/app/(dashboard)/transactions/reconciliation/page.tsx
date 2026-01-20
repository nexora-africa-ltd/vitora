/**
 * Billing Reconciliation Dashboard
 * Shows unbilled services and billing discrepancies
 */
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  FileWarning,
  ClipboardList,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/format';
import { useUnbilledServices, useBillingDiscrepancies } from '@/lib/hooks/billing';

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function ReconciliationPage() {
  const { data: unbilledServices = [], isLoading: unbilledLoading, refetch: refetchUnbilled } = useUnbilledServices();
  const { data: discrepancies = [], isLoading: discrepanciesLoading, refetch: refetchDiscrepancies } = useBillingDiscrepancies();

  const isLoading = unbilledLoading || discrepanciesLoading;

  const handleRefresh = () => {
    refetchUnbilled();
    refetchDiscrepancies();
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const totalUnbilled = unbilledServices.reduce(
    (sum, s) => sum + parseFloat(s.total_amount || '0'),
    0
  );
  const totalDiscrepancy = discrepancies.reduce(
    (sum, d) => sum + parseFloat(d.discrepancy || '0'),
    0
  );
  const totalServicesCount = unbilledServices.reduce(
    (sum, s) => sum + (s.services_count || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reconciliation</h1>
          <p className="text-muted-foreground">
            Review unbilled services and billing discrepancies
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unbilled Services
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalServicesCount}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(totalUnbilled)} total value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Discrepancies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {discrepancies.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(totalDiscrepancy)} difference
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Departments Affected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {unbilledServices.length}
            </div>
            <p className="text-xs text-muted-foreground">
              with unbilled services
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Action Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">
              {totalServicesCount + discrepancies.length}
            </div>
            <p className="text-xs text-muted-foreground">
              items need attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="unbilled">
        <TabsList>
          <TabsTrigger value="unbilled">
            <ClipboardList className="h-4 w-4 mr-2" />
            Unbilled Services
          </TabsTrigger>
          <TabsTrigger value="discrepancies">
            <FileWarning className="h-4 w-4 mr-2" />
            Discrepancies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unbilled" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Unbilled Services by Department</CardTitle>
            </CardHeader>
            <CardContent>
              {unbilledServices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  No unbilled services found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Services</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unbilledServices.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          {item.department}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{item.services_count}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(parseFloat(item.total_amount))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm">
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discrepancies" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Billing Discrepancies</CardTitle>
                <Link href="/transactions/reconciliation/discrepancies">
                  <Button variant="outline" size="sm">
                    View All
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {discrepancies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  No discrepancies found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Billed</TableHead>
                      <TableHead className="text-right">Discrepancy</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discrepancies.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          {item.patient_name}
                        </TableCell>
                        <TableCell>{item.service_name}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(parseFloat(item.expected_amount))}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(parseFloat(item.billed_amount))}
                        </TableCell>
                        <TableCell className="text-right text-destructive">
                          {formatCurrency(parseFloat(item.discrepancy))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm">
                            Resolve
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
