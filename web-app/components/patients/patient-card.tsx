import Link from 'next/link';
import { User, Phone, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Patient } from '@/lib/types/patient';
import { calculateAge } from '@/lib/utils/format';

interface PatientCardProps {
  patient: Patient;
}

const genderLabels: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other' };

const genderColors: Record<string, string> = {
  M: 'bg-blue-500',
  F: 'bg-pink-500',
  O: 'bg-purple-500',
};

export function PatientCard({ patient }: PatientCardProps) {
  return (
    <Link href={`/patients/${patient.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className={`${genderColors[patient.gender]} text-white`}>
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
                    <AlertTriangle className="h-3 w-3 mr-1" />
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

              {patient.county_name && (
                <p className="text-xs text-muted-foreground mt-1">
                  {patient.county_name}
                  {patient.sub_county_name && `, ${patient.sub_county_name}`}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
