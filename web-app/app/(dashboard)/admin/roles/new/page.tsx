/**
 * New Role Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 *
 * Form for creating new roles with permission assignment.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Save, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/lib/hooks/use-toast';
import { useCreateRole, usePermissions } from '@/lib/hooks/use-rbac';
import type { RoleCategory } from '@/lib/types/rbac';
import { buildPermissionsMatrix } from '@/lib/utils/rbac-permissions';
import { PermissionGroupSelector } from '@/components/admin/permission-group-selector';

const ROLE_CATEGORIES: { value: RoleCategory; label: string }[] = [
  { value: 'CLINICAL', label: 'Clinical Staff' },
  { value: 'ADMINISTRATIVE', label: 'Administrative' },
  { value: 'TECHNICAL', label: 'Technical Staff' },
  { value: 'MANAGEMENT', label: 'Management' },
  { value: 'COMMUNITY', label: 'Community Health' },
];

export default function NewRolePage() {
  const router = useRouter();
  const { toast } = useToast();
  const createRole = useCreateRole();
  const { data: permissionsData, isLoading: permissionsLoading } = usePermissions();

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    category: '',
    permissions: [] as string[],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createRole.mutateAsync({
        name: formData.name,
        code: formData.code,
        description: formData.description,
        category: formData.category as RoleCategory,
        permissions_matrix: buildPermissionsMatrix(formData.permissions, permissionsData || []),
      });

      toast({
        title: 'Success',
        description: 'Role created successfully',
      });

      router.push('/admin/roles');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create role',
        variant: 'destructive',
      });
    }
  };

  const togglePermission = (permission: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((p) => p !== permission)
        : [...prev.permissions, permission],
    }));
  };

  const togglePermissionGroup = (codes: string[], selected: boolean) => {
    setFormData((prev) => {
      if (selected) {
        const newSet = new Set(prev.permissions);
        for (const code of codes) newSet.add(code);
        return { ...prev, permissions: Array.from(newSet) };
      }
      const toRemove = new Set(codes);
      return { ...prev, permissions: prev.permissions.filter((p) => !toRemove.has(p)) };
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <PageHeader
        title="New Role"
        helpContent="Create a role definition and permission bundle for staff assignment."
      />

      <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
        Define the role details first, then assign only the permissions needed for the work this role performs.
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Define the role name and type</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Role Name *</Label>
                <Input
                  autoComplete="off"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Senior Nurse…"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Role Code *</Label>
                <Input
                  autoComplete="off"
                  id="code"
                  name="code"
                  spellCheck={false}
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., SENIOR_NURSE…"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="category" aria-label="Category">
                  <SelectValue placeholder="Select category" />
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

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the role's responsibilities…"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>Select the permissions for this role ({formData.permissions.length} selected)</CardDescription>
          </CardHeader>
          <CardContent>
            {permissionsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading permissions…
              </div>
            ) : permissionsData ? (
              <PermissionGroupSelector
                permissions={permissionsData}
                selectedPermissions={formData.permissions}
                onToggle={togglePermission}
                onToggleGroup={togglePermissionGroup}
              />
            ) : (
              <Alert>
                <AlertDescription>No permissions available</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/admin/roles">Cancel</Link>
          </Button>
          <Button type="submit" disabled={createRole.isPending}>
            {createRole.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Create Role
          </Button>
        </div>
      </form>
    </div>
  );
}
