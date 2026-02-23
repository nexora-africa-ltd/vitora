/**
 * Version Diff Component
 *
 * Displays field-level changes between versions in a visual diff format.
 * Shows old values crossed out and new values highlighted.
 */

'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { formatDate, formatPhoneNumber } from '@/lib/utils/format';
import type { FieldChanges, FieldDisplayConfig } from '@/lib/types/history';

interface VersionDiffProps {
  /** Field changes to display */
  changes: FieldChanges;
  /** Field configuration for labels and formatting */
  fieldConfig?: Record<string, FieldDisplayConfig>;
  /** Custom class name */
  className?: string;
}

/**
 * Format a value based on its field configuration
 */
function formatValue(
  value: string | number | boolean | null,
  config?: FieldDisplayConfig
): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (config?.format) {
    switch (config.format) {
      case 'date':
        return formatDate(String(value));
      case 'datetime':
        return new Date(String(value)).toLocaleString();
      case 'phone':
        return formatPhoneNumber(String(value)) || String(value);
      case 'boolean':
        return value ? 'Yes' : 'No';
      case 'currency':
        return `KES ${Number(value).toLocaleString()}`;
      default:
        return String(value);
    }
  }

  return String(value);
}

/**
 * Mask sensitive values
 */
function maskValue(value: string): string {
  if (value.length <= 4) return '****';
  return value.slice(0, 2) + '****' + value.slice(-2);
}

export function VersionDiff({ changes, fieldConfig = {}, className }: VersionDiffProps) {
  const [showSensitive, setShowSensitive] = useState(false);
  const changeEntries = Object.entries(changes);

  if (changeEntries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No field changes recorded</p>
    );
  }

  // Check if any sensitive fields are present
  const hasSensitiveFields = changeEntries.some(
    ([fieldName]) => fieldConfig[fieldName]?.sensitive
  );

  return (
    <div className={cn('space-y-3', className)}>
      {hasSensitiveFields && (
        <button
          type="button"
          onClick={() => setShowSensitive(!showSensitive)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showSensitive ? (
            <>
              <EyeOff className="h-3 w-3" />
              Hide sensitive values
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" />
              Show sensitive values
            </>
          )}
        </button>
      )}

      <div className="space-y-2">
        {changeEntries.map(([fieldName, change]) => {
          const config = fieldConfig[fieldName];
          const label = config?.label || fieldName.replace(/_/g, ' ');
          const isSensitive = config?.sensitive && !showSensitive;

          const oldValue = isSensitive && change.old
            ? maskValue(formatValue(change.old, config))
            : formatValue(change.old, config);

          const newValue = isSensitive && change.new
            ? maskValue(formatValue(change.new, config))
            : formatValue(change.new, config);

          return (
            <div
              key={fieldName}
              className="flex flex-col gap-1 rounded-md border p-2 text-sm sm:flex-row sm:items-center sm:gap-3"
            >
              <span className="font-medium text-muted-foreground min-w-[140px] capitalize">
                {label}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {change.old !== null && (
                  <Badge
                    variant="outline"
                    className="bg-destructive/10 text-destructive line-through font-normal"
                  >
                    {oldValue}
                  </Badge>
                )}
                <span className="text-muted-foreground">→</span>
                <Badge
                  variant="outline"
                  className="bg-green-500/10 text-green-700 dark:text-green-400 font-normal"
                >
                  {newValue}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
