/**
 * Edit Department Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/lib/hooks/use-toast';
import { useDepartment, useUpdateDepartment, useDeleteDepartment, useDepartments, useStaffList } from '@/lib/hooks/use-rbac';
import type { DepartmentType, DepartmentUpdateData } from '@/lib/types/rbac';

const DEPARTMENT_TYPES: { value: DepartmentType; label: string }[] = [
  { value: 'CLINICAL', label: 'Clinical' },
  { value: 'ADMINISTRATIVE', label: 'Administrative' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'LABORATORY', label: 'Laboratory' },
  { value: 'PHARMACY', label: 'Pharmacy' },
  { value: 'RADIOLOGY', label: 'Radiology' },
  { value: 'RECORDS', label: 'Medical Records' },
];

export default function EditDepartmentPage() {
  const router = useRouter();
  const params = useParams();
  const departmentId = parseInt(params.id as string);
  const { toast } = useToast();

  const { data: department, isLoading, error } = useDepartment(departmentId);
  const updateDepartment = useUpdateDepartment();
  const deleteDepartment = useDeleteDepartment();
  const { data: departments } = useDepartments({ page_size: 100 });
  const { data: staff } = useStaffList({ page_size: 100, employment_status: 'ACTIVE' });

  const [formData, setFormData] = useState<DepartmentUpdateData>({});

  // Initialize form when department loads
  useEffect(() => {
    if (department) {
      setFormData({
        name: department.name,
        code: department.code,
        description: department.description,
        department_type: department.department_type,
        parent: department.parent,
        head: department.head,
        is_active: department.is_active,
      });
    }
  }, [department]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updateDepartment.mutateAsync({ id: departmentId, data: formData });
      toast({
        title: 'Success',
        description: 'Department updated successfully',
      });
      router.push('/admin/departments');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update department',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDepartment.mutateAsync(departmentId);
      toast({
        title: 'Success',
        description: 'Department deleted successfully',
      });
      router.push('/admin/departments');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete department',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !department) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Edit Department"
          helpContent="Update department structure, leadership, and reporting relationships."
        />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Department not found or failed to load.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={department.name}
        helpContent="Update department structure, leadership, and reporting relationships."
        actions={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Department</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete this department permanently. Reassign dependent staff and child departments first to avoid broken references.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete Department</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />

      <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">
            {department.code}
            <span className="text-muted-foreground"> • {department.department_type_display}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {department.head_name || 'No department head assigned'}
            <span className="text-muted-foreground"> • </span>
            {department.staff_count} staff assigned
          </p>
        </div>
        <Badge variant={department.is_active ? 'default' : 'secondary'} className="w-fit shrink-0 self-start sm:self-auto">
          {department.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Department Details</CardTitle>
            <CardDescription>
              Update the department information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  autoComplete="organization"
                  id="name"
                  name="name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Outpatient Department…"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  autoComplete="off"
                  id="code"
                  name="code"
                  spellCheck={false}
                  value={formData.code || ''}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., OPD…"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the department…"
                rows={3}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={formData.department_type}
                  onValueChange={(value) => setFormData({ ...formData, department_type: value as DepartmentType })}
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="parent">Parent Department</Label>
                <Select
                  value={formData.parent?.toString() || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, parent: value === 'none' ? null : parseInt(value) })}
                >
                  <SelectTrigger id="parent">
                    <SelectValue placeholder="Select parent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Top-level)</SelectItem>
                    {departments?.results
                      .filter((d) => d.id !== departmentId)
                      .map((dept) => (
                        <SelectItem key={dept.id} value={dept.id.toString()}>
                          {dept.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="head">Department Head</Label>
              <Select
                value={formData.head?.toString() || 'none'}
                onValueChange={(value) => setFormData({ ...formData, head: value === 'none' ? null : parseInt(value) })}
              >
                <SelectTrigger id="head">
                  <SelectValue placeholder="Select head" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not assigned</SelectItem>
                  {staff?.results.map((person) => (
                    <SelectItem key={person.id} value={person.id.toString()}>
                      {person.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end">
              <Button variant="outline" type="button" asChild>
                <Link href="/admin/departments">Cancel</Link>
              </Button>
              <Button type="submit" disabled={updateDepartment.isPending}>
                {updateDepartment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
