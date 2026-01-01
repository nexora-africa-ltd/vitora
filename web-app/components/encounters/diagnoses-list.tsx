import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Diagnosis } from '@/lib/types/encounter';
import { ClipboardList } from 'lucide-react';

interface DiagnosesListProps {
  diagnoses: Diagnosis[];
}

const diagnosisTypeColors: Record<string, string> = {
  PRIMARY: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  SECONDARY: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  DIFFERENTIAL: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

export function DiagnosesList({ diagnoses }: DiagnosesListProps) {
  if (!diagnoses.length) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No diagnoses"
        description="No diagnoses have been recorded for this encounter."
      />
    );
  }

  return (
    <div className="space-y-3">
      {diagnoses.map((diagnosis) => (
        <Card key={diagnosis.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {diagnosis.icd10_code_display && (
                    <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                      {diagnosis.icd10_code_display}
                    </code>
                  )}
                  <Badge className={diagnosisTypeColors[diagnosis.diagnosis_type]}>
                    {diagnosis.diagnosis_type}
                  </Badge>
                </div>
                <p className="font-medium">
                  {diagnosis.icd10_description || diagnosis.free_text_diagnosis}
                </p>
                {diagnosis.notes && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {diagnosis.notes}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
