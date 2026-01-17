/**
 * SHA Claims Page
 * Displays list of SHA claims with filtering and status tracking
 */
'use client';

import React, { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  Download,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils/format';
import { useClaims } from '@/lib/hooks/use-sha';
import { ClaimsStatusChart } from '@/components/widgets';
import { ClaimStatusBadge } from '@/components/billing/sha/ClaimComponents';
import type { ClaimStatus, Claim } from '@/lib/types/sha';
import { format, parseISO } from 'date-fns';

// ============================================================================
// Stats Card Component
// ============================================================================

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

function StatsCard({ 
  title, 
  value, 
  description, 
  icon, 
  trend, 
  trendValue,
  className 
}: StatsCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && trendValue && (
          <p className={`text-xs mt-1 ${
            trend === 'up' ? 'text-green-600' : 
            trend === 'down' ? 'text-red-600' : 
            'text-gray-600'
          }`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Claims Filter Component
// ============================================================================

interface ClaimsFilterProps {
  status: string;
  onStatusChange: (status: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

function ClaimsFilter({ 
  status, 
  onStatusChange, 
  searchQuery, 
  onSearchChange 
}: ClaimsFilterProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by claim number, patient, or reference..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[180px]">
          <Filter className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Filter by status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Claims</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="submitted">Submitted</SelectItem>
          <SelectItem value="processing">Processing</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
          <SelectItem value="paid">Paid</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================================================
// Claims Table Component
// ============================================================================

interface ClaimsTableProps {
  claims: Claim[];
  isLoading: boolean;
  onClaimClick: (claim: Claim) => void;
}

function ClaimsTable({ claims, isLoading, onClaimClick }: ClaimsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="text-right space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/20">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground">No Claims Found</h3>
        <p className="text-sm text-muted-foreground mt-1">
          No SHA claims match your current filters.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Claim</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="w-8"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {claims.map((claim) => (
          <TableRow 
            key={claim.id} 
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => onClaimClick(claim)}
          >
            <TableCell>
              <div className="space-y-1">
                <p className="font-medium font-mono text-sm">
                  {claim.claim_number || `#${claim.id}`}
                </p>
                {claim.sha_reference && (
                  <p className="text-xs text-muted-foreground font-mono">
                    Ref: {claim.sha_reference}
                  </p>
                )}
              </div>
            </TableCell>
            <TableCell>
              <div className="space-y-1">
                <p className="font-medium">{claim.patient_name || 'Unknown'}</p>
                <p className="text-xs text-muted-foreground">{claim.patient_mrn}</p>
              </div>
            </TableCell>
            <TableCell>
              <ClaimStatusBadge status={claim.status} />
            </TableCell>
            <TableCell className="text-right">
              <p className="font-medium">
                {formatCurrency(parseFloat(claim.total_amount))}
              </p>
              {claim.approved_amount && claim.status === 'approved' && (
                <p className="text-xs text-green-600">
                  Approved: {formatCurrency(parseFloat(claim.approved_amount))}
                </p>
              )}
            </TableCell>
            <TableCell>
              <p className="text-sm">
                {claim.submitted_at 
                  ? format(parseISO(claim.submitted_at), 'MMM d, yyyy')
                  : format(parseISO(claim.created_at), 'MMM d, yyyy')
                }
              </p>
              <p className="text-xs text-muted-foreground">
                {claim.submitted_at 
                  ? format(parseISO(claim.submitted_at), 'h:mm a')
                  : 'Not submitted'
                }
              </p>
            </TableCell>
            <TableCell>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function SHAClaimsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Fetch claims with filter
  const { data: claimsData, isLoading, refetch, isRefetching } = useClaims({
    status: statusFilter !== 'all' ? statusFilter as ClaimStatus : undefined,
  });

  const claims = claimsData?.results || [];
  
  // Calculate stats
  const stats = {
    total: claims.length,
    pending: claims.filter(c => ['pending', 'submitted', 'processing'].includes(c.status)).length,
    approved: claims.filter(c => c.status === 'approved').length,
    rejected: claims.filter(c => c.status === 'rejected').length,
    totalAmount: claims.reduce((sum, c) => sum + parseFloat(c.total_amount), 0),
    approvedAmount: claims
      .filter(c => c.approved_amount)
      .reduce((sum, c) => sum + parseFloat(c.approved_amount || '0'), 0),
  };

  // Prepare data for claims status chart
  const claimsStatusData = useMemo(() => {
    const statusCounts = new Map<ClaimStatus, { count: number; amount: number }>();
    claims.forEach((claim) => {
      const existing = statusCounts.get(claim.status) || { count: 0, amount: 0 };
      statusCounts.set(claim.status, {
        count: existing.count + 1,
        amount: existing.amount + parseFloat(claim.total_amount),
      });
    });
    return Array.from(statusCounts.entries()).map(([status, data]) => ({
      status,
      count: data.count,
      amount: data.amount,
    }));
  }, [claims]);

  // Filter claims by search query
  const filteredClaims = claims.filter(claim => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (claim.claim_number?.toLowerCase().includes(query)) ||
      (claim.sha_reference?.toLowerCase().includes(query)) ||
      (claim.patient_name?.toLowerCase().includes(query)) ||
      (claim.patient_mrn?.toLowerCase().includes(query))
    );
  });

  const handleClaimClick = (claim: Claim) => {
    router.push(`/billing/sha-claims/${claim.id}`);
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    console.log('Export claims');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SHA Claims</h1>
          <p className="text-muted-foreground">
            Manage and track Social Health Authority insurance claims
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            {isRefetching ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleExport}>
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExport}>
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatsCard
          title="Total Claims"
          value={stats.total}
          description={`${formatCurrency(stats.totalAmount)} total value`}
          icon={<FileText className="h-4 w-4" />}
        />
        <StatsCard
          title="In Progress"
          value={stats.pending}
          description="Awaiting SHA response"
          icon={<Clock className="h-4 w-4" />}
          className="border-yellow-200 dark:border-yellow-800"
        />
        <StatsCard
          title="Approved"
          value={stats.approved}
          description={`${formatCurrency(stats.approvedAmount)} approved`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          className="border-green-200 dark:border-green-800"
        />
        <StatsCard
          title="Rejected"
          value={stats.rejected}
          description="Requires attention"
          icon={<XCircle className="h-4 w-4" />}
          className="border-red-200 dark:border-red-800"
        />
      </div>

      {/* Claims Status Distribution Chart */}
      {claims.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Claims by Status</CardTitle>
              <CardDescription>Distribution of claims by current status</CardDescription>
            </CardHeader>
            <CardContent>
              <ClaimsStatusChart data={claimsStatusData} showLegend />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Claims by Amount</CardTitle>
              <CardDescription>Value distribution by status</CardDescription>
            </CardHeader>
            <CardContent>
              <ClaimsStatusChart data={claimsStatusData} showLegend showByAmount />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Claims List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Claims List</CardTitle>
              <CardDescription>
                {filteredClaims.length} claim{filteredClaims.length !== 1 ? 's' : ''} found
              </CardDescription>
            </div>
            <ClaimsFilter
              status={statusFilter}
              onStatusChange={setStatusFilter}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>
        </CardHeader>
        <CardContent>
          <ClaimsTable
            claims={filteredClaims}
            isLoading={isLoading}
            onClaimClick={handleClaimClick}
          />
        </CardContent>
      </Card>
    </div>
  );
}
