/**
 * Prescription Detail Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Displays full prescription information including:
 * - Patient details
 * - Prescriber information
 * - Prescription items with dosage instructions
 * - Status and validity information
 * - Actions (cancel, dispense, print)
 */

'use client';

import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Calendar,
  User,
  FileText,
  Pill,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Ban
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePrescription, useCancelPrescription } from '@/lib/hooks/use-pharmacy';
import { PrescriptionStatus } from '@/lib/types/pharmacy';
import { useState } from 'react';
import { useToast } from '@/lib/hooks/use-toast';
import { PrescriptionPrintButton } from '@/components/pharmacy';
import { useAuth } from '@/lib/auth/context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { CommentThread } from '@/components/comments';

// Status badge colors
const STATUS_COLORS: Record<PrescriptionStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PARTIAL: 'bg-blue-100 text-blue-800',
  DISPENSED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
  EXPIRED: 'bg-red-100 text-red-800',
};

// Status icons
const STATUS_ICONS: Record<PrescriptionStatus, typeof Clock> = {
  PENDING: Clock,
  PARTIAL: Pill,
  DISPENSED: CheckCircle,
  CANCELLED: XCircle,
  EXPIRED: XCircle,
};

export default function PrescriptionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const prescriptionId = parseInt(params.id as string);

  const { data: prescription, isLoading, error } = usePrescription(prescriptionId);
  const cancelMutation = useCancelPrescription();
  const { user } = useAuth();
  const { isAdmin } = usePermissions();

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a reason for cancellation',
        variant: 'destructive',
      });
      return;
    }

    try {
      await cancelMutation.mutateAsync({
        id: prescriptionId,
        reason: cancelReason,
      });

      toast({
        title: 'Success',
        description: 'Prescription cancelled successfully',
      });

      setShowCancelDialog(false);
      setCancelReason('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to cancel prescription',
        variant: 'destructive',
      });
    }
  };

  const handleDispense = () => {
    // Navigate to dispensing page with prescription context
    router.push(`/pharmacy/dispensing?prescription=${prescriptionId}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid gap-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !prescription) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <XCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive">Failed to load prescription details</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const StatusIcon = STATUS_ICONS[prescription.status];
  const canCancel = prescription.status === 'PENDING' || prescription.status === 'PARTIAL';
  const canDispense = prescription.status === 'PENDING' || prescription.status === 'PARTIAL';
  const isExpired = !prescription.is_valid && prescription.status !== 'CANCELLED';

  return (
    <div className="space-y-6" data-testid="prescription-detail">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{prescription.prescription_number}</h1>
            <p className="text-muted-foreground">Prescription Details</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canCancel && (
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(true)}
              disabled={cancelMutation.isPending}
            >
              <Ban className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}
          {canDispense && (
            <Button onClick={handleDispense}>
              <Pill className="h-4 w-4 mr-2" />
              Dispense
            </Button>
          )}
          {prescription.status === 'DISPENSED' && (
            <Button variant="outline" onClick={() => router.push(`/pharmacy/dispensing?prescription=${prescriptionId}`)}>
              View History
            </Button>
          )}
          <PrescriptionPrintButton
            prescription={prescription}
            showOptions={true}
          />
        </div>
      </div>

      {/* Status Alert */}
      {isExpired && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <p className="text-sm font-medium text-destructive">
            This prescription has expired (valid until {format(new Date(prescription.valid_until), 'MMM d, yyyy')})
          </p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Patient Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Patient Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{prescription.patient_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">MRN</p>
              <p className="font-mono text-sm">{prescription.patient_mrn}</p>
            </div>
          </CardContent>
        </Card>

        {/* Prescription Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Prescription Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Prescriber</p>
              <p className="font-medium">{prescription.prescriber_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Prescribed Date</p>
              <p className="font-medium">{format(new Date(prescription.prescribed_date), 'MMM d, yyyy')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Valid Until</p>
              <p className="font-medium">{format(new Date(prescription.valid_until), 'MMM d, yyyy')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge className={STATUS_COLORS[prescription.status]}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {prescription.status}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Dispensing</p>
              <p className="font-medium">
                {prescription.dispensing_type === 'EXTERNAL'
                  ? 'External (Outside Pharmacy)'
                  : 'Internal (Hospital Pharmacy)'}
              </p>
            </div>
            {prescription.is_discharge_medication && (
              <div>
                <Badge variant="outline" className="border-green-300 text-green-700 dark:border-green-700 dark:text-green-400">
                  Discharge Medication
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Clinical Notes */}
      {prescription.clinical_notes && (
        <Card>
          <CardHeader>
            <CardTitle>Clinical Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{prescription.clinical_notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Prescription Items */}
      <Card>
        <CardHeader>
          <CardTitle>Prescription Items</CardTitle>
          <CardDescription>
            {prescription.items.length} item{prescription.items.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Drug</TableHead>
                <TableHead>Dosage</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Instructions</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(prescription.items ?? []).map((item) => (
                <TableRow key={item.id} data-testid="prescription-item">
                  <TableCell>
                    <div>
                      <p className="font-medium">{item.drug_name}</p>
                      {item.is_substitutable && (
                        <p className="text-xs text-muted-foreground">Substitutable</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{item.dosage}</TableCell>
                  <TableCell>{item.frequency}</TableCell>
                  <TableCell>{item.duration}</TableCell>
                  <TableCell>{item.route || '-'}</TableCell>
                  <TableCell>{item.instructions || '-'}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>Prescribed: {item.quantity_prescribed}</p>
                      <p>Dispensed: {item.quantity_dispensed}</p>
                      <p className="font-medium">Remaining: {item.remaining_quantity}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.is_cancelled ? (
                      <Badge variant="outline">Cancelled</Badge>
                    ) : item.quantity_dispensed >= item.quantity_prescribed ? (
                      <Badge className="bg-green-100 text-green-800">Complete</Badge>
                    ) : item.quantity_dispensed > 0 ? (
                      <Badge className="bg-blue-100 text-blue-800">Partial</Badge>
                    ) : (
                      <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Clinical Comments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comments</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentThread
            entityType="prescription"
            entityId={prescriptionId}
            currentUserId={user?.id}
            isAdmin={isAdmin}
          />
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Prescription</DialogTitle>
            <DialogDescription>
              Please provide a reason for cancelling this prescription. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for cancellation</Label>
              <Textarea
                id="reason"
                placeholder="Enter reason..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCancelDialog(false);
                setCancelReason('');
              }}
            >
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={!cancelReason.trim() || cancelMutation.isPending}
            >
              Cancel Prescription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
