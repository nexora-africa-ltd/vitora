'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PermissionGroupSelector } from '@/components/admin/permission-group-selector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/lib/hooks/use-toast';
import { useDeleteRole, usePermissions, useRole, useUpdateRole } from '@/lib/hooks/use-rbac';
import type { RoleCategory } from '@/lib/types/rbac';
import { buildPermissionsMatrix, matrixToPermissionCodes } from '@/lib/utils/rbac-permissions';

const ROLE_CATEGORIES: Array<{ value: RoleCategory; label: string }> = [
  { value: 'CLINICAL', label: 'Clinical Staff' },
  { value: 'ADMINISTRATIVE', label: 'Administrative' },
  { value: 'TECHNICAL', label: 'Technical Staff' },
  { value: 'MANAGEMENT', label: 'Management' },
  { value: 'COMMUNITY', label: 'Community Health' },
];

export default function RoleEditPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const roleId = parseInt(params.id as string, 10);

  const { data: role, isLoading, error } = useRole(roleId);
  const { data: allPermissions } = usePermissions();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RoleCategory>('CLINICAL');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (!role || !allPermissions) {
      return;
    }

    setName(role.name);
    setCode(role.code);
    setDescription(role.description || '');
    setCategory(role.category);
    setSelectedPermissions(matrixToPermissionCodes(role.permissions_matrix || {}, allPermissions));
  }, [role, allPermissions]);

  const handlePermissionToggle = (permissionCode: string) => {
    setSelectedPermissions((current) =>
      current.includes(permissionCode)
        ? current.filter((item) => item !== permissionCode)
        : [...current, permissionCode]
    );
  };

  const handleGroupToggle = (codes: string[], selected: boolean) => {
    setSelectedPermissions((current) => {
      if (selected) {
        const newSet = new Set(current);
        for (const code of codes) newSet.add(code);
        return Array.from(newSet);
      }
      const toRemove = new Set(codes);
      return current.filter((item) => !toRemove.has(item));
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      await updateRole.mutateAsync({
        id: roleId,
        data: {
          name,
          code,
          description,
          category,
          permissions_matrix: buildPermissionsMatrix(selectedPermissions, allPermissions || []),
        },
      });

      toast({
        title: 'Role updated',
        description: `${name} has been updated successfully.`,
      });

      router.push('/admin/roles');
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update role. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRole.mutateAsync(roleId);

      toast({
        title: 'Role deleted',
        description: 'The role has been deleted successfully.',
      });

      router.push('/admin/roles');
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete role. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !role) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Edit Role"
          helpContent="Update role metadata and permission bundles for staff assignment."
        />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Role not found or failed to load. Refresh the page and confirm the role still exists.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <PageHeader
        title={role.name}
        helpContent="Update role metadata and permission bundles for staff assignment."
        actions={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" disabled={deleteRole.isPending}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Role
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Role</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete this role permanently. Staff members using it will need reassignment before they can keep working with the correct permissions.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete Role</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />

      <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">
            {role.code}
            <span className="text-muted-foreground"> • Hierarchy Level {role.hierarchy_level}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {role.category_display || role.category}
            {role.requires_license ? ` • License body: ${role.license_body || 'Required'}` : ' • No license requirement'}
          </p>
        </div>
        <Badge variant={role.is_active ? 'default' : 'secondary'} className="w-fit shrink-0 self-start sm:self-auto">
          {role.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      {!role.is_active ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This role is inactive. Staff members cannot be assigned to it until it is reactivated.
          </AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Role Information</CardTitle>
            <CardDescription>Basic details about this role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  name="name"
                  autoComplete="off"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g., Senior Nurse…"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  name="code"
                  autoComplete="off"
                  spellCheck={false}
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="e.g., SR_NURSE…"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe this role's responsibilities…"
                rows={3}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={category} onValueChange={(value) => setCategory(value as RoleCategory)}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_CATEGORIES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>
              Select permissions for this role ({selectedPermissions.length} selected).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PermissionGroupSelector
              permissions={allPermissions || []}
              selectedPermissions={selectedPermissions}
              onToggle={handlePermissionToggle}
              onToggleGroup={handleGroupToggle}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/admin/roles">Cancel</Link>
          </Button>
          <Button type="submit" disabled={updateRole.isPending}>
            {updateRole.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
