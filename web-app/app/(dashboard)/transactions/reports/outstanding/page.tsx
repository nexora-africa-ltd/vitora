/**
 * Outstanding Invoices Report Page
 * Shows overdue and outstanding invoice balances
 */
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
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
  ArrowLeft,
  Download,
  RefreshCw,
  Search,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/format';
import { useOutstandingBalances } from '@/lib/hooks/billing';

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function OutstandingInvoicesPage() {
  const [searchTerm, setSearchTerm] = React.useState('');
  const { data: balances, isLoading, refetch } = useOutstandingBalances();

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const outstandingList = balances || [];
  const filteredList = outstandingList.filter(
    (item) =>
      item.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.invoice_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalOutstanding = outstandingList.reduce(
    (sum, item) => sum + parseFloat(item.balance_due),
    0
  );
  const overdueCount = outstandingList.filter((item) => item.days_overdue > 0).length;
  const criticalCount = outstandingList.filter((item) => item.days_overdue > 30).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/transactions/reports">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Outstanding Invoices</h1>
          <p className="text-muted-foreground">
            Review unpaid and overdue invoice balances
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(totalOutstanding)}
            </div>
            <p className="text-xs text-muted-foreground">
              {outstandingList.length} invoices
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {overdueCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Past due date
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Critical (&gt;30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {criticalCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Need immediate attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(outstandingList.length > 0 ? totalOutstanding / outstandingList.length : 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Per invoice
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by patient or invoice..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Outstanding Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Outstanding Balances</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No outstanding invoices found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Invoice Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredList.map((item) => (
                  <TableRow key={item.invoice_id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/transactions/invoices/${item.invoice_id}`}
                        className="hover:underline"
                      >
                        {item.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{item.patient_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.patient_mrn}
                      </div>
                    </TableCell>
                    <TableCell>{item.invoice_date}</TableCell>
                    <TableCell>{item.due_date}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(parseFloat(item.total_amount))}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {formatCurrency(parseFloat(item.amount_paid))}
                    </TableCell>
                    <TableCell className="text-right font-medium text-amber-600">
                      {formatCurrency(parseFloat(item.balance_due))}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={item.status === 'OVERDUE' ? 'destructive' : 'secondary'}
                        >
                          {item.status}
                        </Badge>
                        {item.days_overdue > 0 && (
                          <span className="text-xs text-destructive flex items-center">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {item.days_overdue} days overdue
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/transactions/invoices/${item.invoice_id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
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
