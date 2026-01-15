/**
 * New Department Page
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, Loader2 } from 'lucide-react';
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
import { useToast } from '@/lib/hooks/use-toast';
import { useCreateDepartment, useDepartments, useStaffList } from '@/lib/hooks/use-rbac';
import type { DepartmentType, DepartmentCreateData } from '@/lib/types/rbac';

const DEPARTMENT_TYPES: { value: DepartmentType; label: string }[] = [
  { value: 'CLINICAL', label: 'Clinical' },
  { value: 'ANCILLARY', label: 'Ancillary' },
  { value: 'ADMINISTRATIVE', label: 'Administrative' },
  { value: 'SUPPORT', label: 'Support' },
];

export default function NewDepartmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const createDepartment = useCreateDepartment();
  const { data: departments } = useDepartments();
  const { data: staff } = useStaffList();

  const [formData, setFormData] = useState<DepartmentCreateData>({
    name: '',
    code: '',
    description: '',
    department_type: 'CLINICAL',
    parent: null,
    head: null,
    is_active: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await createDepartment.mutateAsync(formData);
      toast({
        title: 'Success',
        description: 'Department created successfully',
      });
      router.push('/admin/departments');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create department',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/departments">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            New Department
          </h1>
          <p className="text-muted-foreground">
            Create a new organizational department
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Department Details</CardTitle>
            <CardDescription>
              Enter the basic information for the new department
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Outpatient Department"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., OPD"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the department..."
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
                    {departments?.results.map((dept) => (
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

            <div className="flex justify-end gap-4 pt-4">
              <Button variant="outline" type="button" asChild>
                <Link href="/admin/departments">Cancel</Link>
              </Button>
              <Button type="submit" disabled={createDepartment.isPending}>
                {createDepartment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Department
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
