/**
 * Audit Logs Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 *
 * Displays audit trail of role and permission changes for compliance.
 */
'use client';

import { useState } from 'react';
import { FileText, Search, Filter, Clock, User, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuditLogs, type AuditAction } from '@/lib/hooks/use-rbac';
import { formatDistanceToNow } from 'date-fns';

const ACTION_TYPES = [
  { value: 'department_created', label: 'Department Created' },
  { value: 'department_updated', label: 'Department Updated' },
  { value: 'department_deleted', label: 'Department Deleted' },
  { value: 'role_created', label: 'Role Created' },
  { value: 'role_updated', label: 'Role Updated' },
  { value: 'role_deleted', label: 'Role Deleted' },
  { value: 'staff_created', label: 'Staff Created' },
  { value: 'staff_updated', label: 'Staff Updated' },
  { value: 'staff_deactivated', label: 'Staff Deactivated' },
];

function getActionBadgeVariant(action: string) {
  if (action.includes('create') || action.includes('assign')) {
    return 'default';
  }
  if (action.includes('change') || action.includes('update')) {
    return 'secondary';
  }
  if (action.includes('delete') || action.includes('deactivate')) {
    return 'destructive';
  }
  return 'outline';
}

function formatActionLabel(action: string): string {
  return action
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const { data, isLoading, error } = useAuditLogs({
    search: search || undefined,
    action: actionFilter !== 'all' ? (actionFilter as AuditAction) : undefined,
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Audit Logs
          </h1>
          <p className="text-muted-foreground">
            Track role assignments and permission changes
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by user or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={actionFilter}
              onValueChange={setActionFilter}
            >
              <SelectTrigger className="w-48" aria-label="Action filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {ACTION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {data?.count ?? 0} Log Entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              Error loading audit logs
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.results.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{log.user_name || log.username || 'System'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionBadgeVariant(log.action)}>
                        {formatActionLabel(log.action)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span>{log.resource_type}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        ID: {log.resource_id}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <span className="text-sm text-muted-foreground truncate block">
                        {typeof log.details === 'object'
                          ? JSON.stringify(log.details)
                          : log.details || '-'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {data?.results.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No audit logs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
