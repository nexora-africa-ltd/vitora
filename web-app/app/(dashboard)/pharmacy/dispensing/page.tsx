/**
 * Dispensing Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Page for dispensing prescriptions. Can be accessed:
 * - Directly: /pharmacy/dispensing (shows pending queue)
 * - With prescription: /pharmacy/dispensing?prescription=[id]
 */

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Pill,
  User,
  FileText,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import {
  usePrescription,
  usePendingPrescriptions,
} from '@/lib/hooks/use-pharmacy';
import { DispenseDialog } from '@/components/pharmacy/dispensing/dispense-dialog';
import { PrescriptionItem, PrescriptionStatus } from '@/lib/types/pharmacy';

// Status badge colors
const STATUS_COLORS: Record<PrescriptionStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PARTIAL: 'bg-blue-100 text-blue-800',
  DISPENSED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
  EXPIRED: 'bg-red-100 text-red-800',
};

export default function DispensingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prescriptionId = searchParams.get('prescription');
  const { refresh, isRefreshing } = usePageRefresh();
  const { canPerformAction } = usePermissions();

  // If prescription ID is provided, show that prescription
  // Otherwise show the pending prescriptions queue
  const {
    data: prescription,
    isLoading: prescriptionLoading,
    error: prescriptionError,
  } = usePrescription(prescriptionId ? parseInt(prescriptionId) : 0);

  const {
    data: pendingPrescriptions,
    isLoading: pendingLoading,
  } = usePendingPrescriptions();

  // Dialog state
  const [dispenseDialog, setDispenseDialog] = useState<{
    isOpen: boolean;
    item: PrescriptionItem | null;
  }>({ isOpen: false, item: null });

  // If no prescription ID, show the queue
  if (!prescriptionId) {
    return (
      <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
        <div className="space-y-4 sm:space-y-6" data-testid="dispensing-queue">
          <PageHeader
            title="Dispensing Queue"
            helpContent="Prescriptions waiting to be dispensed. Click on a prescription to review and dispense its medications."
          />

          {/* Pending Prescriptions List */}
          <Card>
            <CardHeader>
              <CardTitle>Pending Prescriptions</CardTitle>
              <CardDescription>
                Click on a prescription to dispense
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !pendingPrescriptions?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p>No pending prescriptions</p>
                  <p className="text-sm">All prescriptions have been dispensed</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingPrescriptions.map((rx) => (
                    <div
                      key={rx.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/pharmacy/dispensing?prescription=${rx.id}`)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-primary/10 rounded-full">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{rx.prescription_number}</div>
                          <div className="text-sm text-muted-foreground">
                            {rx.patient_name} • {rx.items?.length || 0} items
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4">
                        <Badge className={`${STATUS_COLORS[rx.effective_status ?? rx.status]} shrink-0 w-fit`}>
                          {rx.effective_status ?? rx.status}
                        </Badge>
                        <div className="hidden sm:block text-sm text-muted-foreground">
                          {rx.prescribed_date && format(new Date(rx.prescribed_date), 'MMM d, yyyy')}
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PullToRefresh>
    );
  }

  // Loading state for specific prescription
  if (prescriptionLoading) {
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

  // Error state
  if (prescriptionError || !prescription) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive">Failed to load prescription</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/pharmacy/dispensing')}>
          Back to Queue
        </Button>
      </div>
    );
  }

  const isExpired = prescription.effective_status === 'EXPIRED' || prescription.status === 'EXPIRED';
  const canDispense = !isExpired && (prescription.status === 'PENDING' || prescription.status === 'PARTIAL');

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6" data-testid="dispensing-page">
        <PageHeader
          title={`Dispense: ${prescription.prescription_number}`}
          helpContent="Review and dispense medications for this prescription. Each item can be dispensed individually."
          actions={
            <Badge className={`${STATUS_COLORS[prescription.effective_status ?? prescription.status]} shrink-0 w-fit`}>
              {prescription.effective_status ?? prescription.status}
            </Badge>
          }
        />

        {/* Expired Prescription Alert */}
        {isExpired && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Prescription Expired</AlertTitle>
            <AlertDescription>
              <p>
                This prescription expired on{' '}
                {prescription.valid_until
                  ? format(new Date(prescription.valid_until), 'MMMM d, yyyy')
                  : 'a previous date'}
                . Expired prescriptions cannot be dispensed for patient safety.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                {canPerformAction('pharmacy.create_prescription') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto border-destructive/30 hover:bg-destructive/10"
                    asChild
                  >
                    <Link href={`/pharmacy/prescriptions/new?patient=${prescription.patient}${prescription.encounter ? `&encounter=${prescription.encounter}` : ''}`}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Create New Prescription
                    </Link>
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">
                  Contact the prescriber to issue a renewal if the medication is still needed.
                </span>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Patient & Prescription Summary Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {prescription.patient_name}
              <span className="text-muted-foreground"> • {prescription.patient_mrn}</span>
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Prescribed by {prescription.prescriber_name} on{' '}
              {prescription.prescribed_date && format(new Date(prescription.prescribed_date), 'MMM d, yyyy')}
            </p>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground shrink-0">
            Valid until{' '}
            {prescription.valid_until && format(new Date(prescription.valid_until), 'MMM d, yyyy')}
          </p>
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
            <CardTitle>Medications to Dispense</CardTitle>
            <CardDescription>
              {isExpired
                ? 'This prescription has expired and cannot be dispensed'
                : canDispense
                  ? 'Click "Dispense" to dispense each medication'
                  : 'This prescription cannot be dispensed'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <div className="overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Medication</TableHead>
                    <TableHead>Dosage</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-center">Prescribed</TableHead>
                    <TableHead className="text-center">Dispensed</TableHead>
                    <TableHead className="text-center">Remaining</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prescription.items?.map((item) => {
                    const remaining = item.quantity_prescribed - (item.quantity_dispensed || 0);
                    const isFullyDispensed = remaining <= 0;

                    return (
                      <TableRow key={item.id} className={isExpired ? 'opacity-60' : ''}>
                        <TableCell className="font-medium">{item.drug_name}</TableCell>
                        <TableCell>{item.dosage}</TableCell>
                        <TableCell>{item.frequency}</TableCell>
                        <TableCell>{item.duration}</TableCell>
                        <TableCell className="text-center">{item.quantity_prescribed}</TableCell>
                        <TableCell className="text-center">{item.quantity_dispensed || 0}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={isFullyDispensed ? 'secondary' : 'outline'}>
                            {remaining}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {isExpired ? (
                            <Badge variant="secondary" className="bg-red-100 text-red-800">
                              Expired
                            </Badge>
                          ) : isFullyDispensed ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Dispensed
                            </Badge>
                          ) : canDispense ? (
                            <Button
                              size="sm"
                              onClick={() => setDispenseDialog({ isOpen: true, item })}
                            >
                              <Pill className="h-4 w-4 mr-1" />
                              Dispense
                            </Button>
                          ) : (
                            <Badge variant="secondary">N/A</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Dispense Dialog */}
        {dispenseDialog.isOpen && dispenseDialog.item && (
          <DispenseDialog
            isOpen={dispenseDialog.isOpen}
            onClose={() => setDispenseDialog({ isOpen: false, item: null })}
            prescription={prescription}
            prescriptionItem={dispenseDialog.item}
            onSuccess={() => {
              setDispenseDialog({ isOpen: false, item: null });
            }}
          />
        )}
      </div>
    </PullToRefresh>
  );
}
