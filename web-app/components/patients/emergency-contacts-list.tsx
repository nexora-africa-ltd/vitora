import { User, Phone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { EmergencyContact } from '@/lib/types/patient';
import { formatPhoneNumber } from '@/lib/utils/format';

interface EmergencyContactsListProps {
  contacts: EmergencyContact[];
}

export function EmergencyContactsList({ contacts }: EmergencyContactsListProps) {
  if (!contacts.length) {
    return (
      <EmptyState
        icon={User}
        title="No emergency contacts"
        description="No emergency contacts have been added for this patient."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {contacts.map((contact) => (
        <Card key={contact.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">{contact.full_name}</p>
                  <p className="text-sm text-muted-foreground capitalize">{contact.relationship}</p>
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${contact.phone_number}`} className="text-primary hover:underline">
                  {formatPhoneNumber(contact.phone_number)}
                </a>
              </div>
              {contact.alternative_phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${contact.alternative_phone}`} className="text-muted-foreground hover:underline">
                    {formatPhoneNumber(contact.alternative_phone)} (alt)
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
