/**
 * Nutrition Consultation Table
 * List view for nutrition consultations
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
import { PriorityBadge } from '@/components/allied-health';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { EmptyState } from '@/components/shared/empty-state';
import { useNutritionConsultations } from '@/lib/hooks/use-nutrition';
import type {
  NutritionConsultationListItem,
  NutritionConsultationListParams,
} from '@/lib/types/nutrition';
import type { AlliedHealthPriority } from '@/lib/types/allied-health';

const statusConfig: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800' },
  SCHEDULED: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-purple-100 text-purple-800' },
  COMPLETED: { label: 'Completed', className: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Cancelled', className: 'bg-gray-100 text-gray-800' },
};

interface NutritionConsultationTableProps {
  initialParams?: NutritionConsultationListParams;
}

export function NutritionConsultationTable({ initialParams }: NutritionConsultationTableProps) {
  const router = useRouter();
  const [params, setParams] = useState<NutritionConsultationListParams>({
    page: 1,
    page_size: 20,
    ...initialParams,
  });
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, error } = useNutritionConsultations(params);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams((prev) => ({ ...prev, search: searchTerm, page: 1 }));
  };

  const handleStatusFilter = (status: string) => {
    setParams((prev) => ({
      ...prev,
      status: status === 'all' ? undefined : (status as NutritionConsultationListItem['status']),
      page: 1,
    }));
  };

  const handleRowClick = (consultation: NutritionConsultationListItem) => {
    router.push(`/allied-health/nutrition/consultations/${consultation.id}`);
  };

  if (error) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load consultations: {error.message}
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
              placeholder="Search consultations, patients..."
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
              <SelectItem value="SCHEDULED">Scheduled</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={() => router.push('/allied-health/nutrition/consultations/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Consultation
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
          title="No consultations found"
          description="No nutrition consultations match your criteria"
          action={{
            label: 'Create Consultation',
            onClick: () => router.push('/allied-health/nutrition/consultations/new'),
          }}
        />
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Dietitian</TableHead>
                  <TableHead>BMI</TableHead>
                  <TableHead>Nutrition Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((consultation) => (
                  <TableRow
                    key={consultation.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(consultation)}
                  >
                    <TableCell className="font-mono text-sm">
                      {consultation.consultation_number}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{consultation.patient_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {consultation.patient_mrn}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate capitalize">
                      {consultation.referral_reason.toLowerCase().replace('_', ' ')}
                    </TableCell>
                    <TableCell>
                      {consultation.dietitian_name || (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {consultation.bmi ? (
                        <span className="font-medium">{consultation.bmi}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {consultation.nutritional_status ? (
                        <Badge variant="outline">
                          {consultation.nutritional_status}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={consultation.priority} />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusConfig[consultation.status]?.className}
                      >
                        {statusConfig[consultation.status]?.label || consultation.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(parseISO(consultation.created_at), 'MMM d, yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {data.results.length} of {data.count} consultations
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
