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
import { ArrowLeft, Shield, Save, Loader2, Trash2, AlertTriangle } from 'lucide-react';
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
import { useToast } from '@/lib/hooks/use-toast';
import { useRole, useUpdateRole, useDeleteRole, usePermissions } from '@/lib/hooks/use-rbac';

const ROLE_TYPES = [
  { value: 'CLINICAL', label: 'Clinical' },
  { value: 'ANCILLARY', label: 'Ancillary' },
  { value: 'ADMINISTRATIVE', label: 'Administrative' },
];

// Group permissions by category for display
function groupPermissions(permissions: string[]) {
  const groups: Record<string, string[]> = {};
  permissions.forEach((perm) => {
    const [category] = perm.split('.');
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(perm);
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
  const [roleType, setRoleType] = useState('CLINICAL');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(false);

  // Initialize form when role loads
  useEffect(() => {
    if (role) {
      setName(role.name);
      setCode(role.code);
      setDescription(role.description || '');
      setRoleType(role.role_type);
      setSelectedPermissions(role.permissions || []);
      setIsDefault(role.is_default);
    }
  }, [role]);

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
          role_type: roleType,
          permissions: selectedPermissions,
          is_default: isDefault,
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

  const groupedPermissions = allPermissions?.results 
    ? groupPermissions(allPermissions.results.map((p) => p.codename))
    : {};

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

      {/* System Role Warning */}
      {role.is_system && (
        <Alert className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This is a system role and cannot be deleted. Some fields may be restricted.
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
                  disabled={role.is_system}
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
                  disabled={role.is_system}
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
                <Label htmlFor="role_type">Type *</Label>
                <Select value={roleType} onValueChange={setRoleType} disabled={role.is_system}>
                  <SelectTrigger id="role_type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2 pt-8">
                <Checkbox
                  id="is_default"
                  checked={isDefault}
                  onCheckedChange={(checked) => setIsDefault(checked as boolean)}
                />
                <Label htmlFor="is_default">Default role for new staff</Label>
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
            <div className="grid gap-6 md:grid-cols-2">
              {Object.entries(groupedPermissions).map(([category, perms]) => (
                <div key={category} className="space-y-3">
                  <h4 className="font-medium capitalize flex items-center gap-2">
                    <Badge variant="outline">{category}</Badge>
                  </h4>
                  <div className="space-y-2 pl-4">
                    {perms.map((perm) => (
                      <div key={perm} className="flex items-center space-x-2">
                        <Checkbox
                          id={perm}
                          checked={selectedPermissions.includes(perm)}
                          onCheckedChange={() => handlePermissionToggle(perm)}
                        />
                        <Label htmlFor={perm} className="text-sm font-normal">
                          {perm.split('.')[1]?.replace(/_/g, ' ')}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {Object.keys(groupedPermissions).length === 0 && (
              <p className="text-muted-foreground text-center py-4">
                No permissions available
              </p>
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
                disabled={role.is_system || deleteRole.isPending}
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
