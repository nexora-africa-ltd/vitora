/**
 * Drug Detail Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Edit, Package, Loader2, AlertTriangle, XCircle, Shield, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { pharmacyApi } from '@/lib/api/pharmacy';
import { DrugCategory, DrugForm, DrugSchedule } from '@/lib/types/pharmacy';

const CATEGORY_LABELS: Record<DrugCategory, string> = {
  ANALGESIC: 'Analgesic',
  ANTIBIOTIC: 'Antibiotic',
  ANTIMALARIAL: 'Antimalarial',
  ANTIRETROVIRAL: 'Antiretroviral',
  ANTIHYPERTENSIVE: 'Antihypertensive',
  ANTIDIABETIC: 'Antidiabetic',
  ANTIHISTAMINE: 'Antihistamine',
  VITAMIN: 'Vitamin',
  VACCINE: 'Vaccine',
  CONTRACEPTIVE: 'Contraceptive',
  PSYCHOTROPIC: 'Psychotropic',
  CONTROLLED: 'Controlled',
  OTHER: 'Other',
};

const FORM_LABELS: Record<DrugForm, string> = {
  TABLET: 'Tablet',
  CAPSULE: 'Capsule',
  SYRUP: 'Syrup',
  INJECTION: 'Injection',
  CREAM: 'Cream',
  OINTMENT: 'Ointment',
  DROPS: 'Drops',
  INHALER: 'Inhaler',
  SUPPOSITORY: 'Suppository',
  POWDER: 'Powder',
  SUSPENSION: 'Suspension',
  SOLUTION: 'Solution',
  GEL: 'Gel',
  PATCH: 'Patch',
  SPRAY: 'Spray',
};

const SCHEDULE_COLORS: Record<DrugSchedule, string> = {
  OTC: 'bg-green-100 text-green-800',
  POM: 'bg-blue-100 text-blue-800',
  P: 'bg-yellow-100 text-yellow-800',
  CD: 'bg-red-100 text-red-800',
};

export default function DrugDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const drugId = parseInt(resolvedParams.id);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: drug, isLoading, error } = useQuery({
    queryKey: ['drug', drugId],
    queryFn: () => pharmacyApi.getDrug(drugId),
  });

  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ['stock-batches', drugId],
    queryFn: () => pharmacyApi.listStockBatches({ drug: drugId }),
  });

  const handleDelete = async () => {
    if (!drug) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await pharmacyApi.deleteDrug(drug.id);
      router.push('/pharmacy');
    } catch (err: any) {
      console.error('Error deleting drug:', err);
      setDeleteError(
        err.response?.data?.detail || 
        err.message || 
        'Failed to delete drug. This drug may have existing stock.'
      );
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error || !drug) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error ? error.message : 'Drug not found'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const isLowStock = drug.current_stock > 0 && drug.current_stock < drug.default_reorder_level;
  const isOutOfStock = drug.current_stock === 0;

  return (
    <div className="space-y-6" data-testid="drug-detail">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{drug.generic_name}</h1>
            <p className="text-muted-foreground">{drug.code}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/pharmacy/drugs/${drug.id}/edit`)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="outline" onClick={() => router.push('/pharmacy?tab=inventory')}>
            <Package className="h-4 w-4 mr-2" />
            View Batches
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this drug from the catalog. This action cannot be undone.
                  {drug.current_stock > 0 && (
                    <div className="mt-2 text-destructive font-semibold">
                      Warning: This drug has {drug.current_stock} units in stock and cannot be deleted.
                    </div>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteError && (
                <Alert variant="destructive">
                  <AlertDescription>{deleteError}</AlertDescription>
                </Alert>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting || drug.current_stock > 0}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Drug Information Cards */}
      <div className="grid gap-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Drug Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Code</p>
                <p className="font-mono font-medium">{drug.code}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Generic Name</p>
                <p className="font-medium">{drug.generic_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Form</p>
                <p>{FORM_LABELS[drug.form]}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Strength</p>
                <p>{drug.strength}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Category</p>
                <Badge variant="secondary">{CATEGORY_LABELS[drug.category]}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Schedule</p>
                <Badge className={SCHEDULE_COLORS[drug.schedule]}>{drug.schedule}</Badge>
              </div>
            </div>

            {drug.brand_names && drug.brand_names.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Brand Names</p>
                <div className="flex flex-wrap gap-2">
                  {drug.brand_names.map((name, index) => (
                    <Badge key={index} variant="outline">{name}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {drug.is_essential && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  <Star className="h-3 w-3 mr-1" />
                  Essential (KEML)
                </Badge>
              )}
              {drug.is_controlled && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  <Shield className="h-3 w-3 mr-1" />
                  Controlled
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stock Information */}
        <Card>
          <CardHeader>
            <CardTitle>Stock Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Current Stock</p>
                <div className="flex items-center gap-2">
                  <p className={`text-2xl font-bold ${isOutOfStock ? 'text-destructive' : ''}`}>
                    {drug.current_stock}
                  </p>
                  {isOutOfStock && <XCircle className="h-5 w-5 text-destructive" />}
                  {isLowStock && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                </div>
                {isOutOfStock && (
                  <p className="text-sm text-destructive">Out of Stock</p>
                )}
                {isLowStock && (
                  <p className="text-sm text-yellow-600">Low Stock</p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Reorder Level</p>
                <p className="text-lg font-semibold">{drug.default_reorder_level}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Reorder Quantity</p>
                <p className="text-lg font-semibold">{drug.default_reorder_quantity}</p>
              </div>
              {drug.reference_price && (
                <div>
                  <p className="text-sm text-muted-foreground">Reference Price</p>
                  <p className="text-lg font-semibold">KES {drug.reference_price.toFixed(2)}</p>
                </div>
              )}
            </div>

            {batches && batches.results.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Batches in Stock</p>
                <div className="space-y-2">
                  {batches.results.slice(0, 5).map((batch) => (
                    <div key={batch.id} className="flex justify-between items-center p-2 border rounded">
                      <div>
                        <p className="font-medium">{batch.batch_number}</p>
                        <p className="text-sm text-muted-foreground">
                          Expires: {new Date(batch.expiry_date).toLocaleDateString()}
                          {batch.days_to_expiry < 90 && (
                            <span className="ml-2 text-yellow-600">({batch.days_to_expiry} days)</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{batch.quantity_available} units</p>
                        <Badge variant="outline">{batch.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
                {batches.results.length > 5 && (
                  <Button 
                    variant="link" 
                    onClick={() => router.push('/pharmacy?tab=inventory')}
                    className="mt-2"
                  >
                    View all {batches.results.length} batches
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Additional Information */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {drug.keml_code && (
                <div>
                  <p className="text-sm text-muted-foreground">KEML Code</p>
                  <p className="font-medium">{drug.keml_code}</p>
                </div>
              )}
              {drug.nhif_code && (
                <div>
                  <p className="text-sm text-muted-foreground">NHIF/SHA Code</p>
                  <p className="font-medium">{drug.nhif_code}</p>
                </div>
              )}
              {drug.shelf_life_months && (
                <div>
                  <p className="text-sm text-muted-foreground">Shelf Life</p>
                  <p>{drug.shelf_life_months} months</p>
                </div>
              )}
            </div>

            {drug.storage_requirements && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Storage Requirements</p>
                <p className="text-sm">{drug.storage_requirements}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
