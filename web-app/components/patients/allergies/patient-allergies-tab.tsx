/**
 * Patient Allergies Tab Component
 *
 * Displays and manages allergies for a patient with high-risk warnings.
 */

'use client';

import { useState } from 'react';
import { AlertTriangle, Plus, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { HelpPopover } from '@/components/shared/help-popover';
import { usePatientAllergies } from '@/lib/hooks/use-allergies';
import { AllergyListItemRow } from './allergy-list-item';
import { AllergyFormDialog } from './allergy-form-dialog';

interface PatientAllergiesTabProps {
  patientId: number;
  readOnly?: boolean;
}

export function PatientAllergiesTab({ patientId, readOnly = false }: PatientAllergiesTabProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: allergies, isLoading } = usePatientAllergies(patientId);

  // Filter to active allergies
  const activeAllergies = allergies?.filter((a) => a.status === 'active') ?? [];
  const resolvedAllergies = allergies?.filter((a) => a.status !== 'active') ?? [];
  const highRiskAllergies = activeAllergies.filter((a) => a.is_high_risk);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base sm:text-lg">Allergies</CardTitle>
          {activeAllergies.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {activeAllergies.length}
            </Badge>
          )}
          <HelpPopover content="View and manage patient allergies. High-risk allergies trigger warnings during prescribing and dispensing." />
        </div>
        {!readOnly && (
          <Button size="sm" onClick={() => setShowAddDialog(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-1" />
            Add Allergy
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* High Risk Warning Banner */}
        {highRiskAllergies.length > 0 && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>High-Risk Allergies Present</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1 ml-6">
              {highRiskAllergies.map((a) => a.substance).join(', ')}
            </p>
          </div>
        )}

        {/* No Known Allergies */}
        {activeAllergies.length === 0 && resolvedAllergies.length === 0 && (
          <EmptyState
            icon={Shield}
            title="No known allergies"
            description="No allergies have been recorded for this patient."
          />
        )}

        {/* Active Allergies List */}
        {activeAllergies.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Active</h4>
            <div className="space-y-2">
              {activeAllergies.map((allergy) => (
                <AllergyListItemRow
                  key={allergy.id}
                  allergy={allergy}
                  patientId={patientId}
                  readOnly={readOnly}
                />
              ))}
            </div>
          </div>
        )}

        {/* Resolved Allergies (collapsible) */}
        {resolvedAllergies.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <h4 className="text-sm font-medium text-muted-foreground">
              Resolved / Inactive ({resolvedAllergies.length})
            </h4>
            <div className="space-y-2 opacity-60">
              {resolvedAllergies.map((allergy) => (
                <AllergyListItemRow
                  key={allergy.id}
                  allergy={allergy}
                  patientId={patientId}
                  readOnly={readOnly}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Add Allergy Dialog */}
      <AllergyFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        patientId={patientId}
      />
    </Card>
  );
}
