/**
 * Encounter Prescriptions Component
 * Shows prescriptions for a specific encounter with ability to create new prescriptions
 * Sprint 1.5-1.6: Pharmacy Integration
 */
'use client';

import Link from 'next/link';
import { Plus, Pill, ExternalLink, Clock, CheckCircle2, AlertCircle, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useEncounterPrescriptions } from '@/lib/hooks/use-pharmacy';
import { formatDate } from '@/lib/utils/format';
import type { Prescription, PrescriptionStatus } from '@/lib/types/pharmacy';

interface EncounterPrescriptionsProps {
  encounterId: number;
  patientId: number;
  disabled?: boolean;
}

const STATUS_CONFIG: Record<PrescriptionStatus, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', icon: Clock },
  PARTIAL: { label: 'Partial', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300', icon: Package },
  DISPENSED: { label: 'Dispensed', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300', icon: AlertCircle },
  EXPIRED: { label: 'Expired', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', icon: AlertCircle },
};

export function EncounterPrescriptions({ encounterId, patientId, disabled = false }: EncounterPrescriptionsProps) {
  const { data: prescriptions, isLoading, error } = useEncounterPrescriptions(encounterId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Pill className="h-5 w-5" />
            Prescriptions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Pill className="h-5 w-5" />
            Prescriptions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load prescriptions.</p>
        </CardContent>
      </Card>
    );
  }

  const pendingPrescriptions = prescriptions?.filter(p => p.status === 'PENDING' || p.status === 'PARTIAL') || [];
  const completedPrescriptions = prescriptions?.filter(p => p.status === 'DISPENSED') || [];
  const otherPrescriptions = prescriptions?.filter(p => p.status === 'CANCELLED' || p.status === 'EXPIRED') || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Pill className="h-5 w-5" />
            Prescriptions
            {prescriptions && prescriptions.length > 0 && (
              <Badge variant="secondary">{prescriptions.length}</Badge>
            )}
          </CardTitle>
          {!disabled && (
            <Button size="sm" asChild>
              <Link href={`/pharmacy/prescriptions/new?encounter=${encounterId}&patient=${patientId}`}>
                <Plus className="h-4 w-4 mr-1" />
                New Prescription
              </Link>
            </Button>
          )}
        </div>
        {prescriptions && prescriptions.length === 0 && (
          <CardDescription>No prescriptions for this encounter</CardDescription>
        )}
      </CardHeader>

      {prescriptions && prescriptions.length > 0 && (
        <CardContent className="space-y-4">
          {/* Pending Prescriptions */}
          {pendingPrescriptions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Awaiting Dispensing ({pendingPrescriptions.length})</h4>
              <div className="space-y-2">
                {pendingPrescriptions.map((prescription) => (
                  <PrescriptionCard key={prescription.id} prescription={prescription} />
                ))}
              </div>
            </div>
          )}

          {/* Completed Prescriptions */}
          {completedPrescriptions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Dispensed ({completedPrescriptions.length})</h4>
              <div className="space-y-2">
                {completedPrescriptions.map((prescription) => (
                  <PrescriptionCard key={prescription.id} prescription={prescription} />
                ))}
              </div>
            </div>
          )}

          {/* Cancelled/Expired */}
          {otherPrescriptions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Other ({otherPrescriptions.length})</h4>
              <div className="space-y-2">
                {otherPrescriptions.map((prescription) => (
                  <PrescriptionCard key={prescription.id} prescription={prescription} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}

      {prescriptions && prescriptions.length === 0 && !disabled && (
        <CardFooter className="pt-0">
          <Button variant="outline" className="w-full" asChild>
            <Link href={`/pharmacy/prescriptions/new?encounter=${encounterId}&patient=${patientId}`}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Prescription
            </Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function PrescriptionCard({ prescription }: { prescription: Prescription }) {
  const statusConfig = STATUS_CONFIG[prescription.status];
  const StatusIcon = statusConfig.icon;

  // Get medication names from items
  const medicationNames = prescription.items?.map(item => item.drug_name).join(', ') || 'No medications';
  const itemCount = prescription.items?.length || 0;

  return (
    <Link href={`/pharmacy/prescriptions/${prescription.id}`}>
      <div className="p-3 rounded-md border hover:bg-muted/50 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{prescription.prescription_number || `Prescription #${prescription.id}`}</span>
              <Badge className={statusConfig.color} variant="secondary">
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusConfig.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {itemCount} medication{itemCount !== 1 ? 's' : ''}: {medicationNames}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Prescribed {formatDate(prescription.prescribed_date)}
              {prescription.prescriber_name && ` by ${prescription.prescriber_name}`}
            </p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>

        {/* Show validity warning */}
        {prescription.status === 'PENDING' && prescription.valid_until && (
          <div className="mt-2 pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Valid until {formatDate(prescription.valid_until)}
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}

export default EncounterPrescriptions;
