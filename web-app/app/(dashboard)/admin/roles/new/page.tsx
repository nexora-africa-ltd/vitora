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
import { ArrowLeft, Shield, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import type { Permission, RoleCategory } from '@/lib/types/rbac';

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
        permissions_matrix: {},
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

  // Group permissions by app (permissionsData is a plain array, not paginated)
  const groupedPermissions = permissionsData?.reduce<Record<string, Permission[]>>(
    (acc, perm) => {
      const appLabel = perm.app_label || 'other';
      if (!acc[appLabel]) {
        acc[appLabel] = [];
      }
      acc[appLabel].push(perm);
      return acc;
    },
    {}
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/roles">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            New Role
          </h1>
          <p className="text-muted-foreground">Create a new role with permissions</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
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
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Senior Nurse"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Role Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., SENIOR_NURSE"
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
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the role's responsibilities..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Permissions */}
        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>Select the permissions for this role</CardDescription>
          </CardHeader>
          <CardContent>
            {permissionsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading permissions...
              </div>
            ) : groupedPermissions ? (
              <div className="space-y-6">
                {Object.entries(groupedPermissions).map(([appLabel, permissions]) => (
                  <div key={appLabel} className="space-y-3">
                    <h4 className="font-medium capitalize">{appLabel}</h4>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {permissions.map((perm) => {
                        const permCode = `${perm.app_label}.${perm.codename}`;
                        return (
                          <div key={permCode} className="flex items-center space-x-2">
                            <Checkbox
                              id={permCode}
                              checked={formData.permissions.includes(permCode)}
                              onCheckedChange={() => togglePermission(permCode)}
                              aria-label={perm.name}
                            />
                            <Label htmlFor={permCode} className="text-sm font-normal cursor-pointer">
                              {perm.name}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Alert>
                <AlertDescription>No permissions available</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button type="submit" disabled={createRole.isPending}>
            {createRole.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Create Role
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/admin/roles">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
