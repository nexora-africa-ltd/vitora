/**
 * Stock Summary Report Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Shows current inventory levels by drug with batch breakdown
 */

'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Package,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpPopover } from '@/components/shared/help-popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useStockSummaryReport } from '@/lib/hooks/use-pharmacy';
import { useToast } from '@/lib/hooks/use-toast';
import { cn } from '@/lib/utils/cn';
import { printStockSummaryReport } from '@/lib/documents/print-pharmacy-reports';
import type { StockSummaryItem } from '@/lib/types/pharmacy';

export function StockSummaryReport() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [expandedDrugs, setExpandedDrugs] = useState<Set<number>>(new Set());

  const { data: reportData, isLoading, error } = useStockSummaryReport();

  const toggleDrugExpanded = (drugId: number) => {
    const newExpanded = new Set(expandedDrugs);
    if (newExpanded.has(drugId)) {
      newExpanded.delete(drugId);
    } else {
      newExpanded.add(drugId);
    }
    setExpandedDrugs(newExpanded);
  };

  // Filter data - reportData has a results array wrapper
  const filteredData = (reportData?.results || []).filter((item: StockSummaryItem) => {
    const matchesSearch = item.drug_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLowStock = !showLowStockOnly || item.is_below_reorder;
    return matchesSearch && matchesLowStock;
  });

  const handleExport = () => {
    try {
      const csvContent = [
        ['Drug Name', 'Total Quantity', 'Reorder Level', 'Status', 'Batches'].join(','),
        ...filteredData.map((item: StockSummaryItem) => [
          `"${item.drug_name}"`,
          item.total_quantity,
          item.reorder_level,
          item.is_below_reorder ? 'Below Reorder' : 'OK',
          item.batches.length,
        ].join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `stock-summary-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Export successful',
        description: 'Stock summary report has been exported to CSV.',
      });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Failed to export report.',
        variant: 'destructive',
      });
    }
  };

  const handlePrint = () => {
    printStockSummaryReport({
      items: filteredData,
      showLowStockOnly,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-destructive">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p>Failed to load stock summary report</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Package className="h-5 w-5" />
            Stock Summary
            <HelpPopover content="Current inventory levels by drug with batch breakdown. Expand rows to view individual batch details." />
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search drugs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="category-filter">Category</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id="category-filter" data-testid="category-filter" className="w-[150px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="tablet">Tablets</SelectItem>
                <SelectItem value="capsule">Capsules</SelectItem>
                <SelectItem value="syrup">Syrups</SelectItem>
                <SelectItem value="injection">Injections</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="low-stock-only"
              data-testid="low-stock-only"
              checked={showLowStockOnly}
              onCheckedChange={(checked) => setShowLowStockOnly(checked === true)}
            />
            <Label htmlFor="low-stock-only">Below Reorder Level Only</Label>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground">Total Drugs</p>
            <p className="text-2xl font-bold">{filteredData.length}</p>
          </div>
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-sm text-amber-700 dark:text-amber-400">Below Reorder</p>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
              {filteredData.filter((d: StockSummaryItem) => d.is_below_reorder).length}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">OOS</p>
            <p className="text-2xl font-bold text-destructive">
              {filteredData.filter((d: StockSummaryItem) => d.total_quantity === 0).length}
            </p>
          </div>
        </div>

        {/* Desktop Table (hidden on mobile) */}
        <div className="hidden md:block rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Drug Name</TableHead>
                <TableHead className="text-right">Total Qty</TableHead>
                <TableHead className="text-right">Reorder Level</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Batches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No drugs found
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((item: StockSummaryItem) => (
                  <React.Fragment key={item.drug_id}>
                    <TableRow
                      className={cn(
                        'cursor-pointer hover:bg-muted/50',
                        item.is_below_reorder && 'bg-amber-500/5',
                        item.total_quantity === 0 && 'bg-destructive/5'
                      )}
                      onClick={() => toggleDrugExpanded(item.drug_id)}
                    >
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleDrugExpanded(item.drug_id);
                          }}
                          aria-expanded={expandedDrugs.has(item.drug_id)}
                          aria-label={expandedDrugs.has(item.drug_id) ? 'Collapse batches' : 'Expand batches'}
                        >
                          {expandedDrugs.has(item.drug_id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{item.drug_name}</TableCell>
                      <TableCell className="text-right">{item.total_quantity}</TableCell>
                      <TableCell className="text-right">{item.reorder_level}</TableCell>
                      <TableCell>
                        {item.total_quantity === 0 ? (
                          <Badge variant="destructive">OOS</Badge>
                        ) : item.is_below_reorder ? (
                          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Below Reorder</Badge>
                        ) : (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">OK</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{item.batches.length}</TableCell>
                    </TableRow>
                    {expandedDrugs.has(item.drug_id) && (
                      <TableRow className="bg-muted/30" data-testid={`batch-details-${item.drug_id}`}>
                        <TableCell colSpan={6} className="p-0">
                          {item.batches.length > 0 ? (
                            <div className="p-4 pl-12">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Batch Number</TableHead>
                                    <TableHead className="text-right">Quantity</TableHead>
                                    <TableHead>Expiry Date</TableHead>
                                    <TableHead>Days to Expiry</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {item.batches.map((batch) => (
                                    <TableRow key={batch.batch_number}>
                                      <TableCell className="font-mono text-sm">
                                        {batch.batch_number}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {batch.quantity_available}
                                      </TableCell>
                                      <TableCell>{batch.expiry_date}</TableCell>
                                      <TableCell>
                                        <span
                                          className={cn(
                                            batch.days_to_expiry <= 30
                                              ? 'text-red-600 font-medium'
                                              : batch.days_to_expiry <= 90
                                              ? 'text-yellow-600'
                                              : 'text-green-600'
                                          )}
                                        >
                                          {batch.days_to_expiry} days
                                        </span>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          ) : (
                            <div className="p-4 pl-12 text-muted-foreground text-sm">
                              No batches available
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards (hidden on desktop) */}
        <div className="md:hidden space-y-3">
          {filteredData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No drugs found
            </div>
          ) : (
            filteredData.map((item: StockSummaryItem) => (
              <div
                key={item.drug_id}
                className={cn(
                  'rounded-lg border p-4 space-y-3',
                  item.is_below_reorder && 'border-amber-500/50 bg-amber-500/5',
                  item.total_quantity === 0 && 'border-destructive/50 bg-destructive/5'
                )}
              >
                <div
                  className="flex justify-between items-start cursor-pointer"
                  onClick={() => toggleDrugExpanded(item.drug_id)}
                >
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDrugExpanded(item.drug_id);
                      }}
                    >
                      {expandedDrugs.has(item.drug_id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                    <p className="font-medium">{item.drug_name}</p>
                  </div>
                  {item.total_quantity === 0 ? (
                    <Badge variant="destructive">OOS</Badge>
                  ) : item.is_below_reorder ? (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Below Reorder</Badge>
                  ) : (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">OK</Badge>
                  )}
                </div>
                <div className="flex justify-between text-sm pl-8">
                  <span className="text-muted-foreground">
                    Qty: {item.total_quantity} / Reorder: {item.reorder_level}
                  </span>
                  <span>{item.batches.length} batch(es)</span>
                </div>
                {expandedDrugs.has(item.drug_id) && item.batches.length > 0 && (
                  <div className="pl-8 pt-2 space-y-2 border-t">
                    {item.batches.map((batch) => (
                      <div key={batch.batch_number} className="flex justify-between text-sm">
                        <div>
                          <span className="font-mono">{batch.batch_number}</span>
                          <span className="text-muted-foreground ml-2">
                            Exp: {batch.expiry_date}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Qty: {batch.quantity_available}</span>
                          <span
                            className={cn(
                              'text-xs',
                              batch.days_to_expiry <= 30
                                ? 'text-red-600 font-medium'
                                : batch.days_to_expiry <= 90
                                ? 'text-yellow-600'
                                : 'text-green-600'
                            )}
                          >
                            {batch.days_to_expiry}d
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {expandedDrugs.has(item.drug_id) && item.batches.length === 0 && (
                  <div className="pl-8 pt-2 text-sm text-muted-foreground border-t">
                    No batches available
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
