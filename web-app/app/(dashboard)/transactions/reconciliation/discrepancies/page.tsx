/**
 * Billing Discrepancies Report Page
 * Detailed view of billing discrepancies
 */
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { ArrowLeft, Download, RefreshCw, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/format';
import { useBillingDiscrepancies } from '@/lib/hooks/billing';
import { Alert, AlertDescription } from '@/components/ui/alert';

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid md:grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function DiscrepanciesPage() {
  const { data: discrepancies, isLoading, error, refetch } = useBillingDiscrepancies();

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load discrepancies. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  const items = discrepancies || [];
  const totalDiscrepancy = items.reduce(
    (sum, d) => sum + parseFloat(d.discrepancy),
    0
  );
  const pendingCount = items.filter((d) => d.status === 'PENDING').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/transactions/reconciliation">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Discrepancy Report</h1>
          <p className="text-muted-foreground">
            Review and resolve billing discrepancies
          </p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Discrepancies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(totalDiscrepancy)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Resolution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Discrepancies Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Discrepancies</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No discrepancies found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Discrepancy</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.date}</TableCell>
                    <TableCell>
                      <div className="font-medium">{item.patient_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.patient_mrn}
                      </div>
                    </TableCell>
                    <TableCell>{item.service_name}</TableCell>
                    <TableCell className="text-right">
                      KES {parseFloat(item.expected_amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      KES {parseFloat(item.billed_amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-destructive font-medium">
                      KES {parseFloat(item.discrepancy).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={item.status === 'RESOLVED' ? 'default' : 'secondary'}
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.status === 'PENDING' && (
                        <Button variant="outline" size="sm">
                          Resolve
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
