/**
 * SHA Dependents View Component
 * Displays dependents linked to a principal SHA member
 *
 * Features:
 * - Lists all dependents under a principal member
 * - Shows eligibility status for each dependent
 * - Allows viewing dependent details
 */
'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  User,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ChevronRight,
  UserPlus,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { shaApi } from '@/lib/api/sha';
import type { SHAMember } from '@/lib/types/sha';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface DependentsViewProps {
  /** The principal SHA member to show dependents for */
  principalMember: SHAMember;
  /** Callback when a dependent is clicked */
  onDependentClick?: (dependent: SHAMember) => void;
  /** Whether to show the add dependent button */
  showAddButton?: boolean;
  /** Callback when add dependent is clicked */
  onAddDependent?: () => void;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Membership Type Badge
// ============================================================================

function MembershipTypeBadge({ type }: { type: string }) {
  const defaultItem = { label: 'Other', className: 'bg-gray-100 text-gray-800' };
  const config: Record<string, { label: string; className: string }> = {
    PRINCIPAL: { label: 'Principal', className: 'bg-blue-100 text-blue-800' },
    SPOUSE: { label: 'Spouse', className: 'bg-pink-100 text-pink-800' },
    CHILD: { label: 'Child', className: 'bg-green-100 text-green-800' },
    PARENT: { label: 'Parent', className: 'bg-amber-100 text-amber-800' },
    OTHER: defaultItem,
  };

  const item = config[type] ?? defaultItem;

  return (
    <Badge variant="secondary" className={item.className}>
      {item.label}
    </Badge>
  );
}

// ============================================================================
// Status Badge
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const defaultItem = {
    label: 'Inactive',
    icon: <XCircle className="h-3 w-3" />,
    className: 'bg-red-100 text-red-800',
  };
  const config: Record<string, {
    label: string;
    icon: React.ReactNode;
    className: string;
  }> = {
    ACTIVE: {
      label: 'Active',
      icon: <CheckCircle2 className="h-3 w-3" />,
      className: 'bg-green-100 text-green-800',
    },
    INACTIVE: defaultItem,
    PENDING_VERIFICATION: {
      label: 'Pending',
      icon: <Clock className="h-3 w-3" />,
      className: 'bg-yellow-100 text-yellow-800',
    },
    SUSPENDED: {
      label: 'Suspended',
      icon: <XCircle className="h-3 w-3" />,
      className: 'bg-orange-100 text-orange-800',
    },
  };

  const item = config[status] ?? defaultItem;

  return (
    <Badge variant="secondary" className={cn('flex items-center gap-1', item.className)}>
      {item.icon}
      {item.label}
    </Badge>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function DependentsViewSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-lg border">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyDependents({ onAddDependent }: { onAddDependent?: () => void }) {
  return (
    <div className="text-center py-8">
      <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">No Dependents</h3>
      <p className="text-sm text-muted-foreground mt-1">
        No dependents are currently linked to this member.
      </p>
      {onAddDependent && (
        <Button onClick={onAddDependent} className="mt-4">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Dependent
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DependentsView({
  principalMember,
  onDependentClick,
  showAddButton = true,
  onAddDependent,
  className,
}: DependentsViewProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch dependents
  const {
    data: dependentsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['sha-dependents', principalMember.id],
    queryFn: () => shaApi.getSHAMemberDependents(principalMember.id),
    enabled: principalMember.membership_type === 'PRINCIPAL',
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // If not a principal member, show info message
  if (principalMember.membership_type !== 'PRINCIPAL') {
    return (
      <Alert className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Not a Principal Member</AlertTitle>
        <AlertDescription>
          Dependents can only be viewed for principal members. This member is a{' '}
          {principalMember.membership_type?.toLowerCase() || 'dependent'}.
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return <DependentsViewSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Loading Dependents</AlertTitle>
        <AlertDescription>
          Unable to load dependents. Please try again.
          <Button variant="link" onClick={handleRefresh} className="px-2">
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const dependents = dependentsData?.results || [];

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Dependents
          </CardTitle>
          <CardDescription>
            {dependents.length} dependent{dependents.length !== 1 ? 's' : ''} linked to SHA member
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh dependents</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {showAddButton && onAddDependent && (
            <Button size="sm" onClick={onAddDependent}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {dependents.length === 0 ? (
          <EmptyDependents onAddDependent={onAddDependent} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>SHA Number</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Coverage End</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dependents.map((dependent) => (
                <TableRow
                  key={dependent.id}
                  className={cn(
                    onDependentClick && 'cursor-pointer hover:bg-muted/50'
                  )}
                  onClick={() => onDependentClick?.(dependent)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="font-medium">
                          {dependent.patient_name || 'Unknown'}
                        </div>
                        {dependent.patient_mrn && (
                          <div className="text-xs text-muted-foreground">
                            MRN: {dependent.patient_mrn}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {dependent.sha_member_number}
                  </TableCell>
                  <TableCell>
                    <MembershipTypeBadge type={dependent.membership_type || 'OTHER'} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={dependent.status || 'INACTIVE'} />
                  </TableCell>
                  <TableCell className="text-right">
                    {dependent.coverage_end_date ? (
                      <span className="text-sm">
                        {format(parseISO(dependent.coverage_end_date), 'MMM d, yyyy')}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {onDependentClick && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Principal Member Info */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Principal: {principalMember.patient_name}</span>
            <span className="font-mono">({principalMember.sha_member_number})</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DependentsView;
