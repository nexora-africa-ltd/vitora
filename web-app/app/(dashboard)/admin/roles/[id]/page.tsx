/**
 * Role Edit Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 *
 * Edit role details and manage permissions.
 */
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Shield, Save, Loader2, Trash2, AlertTriangle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useToast } from '@/lib/hooks/use-toast';
import { useRole, useUpdateRole, useDeleteRole, usePermissions } from '@/lib/hooks/use-rbac';
import type { RoleCategory, Permission } from '@/lib/types/rbac';
import { buildPermissionsMatrix, matrixToPermissionCodes } from '@/lib/utils/rbac-permissions';

const ROLE_CATEGORIES = [
  { value: 'CLINICAL', label: 'Clinical Staff' },
  { value: 'ADMINISTRATIVE', label: 'Administrative' },
  { value: 'TECHNICAL', label: 'Technical Staff' },
  { value: 'MANAGEMENT', label: 'Management' },
  { value: 'COMMUNITY', label: 'Community Health' },
];

// Group permissions by app_label for display
function groupPermissions(permissions: Permission[]) {
  const groups: Record<string, Permission[]> = {};
  permissions.forEach((perm) => {
    const appLabel = perm.app_label || 'other';
    if (!groups[appLabel]) {
      groups[appLabel] = [];
    }
    groups[appLabel].push(perm);
  });
  return groups;
}

export default function RoleEditPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const roleId = parseInt(params.id as string);

  const { data: role, isLoading, error } = useRole(roleId);
  const { data: allPermissions } = usePermissions();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  // Form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('CLINICAL');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  // Initialize form when role loads
  useEffect(() => {
    if (role && allPermissions) {
      setName(role.name);
      setCode(role.code);
      setDescription(role.description || '');
      setCategory(role.category);
      const initialPermissions = matrixToPermissionCodes(role.permissions_matrix || {}, allPermissions);
      setSelectedPermissions(initialPermissions);
    }
  }, [role, allPermissions]);

  const handlePermissionToggle = (permission: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updateRole.mutateAsync({
        id: roleId,
        data: {
          name,
          code,
          description,
          category: category as RoleCategory,
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
      <div className="container mx-auto py-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !role) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Role not found or failed to load.
          </CardContent>
        </Card>
      </div>
    );
  }

  const groupedPermissions = allPermissions
    ? groupPermissions(allPermissions)
    : {};

  // Calculate assigned/unassigned counts per group
  const getGroupStats = (perms: Permission[]) => {
    const assigned = perms.filter(p =>
      selectedPermissions.includes(`${p.app_label}.${p.codename}`)
    ).length;
    return { assigned, total: perms.length, unassigned: perms.length - assigned };
  };

  // Get groups with any assigned permissions (for default open state)
  const groupsWithAssigned = Object.entries(groupedPermissions)
    .filter(([, perms]) => getGroupStats(perms).assigned > 0)
    .map(([label]) => label);

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/roles">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Edit Role
          </h1>
          <p className="text-muted-foreground">
            Modify role settings and permissions
          </p>
        </div>
      </div>

      {/* Inactive Role Warning */}
      {!role.is_active && (
        <Alert className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This role is inactive. Staff members cannot be assigned to this role.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Role Information</CardTitle>
            <CardDescription>Basic details about this role</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Senior Nurse"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g., SR_NURSE"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this role's responsibilities..."
                rows={3}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={category} onValueChange={setCategory} disabled={role.is_active === false}>
                  <SelectTrigger id="category">
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
            </div>
          </CardContent>
        </Card>

        {/* Permissions */}
        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>
              Select permissions for this role ({selectedPermissions.length} selected)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(groupedPermissions).length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No permissions available
              </p>
            ) : (
              <Accordion
                type="multiple"
                defaultValue={groupsWithAssigned}
                className="w-full"
              >
                {Object.entries(groupedPermissions).map(([appLabel, perms]) => {
                  const stats = getGroupStats(perms);
                  return (
                    <AccordionItem key={appLabel} value={appLabel}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="font-medium capitalize">{appLabel}</span>
                          <div className="flex items-center gap-2 text-sm">
                            {stats.assigned > 0 && (
                              <Badge variant="default" className="gap-1">
                                <Check className="h-3 w-3" />
                                {stats.assigned}
                              </Badge>
                            )}
                            {stats.unassigned > 0 && (
                              <Badge variant="outline" className="gap-1 text-muted-foreground">
                                <X className="h-3 w-3" />
                                {stats.unassigned}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid gap-2 sm:grid-cols-2 pt-2">
                          {perms.map((perm) => {
                            const permCode = `${perm.app_label}.${perm.codename}`;
                            const isChecked = selectedPermissions.includes(permCode);
                            return (
                              <div
                                key={permCode}
                                className={`flex items-center space-x-2 p-2 rounded-md transition-colors ${
                                  isChecked ? 'bg-primary/5' : 'hover:bg-muted/50'
                                }`}
                              >
                                <Checkbox
                                  id={permCode}
                                  checked={isChecked}
                                  onCheckedChange={() => handlePermissionToggle(permCode)}
                                />
                                <Label
                                  htmlFor={permCode}
                                  className="text-sm font-normal cursor-pointer flex-1"
                                >
                                  {perm.name}
                                </Label>
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteRole.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Role
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Role</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this role? This action cannot be undone.
                  Staff members with this role will need to be reassigned.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex gap-2">
            <Button type="button" variant="outline" asChild>
              <Link href="/admin/roles">Cancel</Link>
            </Button>
            <Button type="submit" disabled={updateRole.isPending}>
              {updateRole.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
