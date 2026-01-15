'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Building2, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/lib/hooks/use-toast';
import { useInpatientWard, useUpdateWard } from '@/lib/hooks/use-inpatient';
import type { InpatientWardType } from '@/lib/types/inpatient';

const WARD_TYPES: { value: InpatientWardType; label: string }[] = [
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'SURGICAL', label: 'Surgical' },
  { value: 'PEDIATRIC', label: 'Pediatric' },
  { value: 'MATERNITY', label: 'Maternity' },
  { value: 'ICU', label: 'Intensive Care Unit (ICU)' },
  { value: 'ISOLATION', label: 'Isolation' },
];

const wardSchema = z.object({
  name: z.string().min(1, 'Ward name is required'),
  code: z.string().min(1, 'Ward code is required'),
  ward_type: z.enum(['MEDICAL', 'SURGICAL', 'PEDIATRIC', 'MATERNITY', 'ICU', 'ISOLATION']),
  floor: z.string().optional(),
  capacity: z.coerce.number().min(1, 'Capacity must be at least 1'),
  daily_rate: z.string().min(1, 'Daily rate is required'),
  description: z.string().optional(),
  is_active: z.boolean(),
});

type WardFormData = z.infer<typeof wardSchema>;

export default function WardEditPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const wardId = Number(params.id);

  const { data: ward, isLoading } = useInpatientWard(wardId);
  const updateWard = useUpdateWard();

  const form = useForm<WardFormData>({
    resolver: zodResolver(wardSchema),
    defaultValues: {
      name: '',
      code: '',
      ward_type: 'MEDICAL',
      floor: '',
      capacity: 1,
      daily_rate: '0',
      description: '',
      is_active: true,
    },
  });

  // Populate form when ward data loads
  useEffect(() => {
    if (ward) {
      form.reset({
        name: ward.name,
        code: ward.code,
        ward_type: ward.ward_type,
        floor: ward.floor || '',
        capacity: ward.capacity,
        daily_rate: ward.daily_rate,
        description: ward.description || '',
        is_active: ward.is_active,
      });
    }
  }, [ward, form]);

  const onSubmit = async (data: WardFormData) => {
    try {
      await updateWard.mutateAsync({ id: wardId, data });
      toast({
        title: 'Ward Updated',
        description: 'Ward settings have been saved successfully.',
      });
      router.push(`/wards/${wardId}`);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update ward. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!ward) {
    return (
      <div className="container mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold">Ward not found</h2>
        <p className="text-muted-foreground mt-2">
          The ward you&apos;re looking for doesn&apos;t exist.
        </p>
        <Button onClick={() => router.push('/wards')} className="mt-4">
          Back to Wards
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Link href={`/wards/${wardId}`} className="text-sm text-muted-foreground hover:text-primary">
          Back to {ward.name}
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <Building2 className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Edit Ward: {ward.name}</h1>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Ward Details</CardTitle>
            <CardDescription>
              Update the basic information for this ward.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Ward Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Medical Ward A"
                  {...form.register('name')}
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Ward Code *</Label>
                <Input
                  id="code"
                  placeholder="e.g., MED-A"
                  {...form.register('code')}
                />
                {form.formState.errors.code && (
                  <p className="text-sm text-destructive">{form.formState.errors.code.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ward_type">Ward Type *</Label>
                <Select
                  value={form.watch('ward_type')}
                  onValueChange={(value) => form.setValue('ward_type', value as InpatientWardType)}
                >
                  <SelectTrigger id="ward_type">
                    <SelectValue placeholder="Select ward type" />
                  </SelectTrigger>
                  <SelectContent>
                    {WARD_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.ward_type && (
                  <p className="text-sm text-destructive">{form.formState.errors.ward_type.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="floor">Floor / Location</Label>
                <Input
                  id="floor"
                  placeholder="e.g., 2nd Floor, Block A"
                  {...form.register('floor')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="capacity">Bed Capacity *</Label>
                <Input
                  id="capacity"
                  type="number"
                  min={1}
                  {...form.register('capacity')}
                />
                {form.formState.errors.capacity && (
                  <p className="text-sm text-destructive">{form.formState.errors.capacity.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="daily_rate">Daily Rate (KES) *</Label>
                <Input
                  id="daily_rate"
                  placeholder="e.g., 2500.00"
                  {...form.register('daily_rate')}
                />
                {form.formState.errors.daily_rate && (
                  <p className="text-sm text-destructive">{form.formState.errors.daily_rate.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description of the ward..."
                rows={3}
                {...form.register('description')}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="is_active">Ward Active</Label>
                <p className="text-sm text-muted-foreground">
                  Inactive wards won&apos;t accept new admissions.
                </p>
              </div>
              <Switch
                id="is_active"
                checked={form.watch('is_active')}
                onCheckedChange={(checked) => form.setValue('is_active', checked)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={updateWard.isPending}>
            {updateWard.isPending ? (
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
      </form>
    </div>
  );
}
