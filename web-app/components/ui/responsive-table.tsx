'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface Column<T> {
  key: keyof T | string;
  header: string;
  cell?: (item: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
  /** Enable sorting on this column. Defaults to false. */
  sortable?: boolean;
  /**
   * Hint for the default sort comparator.
   * - `'string'` — `localeCompare` (default)
   * - `'number'` — numeric subtraction
   * - `'date'`   — `Date.getTime()` comparison, defaults descending on first click
   */
  sortType?: 'string' | 'number' | 'date';
  /** Custom comparator. Receives two items and should return <0, 0, or >0. */
  sortFn?: (a: T, b: T) => number;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  mobileCard?: (item: T, index: number) => React.ReactNode;
  onRowClick?: (item: T) => void;
  keyExtractor: (item: T) => string | number;
  isLoading?: boolean;
  emptyMessage?: string;
  rowClassName?: (item: T) => string;
  /** Render expanded content below a row. Return null/undefined to skip. */
  renderExpandedRow?: (item: T) => React.ReactNode;
  /** Column key to sort by initially. */
  defaultSortColumn?: string;
  /** Initial sort direction. Defaults to `'asc'`. */
  defaultSortDirection?: 'asc' | 'desc';
}

function SortIcon({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />;
  return direction === 'asc'
    ? <ArrowUp className="h-3 w-3" />
    : <ArrowDown className="h-3 w-3" />;
}

export function ResponsiveTable<T>({
  data,
  columns,
  mobileCard,
  onRowClick,
  keyExtractor,
  isLoading = false,
  emptyMessage = 'No data available',
  rowClassName,
  renderExpandedRow,
  defaultSortColumn,
  defaultSortDirection = 'asc',
}: ResponsiveTableProps<T>) {
  const [sortColumn, setSortColumn] = React.useState<string | null>(defaultSortColumn ?? null);
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>(defaultSortDirection);

  const getValue = (item: T, key: string): unknown => {
    const keys = key.split('.');
    let value: unknown = item;
    for (const k of keys) {
      value = (value as Record<string, unknown>)?.[k];
    }
    return value;
  };

  const toggleSort = (column: Column<T>) => {
    const key = String(column.key);
    if (sortColumn === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(key);
      setSortDirection(column.sortType === 'date' ? 'desc' : 'asc');
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortColumn) return data;
    const col = columns.find((c) => String(c.key) === sortColumn);
    if (!col || !col.sortable) return data;

    const dir = sortDirection === 'asc' ? 1 : -1;
    const sorted = [...data].sort((a, b) => {
      // Custom comparator takes priority
      if (col.sortFn) return col.sortFn(a, b) * dir;

      const aVal = getValue(a, String(col.key));
      const bVal = getValue(b, String(col.key));

      const type = col.sortType ?? 'string';

      if (type === 'number') {
        return (Number(aVal ?? 0) - Number(bVal ?? 0)) * dir;
      }
      if (type === 'date') {
        const aTime = aVal ? new Date(String(aVal)).getTime() : 0;
        const bTime = bVal ? new Date(String(bVal)).getTime() : 0;
        return (aTime - bTime) * dir;
      }
      // Default: string
      return String(aVal ?? '').localeCompare(String(bVal ?? '')) * dir;
    });
    return sorted;
  }, [data, sortColumn, sortDirection, columns]);

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
              {columns.map((column) => {
                const key = String(column.key);
                const isActive = sortColumn === key;
                return (
                  <th
                    key={key}
                    className={cn(
                      'h-12 px-4 text-left font-medium text-muted-foreground',
                      column.className
                    )}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        className={cn(
                          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
                          column.className?.includes('text-right') && 'ml-auto'
                        )}
                        onClick={() => toggleSort(column)}
                      >
                        {column.header}
                        <SortIcon active={isActive} direction={sortDirection} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((item) => {
              const expandedContent = renderExpandedRow?.(item);
              return (
                <React.Fragment key={keyExtractor(item)}>
                  <tr
                    className={cn(
                      'border-b transition-colors hover:bg-muted/50',
                      onRowClick && 'cursor-pointer',
                      rowClassName?.(item)
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
                  {expandedContent && (
                    <tr className="border-b">
                      <td colSpan={columns.length} className="p-0">
                        {expandedContent}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {sortedData.map((item, index) => {
          if (mobileCard) {
            return (
              <div
                key={keyExtractor(item)}
                onClick={() => onRowClick?.(item)}
                className={cn(onRowClick && 'cursor-pointer', rowClassName?.(item))}
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
                onRowClick && 'cursor-pointer hover:bg-muted/50 transition-colors',
                rowClassName?.(item)
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
