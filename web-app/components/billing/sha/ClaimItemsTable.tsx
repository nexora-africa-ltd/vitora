/**
 * Claim Items Table Component
 * Displays claim items with coverage type indicators (PFMS support)
 *
 * SHA Integration Checklist Item #13:
 * Shows which coverage (SHA/PFMS) applies to each item
 */
'use client';

import React from 'react';
import { Building2, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/utils/format';
import type { ClaimItem, CoverageType } from '@/lib/types/sha';
import { COVERAGE_TYPE_LABELS } from '@/lib/types/sha';
import { format, parseISO } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface ClaimItemsTableProps {
  items: ClaimItem[];
  showCoverageType?: boolean;
  className?: string;
}

// ============================================================================
// Coverage Badge Component
// ============================================================================

function CoverageBadge({ coverageType }: { coverageType: CoverageType }) {
  const config: Record<CoverageType, {
    icon: React.ReactNode;
    label: string;
    className: string;
  }> = {
    sha: {
      icon: <Shield className="h-3 w-3" />,
      label: 'SHA',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
    },
    pfms: {
      icon: <Building2 className="h-3 w-3" />,
      label: 'PFMS',
      className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    },
    both: {
      icon: <Shield className="h-3 w-3" />,
      label: 'SHA+PFMS',
      className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
    },
  };

  const { icon, label, className } = config[coverageType] || config.sha;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className={className}>
            {icon}
            <span className="ml-1">{label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{COVERAGE_TYPE_LABELS[coverageType]}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================================
// Item Status Badge
// ============================================================================

function ItemStatusBadge({ status }: { status: ClaimItem['status'] }) {
  const config: Record<ClaimItem['status'], {
    label: string;
    className: string;
  }> = {
    pending: {
      label: 'Pending',
      className: 'bg-yellow-100 text-yellow-800',
    },
    approved: {
      label: 'Approved',
      className: 'bg-green-100 text-green-800',
    },
    rejected: {
      label: 'Rejected',
      className: 'bg-red-100 text-red-800',
    },
    adjusted: {
      label: 'Adjusted',
      className: 'bg-orange-100 text-orange-800',
    },
  };

  const { label, className } = config[status] || config.pending;

  return (
    <Badge variant="secondary" className={className}>
      {label}
    </Badge>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ClaimItemsTable({
  items,
  showCoverageType = true,
  className,
}: ClaimItemsTableProps) {
  if (!items || items.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Claim Items</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No items in this claim.</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate totals
  const totalClaimed = items.reduce(
    (sum, item) => sum + parseFloat(item.claimed_amount || '0'),
    0
  );
  const totalApproved = items.reduce(
    (sum, item) => sum + parseFloat(item.approved_amount || '0'),
    0
  );

  // Check if any items use PFMS
  const hasPFMS = items.some(item => item.coverage_type !== 'sha');

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Claim Items ({items.length})</span>
          {hasPFMS && showCoverageType && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Building2 className="h-3 w-3 mr-1" />
              Dual Coverage (SHA + PFMS)
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Description</TableHead>
              {showCoverageType && <TableHead>Coverage</TableHead>}
              <TableHead>Tariff</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Claimed</TableHead>
              <TableHead className="text-right">Approved</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell>
                  <div>
                    <span className="font-medium">{item.description}</span>
                    {item.service_date && (
                      <div className="text-xs text-muted-foreground">
                        {format(parseISO(item.service_date), 'MMM d, yyyy')}
                      </div>
                    )}
                  </div>
                </TableCell>
                {showCoverageType && (
                  <TableCell>
                    <CoverageBadge coverageType={item.coverage_type} />
                  </TableCell>
                )}
                <TableCell className="font-mono text-sm">
                  {item.tariff_code || '—'}
                </TableCell>
                <TableCell className="text-right">
                  {item.quantity}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(parseFloat(item.unit_price || '0'))}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(parseFloat(item.claimed_amount || '0'))}
                </TableCell>
                <TableCell className="text-right">
                  {item.approved_amount ? (
                    <span className="text-green-600 font-medium">
                      {formatCurrency(parseFloat(item.approved_amount))}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  <ItemStatusBadge status={item.status} />
                  {item.rejection_reason && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-red-500 ml-1 cursor-help">
                            ⓘ
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">{item.rejection_reason}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Totals */}
        <div className="mt-4 flex justify-end gap-8 text-sm">
          <div className="text-right">
            <span className="text-muted-foreground">Total Claimed:</span>
            <span className="ml-2 font-bold">{formatCurrency(totalClaimed)}</span>
          </div>
          {totalApproved > 0 && (
            <div className="text-right">
              <span className="text-muted-foreground">Total Approved:</span>
              <span className="ml-2 font-bold text-green-600">
                {formatCurrency(totalApproved)}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ClaimItemsTable;
