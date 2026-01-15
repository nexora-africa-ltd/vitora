/**
 * Staff Profiles List Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 * 
 * Lists all staff profiles with roles, departments, and status.
 * Supports list and grid view modes.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Users, Search, Building2, Shield, Mail, Phone, IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ViewToggle, type ViewMode } from '@/components/ui/view-toggle';
import { EntityCard, EntityGrid } from '@/components/shared/entity-card';
import { useStaffList, useDepartments, useRoles } from '@/lib/hooks/use-rbac';
import type { StaffProfile } from '@/lib/types/rbac';

export default function StaffListPage() {
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const { data: departments } = useDepartments({ is_active: true });
  const { data: roles } = useRoles();
  
  const { data, isLoading, error } = useStaffList({
    search: search || undefined,
    department: departmentFilter ? parseInt(departmentFilter) : undefined,
    role: roleFilter ? parseInt(roleFilter) : undefined,
    is_active: statusFilter === '' ? undefined : statusFilter === 'active',
  });

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Failed to load staff profiles. Please try again.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Staff Profiles
          </h1>
          <p className="text-muted-foreground">
            Manage staff members, roles, and departments
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/staff/new">
            <Plus className="h-4 w-4 mr-2" />
            Add Staff
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search staff..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  aria-label="Search"
                />
              </div>
            </div>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-[180px]" aria-label="Department">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Departments</SelectItem>
                {departments?.results?.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id.toString()}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px]" aria-label="Role">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Roles</SelectItem>
                {roles?.results?.map((role) => (
                  <SelectItem key={role.id} value={role.id.toString()}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" aria-label="Status">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        </CardContent>
      </Card>

      {/* Staff List/Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Staff List
            {data?.count !== undefined && (
              <Badge variant="secondary" className="ml-2">
                {data.count}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            viewMode === 'list' ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <EntityGrid>
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-40 w-full rounded-lg" />
                ))}
              </EntityGrid>
            )
          ) : viewMode === 'list' ? (
            <StaffTableView staff={data?.results || []} />
          ) : (
            <StaffGridView staff={data?.results || []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Staff Table View Component
 */
function StaffTableView({ staff }: { staff: StaffProfile[] }) {
  if (staff.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No staff profiles found.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employee</TableHead>
          <TableHead>Employee ID</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {staff.map((member) => (
          <TableRow key={member.id}>
            <TableCell>
              <div>
                <p className="font-medium">{member.full_name}</p>
                <p className="text-sm text-muted-foreground">@{member.user_username}</p>
              </div>
            </TableCell>
            <TableCell>
              <code className="text-sm">{member.employee_id}</code>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                <span>{member.primary_department_name || 'Unassigned'}</span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Shield className="h-3 w-3 text-muted-foreground" />
                <span>{member.primary_role_name || 'Unassigned'}</span>
              </div>
            </TableCell>
            <TableCell>
              <div className="space-y-1">
                {member.user_email && (
                  <div className="flex items-center gap-1 text-sm">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate max-w-[150px]">{member.user_email}</span>
                  </div>
                )}
                {member.phone_number && (
                  <div className="flex items-center gap-1 text-sm">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span>{member.phone_number}</span>
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={member.employment_status === 'ACTIVE' ? 'default' : 'secondary'}>
                {member.employment_status === 'ACTIVE' ? 'Active' : member.employment_status?.toLowerCase() || 'Unknown'}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/admin/staff/${member.id}`}>
                  Edit
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Staff Grid View Component
 */
function StaffGridView({ staff }: { staff: StaffProfile[] }) {
  if (staff.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No staff profiles found.
      </div>
    );
  }

  return (
    <EntityGrid>
      {staff.map((member) => (
        <EntityCard
          key={member.id}
          title={member.full_name}
          subtitle={`@${member.user_username}`}
          initials={getInitials(member.user_first_name, member.user_last_name)}
          gender={member.gender}
          href={`/admin/staff/${member.id}`}
          status={{
            label: member.employment_status === 'ACTIVE' ? 'Active' : member.employment_status?.toLowerCase() || 'Unknown',
            variant: member.employment_status === 'ACTIVE' ? 'default' : 'secondary',
          }}
          badges={member.primary_role_name ? [{ label: member.primary_role_name }] : []}
          metadata={[
            {
              icon: <IdCard className="h-3 w-3" />,
              label: 'ID',
              value: member.employee_id,
            },
            {
              icon: <Building2 className="h-3 w-3" />,
              label: 'Dept',
              value: member.primary_department_name || 'Unassigned',
            },
            ...(member.user_email
              ? [{
                  icon: <Mail className="h-3 w-3" />,
                  label: 'Email',
                  value: member.user_email,
                }]
              : []),
          ]}
          actions={[
            { label: 'Edit Profile', href: `/admin/staff/${member.id}` },
            { label: 'View Activity', href: `/admin/audit-logs?user=${member.user}` },
          ]}
        />
      ))}
    </EntityGrid>
  );
}

/**
 * Get initials from first and last name
 */
function getInitials(firstName?: string, lastName?: string): string {
  const first = firstName?.charAt(0) || '';
  const last = lastName?.charAt(0) || '';
  return (first + last).toUpperCase() || '??';
}
