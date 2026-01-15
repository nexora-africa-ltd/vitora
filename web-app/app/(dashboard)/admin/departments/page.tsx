/**
 * Departments List Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Building2, Users, Search, Filter } from 'lucide-react';
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
import { useDepartments } from '@/lib/hooks/use-rbac';
import type { DepartmentType } from '@/lib/types/rbac';

const DEPARTMENT_TYPES: { value: DepartmentType; label: string }[] = [
  { value: 'CLINICAL', label: 'Clinical' },
  { value: 'ANCILLARY', label: 'Ancillary' },
  { value: 'ADMINISTRATIVE', label: 'Administrative' },
  { value: 'SUPPORT', label: 'Support' },
];

function getDepartmentTypeBadgeVariant(type: DepartmentType) {
  switch (type) {
    case 'CLINICAL':
      return 'default';
    case 'ANCILLARY':
      return 'secondary';
    case 'ADMINISTRATIVE':
      return 'outline';
    case 'SUPPORT':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export default function DepartmentsPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DepartmentType | 'all'>('all');

  const { data, isLoading, error } = useDepartments({
    search: search || undefined,
    department_type: typeFilter !== 'all' ? typeFilter : undefined,
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Departments
          </h1>
          <p className="text-muted-foreground">
            Manage organizational departments and their structure
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/departments/new">
            <Plus className="h-4 w-4 mr-2" />
            New Department
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search departments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as DepartmentType | 'all')}
            >
              <SelectTrigger className="w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {DEPARTMENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Departments Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {data?.count ?? 0} Departments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              Error loading departments
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Head</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.results.map((dept) => (
                  <TableRow key={dept.id}>
                    <TableCell className="font-medium">{dept.name}</TableCell>
                    <TableCell className="text-muted-foreground">{dept.code}</TableCell>
                    <TableCell>
                      <Badge variant={getDepartmentTypeBadgeVariant(dept.department_type)}>
                        {dept.department_type_display}
                      </Badge>
                    </TableCell>
                    <TableCell>{dept.head_name || '-'}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {dept.staff_count} staff
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={dept.is_active ? 'default' : 'secondary'}>
                        {dept.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/departments/${dept.id}`}>Edit</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {data?.results.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No departments found
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
