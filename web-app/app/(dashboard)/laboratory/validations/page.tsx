'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield,
  Stethoscope,
  Search,
  AlertTriangle,
  Clock,
  User,
  Calendar,
  Loader2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { HelpPopover } from '@/components/shared/help-popover';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePendingVerification } from '@/lib/hooks/use-laboratory';
import { ValidationStatusBadge } from '@/components/laboratory/validation-status-badge';
import { ResultValidationPanel } from '@/components/laboratory/result-validation-panel';
import { cn } from '@/lib/utils/cn';
import { formatDistanceToNow } from 'date-fns';
import type { LabResult, TestCategory, LabPriority } from '@/lib/types/laboratory';

const TEST_CATEGORIES: { value: TestCategory | ''; label: string }[] = [
  { value: '', label: 'All Categories' },
  { value: 'HEMATOLOGY', label: 'Hematology' },
  { value: 'CHEMISTRY', label: 'Chemistry' },
  { value: 'MICROBIOLOGY', label: 'Microbiology' },
  { value: 'PARASITOLOGY', label: 'Parasitology' },
  { value: 'SEROLOGY', label: 'Serology' },
  { value: 'IMMUNOLOGY', label: 'Immunology' },
  { value: 'URINALYSIS', label: 'Urinalysis' },
];

const PRIORITIES: { value: LabPriority | ''; label: string }[] = [
  { value: '', label: 'All Priorities' },
  { value: 'STAT', label: 'STAT' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'ROUTINE', label: 'Routine' },
];

export default function ValidationsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [activeTab, setActiveTab] = useState<'technical' | 'clinical'>('technical');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<TestCategory | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<LabPriority | ''>('');
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);

  const { data: pendingResults, isLoading, error, refetch } = usePendingVerification();

  // Filter results based on validation stage needed
  const filterResults = useCallback(
    (results: LabResult[] | undefined, stage: 'technical' | 'clinical') => {
      if (!results) return [];

      return results.filter((result) => {
        // Search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matchesSearch =
            result.test_name?.toLowerCase().includes(query) ||
            result.test_code?.toLowerCase().includes(query);
          if (!matchesSearch) return false;
        }

        // For now, show all unverified results in both tabs
        // In production, this would filter based on validation stage from API
        if (stage === 'technical') {
          // Technical review: results that haven't been technically validated yet
          return result.verification_status === 'UNVERIFIED';
        } else {
          // Clinical review: results that have technical approval
          // (In production this would check actual validation records)
          return result.verification_status === 'UNVERIFIED';
        }
      });
    },
    [searchQuery]
  );

  const technicalResults = filterResults(pendingResults, 'technical');
  const clinicalResults = filterResults(pendingResults, 'clinical');

  const handleResultClick = (resultId: number) => {
    setSelectedResultId(selectedResultId === resultId ? null : resultId);
  };

  const handleValidationAdded = () => {
    refetch();
    setSelectedResultId(null);
  };

  const handleViewOrder = (result: LabResult) => {
    // Navigate to order detail - need to get order number from result
    // For now, navigate to results page
    router.push(`/laboratory/results/${result.id}`);
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="Pending Validations"
          helpContent="Review and validate lab results. Technical review checks analytical accuracy, clinical review checks clinical relevance. Both stages must be approved before results can be released."
          actions={
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
              className="gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          }
        />

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by test name or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Select
                  value={categoryFilter}
                  onValueChange={(v) => setCategoryFilter(v as TestCategory | '')}
                >
                  <SelectTrigger className="w-[140px] sm:w-[160px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEST_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value || 'all'} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={priorityFilter}
                  onValueChange={(v) => setPriorityFilter(v as LabPriority | '')}
                >
                  <SelectTrigger className="w-[120px] sm:w-[140px]">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((pri) => (
                      <SelectItem key={pri.value || 'all'} value={pri.value}>
                        {pri.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'technical' | 'clinical')}>
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
            <TabsTrigger value="technical" className="gap-2">
              <Shield className="h-4 w-4" />
              <span className="sm:hidden">Technical</span>
              <span className="hidden sm:inline">Technical Review</span>
              {technicalResults.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {technicalResults.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="clinical" className="gap-2">
              <Stethoscope className="h-4 w-4" />
              <span className="sm:hidden">Clinical</span>
              <span className="hidden sm:inline">Clinical Review</span>
              {clinicalResults.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {clinicalResults.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="technical" className="mt-4">
            <ValidationList
              results={technicalResults}
              isLoading={isLoading}
              error={error as Error | null}
              validationType="TECHNICAL"
              selectedResultId={selectedResultId}
              onResultClick={handleResultClick}
              onViewOrder={handleViewOrder}
              onValidationAdded={handleValidationAdded}
            />
          </TabsContent>

          <TabsContent value="clinical" className="mt-4">
            <ValidationList
              results={clinicalResults}
              isLoading={isLoading}
              error={error as Error | null}
              validationType="CLINICAL"
              selectedResultId={selectedResultId}
              onResultClick={handleResultClick}
              onViewOrder={handleViewOrder}
              onValidationAdded={handleValidationAdded}
            />
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}

// ============ Sub-components ============

interface ValidationListProps {
  results: LabResult[];
  isLoading: boolean;
  error: Error | null;
  validationType: 'TECHNICAL' | 'CLINICAL';
  selectedResultId: number | null;
  onResultClick: (resultId: number) => void;
  onViewOrder: (result: LabResult) => void;
  onValidationAdded: () => void;
}

function ValidationList({
  results,
  isLoading,
  error,
  validationType,
  selectedResultId,
  onResultClick,
  onViewOrder,
  onValidationAdded,
}: ValidationListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-destructive">Failed to load results: {error.message}</p>
          <Button variant="outline" className="mt-4">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="flex flex-col items-center gap-3">
            {validationType === 'TECHNICAL' ? (
              <Shield className="h-12 w-12 text-muted-foreground/50" />
            ) : (
              <Stethoscope className="h-12 w-12 text-muted-foreground/50" />
            )}
            <p className="text-muted-foreground">
              No results pending {validationType.toLowerCase()} review
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {results.map((result) => (
        <ResultCard
          key={result.id}
          result={result}
          validationType={validationType}
          isSelected={selectedResultId === result.id}
          onClick={() => onResultClick(result.id)}
          onViewOrder={() => onViewOrder(result)}
          onValidationAdded={onValidationAdded}
        />
      ))}
    </div>
  );
}

interface ResultCardProps {
  result: LabResult;
  validationType: 'TECHNICAL' | 'CLINICAL';
  isSelected: boolean;
  onClick: () => void;
  onViewOrder: () => void;
  onValidationAdded: () => void;
}

function ResultCard({
  result,
  validationType,
  isSelected,
  onClick,
  onViewOrder,
  onValidationAdded,
}: ResultCardProps) {
  const isCritical = result.is_critical_result;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all',
        isSelected && 'ring-2 ring-primary',
        isCritical && 'border-red-200 dark:border-red-800'
      )}
    >
      <CardContent className="pt-4">
        {/* Header row */}
        <div
          className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
          onClick={onClick}
        >
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{result.test_name || result.test_code}</span>
              {isCritical && (
                <Badge variant="destructive" className="gap-1 shrink-0">
                  <AlertTriangle className="h-3 w-3" />
                  Critical
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">{result.test_code}</span>
              {result.entered_by_name && (
                <>
                  <span>•</span>
                  <User className="h-3 w-3" />
                  <span className="truncate">{result.entered_by_name}</span>
                </>
              )}
              {result.entered_at && (
                <>
                  <span>•</span>
                  <Calendar className="h-3 w-3" />
                  <span>
                    {formatDistanceToNow(new Date(result.entered_at), { addSuffix: true })}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Result value */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="font-semibold">
                {result.numeric_value ?? result.text_value ?? result.option_value ?? '-'}
                {result.result_unit && (
                  <span className="text-muted-foreground ml-1 font-normal">
                    {result.result_unit}
                  </span>
                )}
              </p>
              {result.reference_range_text && (
                <p className="text-xs text-muted-foreground">Ref: {result.reference_range_text}</p>
              )}
            </div>
            {result.result_flag && (
              <Badge
                variant={
                  result.result_flag.includes('CRITICAL')
                    ? 'destructive'
                    : ['LOW', 'HIGH', 'ABNORMAL'].includes(result.result_flag)
                      ? 'secondary'
                      : 'outline'
                }
              >
                {result.result_flag}
              </Badge>
            )}
          </div>
        </div>

        {/* Expanded validation panel */}
        {isSelected && (
          <div className="mt-4 pt-4 border-t space-y-4">
            <ResultValidationPanel
              resultId={result.id}
              verificationStatus={result.verification_status}
              canAddTechnical={validationType === 'TECHNICAL'}
              canAddClinical={validationType === 'CLINICAL'}
              onValidationAdded={onValidationAdded}
            />

            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewOrder();
                }}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                View Result Details
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
