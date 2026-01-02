'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface Column<T> {
  key: keyof T | string;
  header: string;
  cell?: (item: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  mobileCard?: (item: T, index: number) => React.ReactNode;
  onRowClick?: (item: T) => void;
  keyExtractor: (item: T) => string | number;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function ResponsiveTable<T>({
  data,
  columns,
  mobileCard,
  onRowClick,
  keyExtractor,
  isLoading = false,
  emptyMessage = 'No data available',
}: ResponsiveTableProps<T>) {
  const getValue = (item: T, key: string) => {
    const keys = key.split('.');
    let value: unknown = item;
    for (const k of keys) {
      value = (value as Record<string, unknown>)?.[k];
    }
    return value;
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-muted rounded-lg" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const visibleColumns = columns.filter((col) => !col.hideOnMobile);

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={cn(
                    'h-12 px-4 text-left font-medium text-muted-foreground',
                    column.className
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr
                key={keyExtractor(item)}
                className={cn(
                  'border-b transition-colors hover:bg-muted/50',
                  onRowClick && 'cursor-pointer'
                )}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((column) => (
                  <td
                    key={String(column.key)}
                    className={cn('p-4', column.className)}
                  >
                    {column.cell
                      ? column.cell(item)
                      : String(getValue(item, String(column.key)) ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {data.map((item, index) => {
          if (mobileCard) {
            return (
              <div
                key={keyExtractor(item)}
                onClick={() => onRowClick?.(item)}
                className={onRowClick ? 'cursor-pointer' : undefined}
              >
                {mobileCard(item, index)}
              </div>
            );
          }

          // Default mobile card rendering
          return (
            <div
              key={keyExtractor(item)}
              className={cn(
                'rounded-lg border p-4 space-y-2',
                onRowClick && 'cursor-pointer hover:bg-muted/50 transition-colors'
              )}
              onClick={() => onRowClick?.(item)}
            >
              {visibleColumns.map((column) => (
                <div
                  key={String(column.key)}
                  className="flex justify-between gap-4"
                >
                  <span className="text-sm text-muted-foreground shrink-0">
                    {column.header}:
                  </span>
                  <span className="text-sm text-right">
                    {column.cell
                      ? column.cell(item)
                      : String(getValue(item, String(column.key)) ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default ResponsiveTable;
