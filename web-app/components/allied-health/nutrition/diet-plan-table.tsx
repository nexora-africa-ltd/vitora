/**
 * Diet Plan Table Component
 * List view for browsing and managing diet plans
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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Plus, ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { EmptyState } from '@/components/shared/empty-state';
import { useDietPlans } from '@/lib/hooks/use-nutrition';
import {
  DIET_PLAN_STATUS_CONFIG,
  type DietPlanStatus,
  type DietPlanListParams,
} from '@/lib/types/nutrition';

interface DietPlanTableProps {
  /** Pre-filter by consultation ID */
  consultationId?: number;
  /** Pre-filter by patient ID */
  patientId?: number;
  /** Hide the "New Diet Plan" button */
  hideCreateButton?: boolean;
  /** Initial params */
  initialParams?: DietPlanListParams;
}

export function DietPlanTable({
  consultationId,
  patientId,
  hideCreateButton = false,
  initialParams,
}: DietPlanTableProps) {
  const router = useRouter();
  const [params, setParams] = useState<DietPlanListParams>({
    page: 1,
    page_size: 20,
    consultation_id: consultationId,
    patient_id: patientId,
    ...initialParams,
  });
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, error } = useDietPlans(params);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams((prev) => ({ ...prev, search: searchTerm, page: 1 }));
  };

  const handleStatusFilter = (status: string) => {
    setParams((prev) => ({
      ...prev,
      status: status === 'all' ? undefined : (status as DietPlanStatus),
      page: 1,
    }));
  };

  const handleRowClick = (planId: number) => {
    router.push(`/allied-health/nutrition/diet-plans/${planId}`);
  };

  if (error) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load diet plans: {error.message}
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
              placeholder="Search diet plans, patients..."
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
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="ON_HOLD">On Hold</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
            </SelectContent>
          </Select>

          {!hideCreateButton && (
            <Button
              onClick={() => {
                const newUrl = consultationId
                  ? `/allied-health/nutrition/diet-plans/new?consultation_id=${consultationId}`
                  : '/allied-health/nutrition/diet-plans/new';
                router.push(newUrl);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">New Diet Plan</span>
              <span className="sm:hidden">New</span>
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : !data || data.results.length === 0 ? (
        <EmptyState
          title="No diet plans found"
          description="No diet plans match your criteria"
          action={
            !hideCreateButton
              ? {
                  label: 'Create Diet Plan',
                  onClick: () =>
                    router.push(
                      consultationId
                        ? `/allied-health/nutrition/diet-plans/new?consultation_id=${consultationId}`
                        : '/allied-health/nutrition/diet-plans/new'
                    ),
                }
              : undefined
          }
        />
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden md:table-cell">Calories</TableHead>
                  <TableHead className="hidden sm:table-cell">Start Date</TableHead>
                  <TableHead className="hidden lg:table-cell">End Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((plan) => (
                  <TableRow
                    key={plan.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(plan.id)}
                  >
                    <TableCell className="font-mono text-sm">
                      {plan.plan_number}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{plan.patient_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {plan.patient_mrn}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {plan.name}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {format(parseISO(plan.start_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {plan.end_date
                        ? format(parseISO(plan.end_date), 'MMM d, yyyy')
                        : 'Ongoing'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          DIET_PLAN_STATUS_CONFIG[plan.status]?.className
                        }
                      >
                        {DIET_PLAN_STATUS_CONFIG[plan.status]?.label ||
                          plan.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {data.results.length} of {data.count} diet plans
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
