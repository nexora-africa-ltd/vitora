/**
 * Social Work Referral Table
 * List view for social work referrals
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { EmptyState } from '@/components/shared/empty-state';
import { useSWReferrals } from '@/lib/hooks/use-social-work';
import type { SWReferralListItem, SWReferralListParams } from '@/lib/types/social-work';

const statusConfig: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800' },
  ACCEPTED: { label: 'Accepted', className: 'bg-blue-100 text-blue-800' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-purple-100 text-purple-800' },
  COMPLETED: { label: 'Completed', className: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Cancelled', className: 'bg-gray-100 text-gray-800' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
};

const urgencyConfig: Record<string, { label: string; className: string }> = {
  EMERGENCY: { label: 'Emergency', className: 'bg-red-100 text-red-800' },
  URGENT: { label: 'Urgent', className: 'bg-orange-100 text-orange-800' },
  ROUTINE: { label: 'Routine', className: 'bg-gray-100 text-gray-800' },
};

interface SWReferralTableProps {
  initialParams?: SWReferralListParams;
}

export function SWReferralTable({ initialParams }: SWReferralTableProps) {
  const router = useRouter();
  const [params, setParams] = useState<SWReferralListParams>({
    page: 1,
    page_size: 20,
    ...initialParams,
  });
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, error } = useSWReferrals(params);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams((prev) => ({ ...prev, search: searchTerm, page: 1 }));
  };

  const handleStatusFilter = (status: string) => {
    setParams((prev) => ({
      ...prev,
      status: status === 'all' ? undefined : (status as SWReferralListItem['status']),
      page: 1,
    }));
  };

  const handleRowClick = (referral: SWReferralListItem) => {
    router.push(`/allied-health/social-work/referrals/${referral.id}`);
  };

  if (error) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load referrals: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search referrals, patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        <div className="flex gap-2">
          <Select onValueChange={handleStatusFilter} defaultValue="all">
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="ACCEPTED">Accepted</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={() => router.push('/allied-health/social-work/referrals/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Referral
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : !data || data.results.length === 0 ? (
        <EmptyState
          title="No referrals found"
          description="No social work referrals match your criteria"
          action={{
            label: 'Create Referral',
            onClick: () => router.push('/allied-health/social-work/referrals/new'),
          }}
        />
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referral #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Urgency</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((referral) => (
                  <TableRow
                    key={referral.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(referral)}
                  >
                    <TableCell className="font-mono text-sm">
                      {referral.referral_number}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{referral.patient_name}</p>
                        <p className="text-xs text-muted-foreground">{referral.patient_mrn}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {referral.urgency === 'CRITICAL' && (
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        )}
                        {referral.reason?.replace(/_/g, ' ') || 'Not specified'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={urgencyConfig[referral.urgency]?.className || 'bg-gray-100'}>
                        {urgencyConfig[referral.urgency]?.label || referral.urgency}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(parseISO(referral.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusConfig[referral.status]?.className || 'bg-gray-100'}>
                        {statusConfig[referral.status]?.label || referral.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data.count > (params.page_size || 20) && (
            <div className="flex items-center justify-between px-2">
              <p className="text-sm text-muted-foreground">
                Showing {((params.page || 1) - 1) * (params.page_size || 20) + 1} to{' '}
                {Math.min((params.page || 1) * (params.page_size || 20), data.count)} of {data.count}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.previous}
                  onClick={() => setParams((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.next}
                  onClick={() => setParams((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
