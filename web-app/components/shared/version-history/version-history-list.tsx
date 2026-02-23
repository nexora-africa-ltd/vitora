/**
 * Version History List Component
 *
 * Displays a timeline of all versions for a model with expandable diffs.
 * Supports DHA compliance requirements for audit trail visibility.
 */

'use client';

import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  User,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { VersionDiff } from './version-diff';
import type { VersionHistoryItem, FieldDisplayConfig, HistoryType } from '@/lib/types/history';

interface VersionHistoryListProps {
  /** Version history items (most recent first) */
  versions: VersionHistoryItem[];
  /** Whether data is loading */
  isLoading?: boolean;
  /** Field configuration for formatting */
  fieldConfig?: Record<string, FieldDisplayConfig>;
  /** Maximum versions to show initially */
  initialLimit?: number;
  /** Custom class name */
  className?: string;
}

/**
 * Get icon for history type
 */
function getHistoryIcon(historyType: HistoryType) {
  switch (historyType) {
    case 'created':
      return Plus;
    case 'updated':
      return Pencil;
    case 'deleted':
      return Trash2;
    default:
      return Pencil;
  }
}

/**
 * Get badge variant for history type
 */
function getHistoryBadgeClass(historyType: HistoryType) {
  switch (historyType) {
    case 'created':
      return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800';
    case 'updated':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800';
    case 'deleted':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    default:
      return '';
  }
}

/**
 * Get human-readable label for history type
 */
function getHistoryLabel(historyType: HistoryType) {
  switch (historyType) {
    case 'created':
      return 'Created';
    case 'updated':
      return 'Updated';
    case 'deleted':
      return 'Deleted';
    default:
      return historyType;
  }
}

function VersionHistoryItem({
  version,
  fieldConfig,
  isFirst,
  isLast,
}: {
  version: VersionHistoryItem;
  fieldConfig?: Record<string, FieldDisplayConfig>;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [isOpen, setIsOpen] = useState(isFirst && version.history_type !== 'created');
  const Icon = getHistoryIcon(version.history_type);
  const hasChanges = Object.keys(version.changes).length > 0;
  const historyDate = new Date(version.history_date);

  return (
    <div className="relative flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-background',
            version.history_type === 'created' && 'border-green-500',
            version.history_type === 'updated' && 'border-blue-500',
            version.history_type === 'deleted' && 'border-destructive'
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        {!isLast && (
          <div className="w-0.5 flex-1 bg-border min-h-[24px]" />
        )}
      </div>

      {/* Content */}
      <Card className="flex-1 mb-3">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <CardContent className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn('text-xs', getHistoryBadgeClass(version.history_type))}
                  >
                    {getHistoryLabel(version.history_type)}
                  </Badge>
                  {hasChanges && version.history_type !== 'created' && (
                    <span className="text-xs text-muted-foreground">
                      {Object.keys(version.changes).length} field(s) changed
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {version.history_user && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {version.history_user}
                    </span>
                  )}
                  <span className="flex items-center gap-1" title={format(historyDate, 'PPpp')}>
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(historyDate, { addSuffix: true })}
                  </span>
                  {hasChanges && version.history_type !== 'created' && (
                    isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )
                  )}
                </div>
              </div>
            </CardContent>
          </CollapsibleTrigger>
          {hasChanges && version.history_type !== 'created' && (
            <CollapsibleContent>
              <div className="border-t px-3 py-3">
                <VersionDiff changes={version.changes} fieldConfig={fieldConfig} />
              </div>
            </CollapsibleContent>
          )}
        </Collapsible>
      </Card>
    </div>
  );
}

export function VersionHistoryList({
  versions,
  isLoading,
  fieldConfig,
  initialLimit = 10,
  className,
}: VersionHistoryListProps) {
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className={cn('space-y-3', className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className="h-16 flex-1 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (!versions?.length) {
    return (
      <div className={cn('text-center py-8', className)}>
        <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">No version history available</p>
        <p className="text-sm text-muted-foreground/70">
          Changes will appear here when the record is modified
        </p>
      </div>
    );
  }

  const displayVersions = showAll ? versions : versions.slice(0, initialLimit);
  const hasMore = versions.length > initialLimit;

  return (
    <div className={cn('space-y-0', className)}>
      {displayVersions.map((version, index) => (
        <VersionHistoryItem
          key={version.version_id}
          version={version}
          fieldConfig={fieldConfig}
          isFirst={index === 0}
          isLast={index === displayVersions.length - 1}
        />
      ))}

      {hasMore && !showAll && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAll(true)}
          >
            Show {versions.length - initialLimit} more version(s)
          </Button>
        </div>
      )}

      {showAll && hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(false)}
          >
            Show less
          </Button>
        </div>
      )}
    </div>
  );
}
