/**
 * Roles List Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 * 
 * Lists all roles with permissions, type badges, and staff counts.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Shield, Users, Settings, Search } from 'lucide-react';
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
import { useRoles } from '@/lib/hooks/use-rbac';
import type { RoleCategory } from '@/lib/types/rbac';

const ROLE_CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'CLINICAL', label: 'Clinical Staff' },
  { value: 'ADMINISTRATIVE', label: 'Administrative' },
  { value: 'TECHNICAL', label: 'Technical Staff' },
  { value: 'MANAGEMENT', label: 'Management' },
  { value: 'COMMUNITY', label: 'Community Health' },
];

function getCategoryBadgeVariant(category: string) {
  switch (category) {
    case 'CLINICAL':
      return 'default';
    case 'TECHNICAL':
      return 'secondary';
    case 'ADMINISTRATIVE':
      return 'outline';
    case 'MANAGEMENT':
      return 'default';
    case 'COMMUNITY':
      return 'secondary';
    default:
      return 'secondary';
  }
}

export default function RolesListPage() {
  const [search, setSearch] = useState('');
  const [roleType, setRoleType] = useState('');

  const { data, isLoading, error } = useRoles({
    search: search || undefined,
    category: (roleType || undefined) as RoleCategory | undefined,
  });

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Failed to load roles. Please try again.
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
            <Shield className="h-6 w-6" />
            Roles
          </h1>
          <p className="text-muted-foreground">
            Manage roles and their permissions
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/roles/new">
            <Plus className="h-4 w-4 mr-2" />
            Add Role
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search roles..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  aria-label="Search"
                />
              </div>
            </div>
            <Select value={roleType} onValueChange={setRoleType}>
              <SelectTrigger className="w-[180px]" aria-label="Category">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Roles Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Role List
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>License Required</TableHead>
                  <TableHead>Hierarchy</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.results.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">{role.name}</TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {role.code}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getCategoryBadgeVariant(role.category)}>
                        {role.category_display || role.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {role.requires_license ? (
                        <Badge variant="outline">{role.license_body || 'Yes'}</Badge>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">Level {role.hierarchy_level}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/roles/${role.id}`}>Edit</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {data?.results.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No roles found
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
