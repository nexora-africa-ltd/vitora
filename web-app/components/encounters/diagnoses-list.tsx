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
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {diagnosis.icd10_code_display && (
                    <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">
                      {diagnosis.icd10_code_display}
                    </code>
                  )}
                  {diagnosis.icd11_code && (
                    <Badge variant="outline" className="font-mono text-xs">
                      ICD-11: {diagnosis.icd11_code}
                    </Badge>
                  )}
                  {diagnosis.snomed_code && (
                    <Badge
                      variant="outline"
                      className="bg-purple-50 font-mono text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    >
                      SCT: {diagnosis.snomed_code}
                    </Badge>
                  )}
                  <Badge className={diagnosisTypeColors[diagnosis.diagnosis_type]}>
                    {diagnosis.diagnosis_type}
                  </Badge>
                </div>
                <p className="font-medium">
                  {diagnosis.icd11_display?.split(' - ').slice(1).join(' - ') ||
                    diagnosis.icd10_description ||
                    diagnosis.snomed_display ||
                    diagnosis.free_text_diagnosis}
                </p>
                {diagnosis.notes && (
                  <p className="mt-2 text-sm text-muted-foreground">{diagnosis.notes}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
