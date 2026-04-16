'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { PageHeader } from '@/components/shared/page-header';
import { inventoryApi } from '@/lib/api/inventory';
import { getApiErrorMessage } from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';
import type { StoreLocationType } from '@/lib/types/inventory';

const locationTypeLabels: Record<StoreLocationType, string> = {
  MAIN_STORE: 'Main Store',
  SATELLITE_PHARMACY: 'Satellite Pharmacy',
  WARD_STORE: 'Ward Store',
  THEATRE_STORE: 'Theatre Store',
  LAB_STORE: 'Lab Store',
};

const locationTypeColors: Record<StoreLocationType, string> = {
  MAIN_STORE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  SATELLITE_PHARMACY: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  WARD_STORE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  THEATRE_STORE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  LAB_STORE: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
};

const editSchema = z.object({
  code: z.string().min(1, 'Code required'),
  name: z.string().min(1, 'Name required'),
  location_type: z.string().min(1, 'Type required'),
  is_active: z.boolean(),
  notes: z.string().optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

export default function StoreLocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = parseInt(resolvedParams.id, 10);
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const {
    data: location,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['inventory-store-location', id],
    queryFn: () => inventoryApi.getStoreLocation(id),
    enabled: !isNaN(id),
  });

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    values: location
      ? {
          code: location.code,
          name: location.name,
          location_type: location.location_type,
          is_active: location.is_active,
          notes: location.notes || '',
        }
      : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: (data: EditFormValues) =>
      inventoryApi.updateStoreLocation(id, {
        code: data.code,
        name: data.name,
        location_type: data.location_type as StoreLocationType,
        is_active: data.is_active,
        notes: data.notes,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['inventory-store-location', id], updated);
      queryClient.invalidateQueries({ queryKey: ['inventory-store-locations'] });
      toast({ variant: 'success', title: 'Location updated' });
      setEditOpen(false);
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Update failed', description: getApiErrorMessage(err) });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () =>
      inventoryApi.updateStoreLocation(id, { is_active: !location?.is_active }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['inventory-store-location', id], updated);
      queryClient.invalidateQueries({ queryKey: ['inventory-store-locations'] });
      toast({
        variant: 'success',
        title: updated.is_active ? 'Location activated' : 'Location deactivated',
      });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Toggle failed', description: getApiErrorMessage(err) });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !location) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load store location.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={location.name}
        helpContent="View and manage store location details."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleActiveMutation.mutate()}
              disabled={toggleActiveMutation.isPending}
            >
              {location.is_active ? 'Deactivate' : 'Activate'}
            </Button>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Pencil className="mr-1 h-4 w-4" />
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Edit Store Location</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Code *</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name *</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="location_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(locationTypeLabels).map(([val, label]) => (
                                <SelectItem key={val} value={val}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea rows={3} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={updateMutation.isPending}>
                        {updateMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Save
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* Summary bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {location.code}
            <span className="text-muted-foreground"> • {location.name}</span>
          </p>
          {location.managed_by_name && (
            <p className="text-xs sm:text-sm text-muted-foreground">
              Managed by {location.managed_by_name}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Badge variant="outline" className={locationTypeColors[location.location_type]}>
            {locationTypeLabels[location.location_type]}
          </Badge>
          <Badge variant={location.is_active ? 'default' : 'secondary'}>
            {location.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      {/* Details card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Location Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Code</dt>
              <dd className="font-medium">{location.code}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{location.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Type</dt>
              <dd>
                <Badge variant="outline" className={locationTypeColors[location.location_type]}>
                  {locationTypeLabels[location.location_type]}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Manager</dt>
              <dd className="font-medium">{location.managed_by_name || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge variant={location.is_active ? 'default' : 'secondary'}>
                  {location.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="font-medium">
                {new Date(location.created_at).toLocaleDateString()}
              </dd>
            </div>
            {location.notes && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="font-medium whitespace-pre-wrap">{location.notes}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
