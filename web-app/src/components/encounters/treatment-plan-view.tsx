import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { TreatmentPlan } from '@/lib/types/encounter';
import { Pill, Calendar, ClipboardPlus } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';

interface TreatmentPlanViewProps {
  treatmentPlan: TreatmentPlan | null | undefined;
}

export function TreatmentPlanView({ treatmentPlan }: TreatmentPlanViewProps) {
  if (!treatmentPlan) {
    return (
      <EmptyState
        icon={ClipboardPlus}
        title="No treatment plan"
        description="No treatment plan has been created for this encounter."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Plan text */}
      {treatmentPlan.clinical_notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Treatment Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{treatmentPlan.clinical_notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Medications */}
      {treatmentPlan.medications && treatmentPlan.medications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Pill className="h-5 w-5" />
              Medications ({treatmentPlan.medications.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {treatmentPlan.medications.map((med) => (
                <div
                  key={med.id}
                  className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{med.name}</h4>
                    <Badge variant="outline">{med.route}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Dosage: </span>
                      {med.dosage}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Frequency: </span>
                      {med.frequency}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Duration: </span>
                      {med.duration}
                    </div>
                  </div>
                  {med.instructions && (
                    <p className="text-sm text-muted-foreground">
                      Instructions: {med.instructions}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Follow-up */}
      {treatmentPlan.follow_up_date && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Follow-up
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {formatDate(treatmentPlan.follow_up_date)}
            </p>
            {treatmentPlan.follow_up_instructions && (
              <p className="text-sm text-muted-foreground mt-2">
                {treatmentPlan.follow_up_instructions}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
