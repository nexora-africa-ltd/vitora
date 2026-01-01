import Link from 'next/link';
import { User, Phone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Patient } from '@/lib/types/patient';
import { calculateAge } from '@/lib/utils/format';

interface PatientCardProps {
  patient: Patient;
}

export function PatientCard({ patient }: PatientCardProps) {
  const genderLabels: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other' };

  return (
    <Link href={`/patients/${patient.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary">
                {patient.first_name[0]}
                {patient.last_name[0]}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold truncate">
                  {patient.first_name} {patient.last_name}
                </h3>
                {patient.is_sensitive && (
                  <Badge variant="destructive" className="text-xs">
                    Sensitive
                  </Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground font-mono">
                {patient.mrn}
              </p>

              <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {calculateAge(patient.date_of_birth)} yrs, {genderLabels[patient.gender]}
                </span>
                {patient.phone_number && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {patient.phone_number}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
