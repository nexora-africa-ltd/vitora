/**
 * Social Work Case Table
 * List view for social work cases
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
import { Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { EmptyState } from '@/components/shared/empty-state';
import { useSWCases } from '@/lib/hooks/use-social-work';
import type { SWCaseListItem, SWCaseListParams } from '@/lib/types/social-work';

const statusConfig: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'bg-blue-100 text-blue-800' },
  ACTIVE: { label: 'Active', className: 'bg-green-100 text-green-800' },
  ON_HOLD: { label: 'On Hold', className: 'bg-yellow-100 text-yellow-800' },
  CLOSED: { label: 'Closed', className: 'bg-gray-100 text-gray-800' },
  TRANSFERRED: { label: 'Transferred', className: 'bg-purple-100 text-purple-800' },
};

const urgencyConfig: Record<string, { label: string; className: string }> = {
  LOW: { label: 'Low', className: 'bg-green-100 text-green-800' },
  MEDIUM: { label: 'Medium', className: 'bg-yellow-100 text-yellow-800' },
  HIGH: { label: 'High', className: 'bg-orange-100 text-orange-800' },
  CRITICAL: { label: 'Critical', className: 'bg-red-100 text-red-800' },
};

interface SWCaseTableProps {
  initialParams?: SWCaseListParams;
}

export function SWCaseTable({ initialParams }: SWCaseTableProps) {
  const router = useRouter();
  const [params, setParams] = useState<SWCaseListParams>({
    page: 1,
    page_size: 20,
    ...initialParams,
  });
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, error } = useSWCases(params);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams((prev) => ({ ...prev, search: searchTerm, page: 1 }));
  };

  const handleStatusFilter = (status: string) => {
    setParams((prev) => ({
      ...prev,
      status: status === 'all' ? undefined : (status as SWCaseListItem['status']),
      page: 1,
    }));
  };

  const handleRowClick = (swCase: SWCaseListItem) => {
    router.push(`/allied-health/social-work/cases/${swCase.id}`);
  };

  if (error) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load cases: {error.message}
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
              placeholder="Search cases, patients..."
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
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="ON_HOLD">On Hold</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={() => router.push('/allied-health/social-work/cases/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Case
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
          title="No cases found"
          description="No social work cases match your criteria"
          action={{
            label: 'Create Case',
            onClick: () => router.push('/allied-health/social-work/cases/new'),
          }}
        />
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Social Worker</TableHead>
                  <TableHead>Urgency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((swCase) => (
                  <TableRow
                    key={swCase.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(swCase)}
                  >
                    <TableCell className="font-mono text-sm">
                      {swCase.case_number}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{swCase.patient_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {swCase.patient_mrn}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">
                      {swCase.referral_reason.toLowerCase().replace('_', ' ')}
                    </TableCell>
                    <TableCell>
                      {swCase.assigned_worker_name || (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={urgencyConfig[swCase.urgency]?.className}
                      >
                        {urgencyConfig[swCase.urgency]?.label || swCase.urgency}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusConfig[swCase.status]?.className}
                      >
                        {statusConfig[swCase.status]?.label || swCase.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(parseISO(swCase.opened_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {swCase.notes_count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {data.results.length} of {data.count} cases
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!data.previous}
                onClick={() =>
                  setParams((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))
                }
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.next}
                onClick={() =>
                  setParams((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))
                }
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
