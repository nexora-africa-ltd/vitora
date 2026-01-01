import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Encounter } from '@/lib/types/encounter';
import { AlertTriangle, Pill, Scissors, Users, Heart } from 'lucide-react';

interface MedicalHistoryViewProps {
  encounter: Encounter;
}

export function MedicalHistoryView({ encounter }: MedicalHistoryViewProps) {
  const sections = [
    {
      title: 'Allergies',
      icon: AlertTriangle,
      content: encounter.allergies,
      className: encounter.allergies ? 'border-amber-500/50' : '',
    },
    {
      title: 'Chronic Conditions',
      icon: Heart,
      content: encounter.chronic_conditions,
    },
    {
      title: 'Current Medications',
      icon: Pill,
      content: encounter.current_medications,
    },
    {
      title: 'Past Surgeries',
      icon: Scissors,
      content: encounter.past_surgeries,
    },
    {
      title: 'Family History',
      icon: Users,
      content: encounter.family_history,
    },
    {
      title: 'Social History',
      icon: Users,
      content: encounter.social_history,
    },
  ];

  const filledSections = sections.filter((s) => s.content);

  if (filledSections.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No medical history recorded for this encounter.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <Card key={section.title} className={section.className}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                {section.content || (
                  <span className="text-muted-foreground italic">Not recorded</span>
                )}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
