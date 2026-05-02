/**
 * Contact Picker
 *
 * Fetches and displays DHA HIE beneficiary contacts (masked phone numbers).
 * The user selects which contact to receive the OTP.
 *
 * DHA returns contacts like: { id: "abc123", value: "+254714***898", contact_type: "PHONE" }
 */
'use client';

import { useState, useEffect } from 'react';
import { Loader2, Phone, User } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { shaApi } from '@/lib/api/sha';
import { getApiErrorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface BeneficiaryContact {
  id: string;
  value: string;
  contact_type: string;
}

interface ContactPickerProps {
  /** Patient's DHA Client Registry ID */
  beneficiaryCrId: string;
  /** Called when user selects a contact */
  onSelect: (contactId: string) => void;
  /** Currently selected contact ID */
  selectedContactId?: string;
  /** Custom className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ContactPicker({
  beneficiaryCrId,
  onSelect,
  selectedContactId,
  className,
}: ContactPickerProps) {
  const [contacts, setContacts] = useState<BeneficiaryContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!beneficiaryCrId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    shaApi
      .getBeneficiaryContacts(beneficiaryCrId)
      .then((result) => {
        if (cancelled) return;
        const fetched = result.contacts || [];
        setContacts(fetched);
        // Auto-select if only one contact
        if (fetched.length === 1 && fetched[0]) {
          onSelect(fetched[0].id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beneficiaryCrId]);

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 py-2', className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading contacts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('text-xs text-muted-foreground py-1', className)}>
        Could not load contacts. OTP will be sent to the default number.
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className={cn('text-xs text-muted-foreground py-1', className)}>
        No registered contacts found. OTP will be sent to the default number.
      </div>
    );
  }

  // Single contact — show inline confirmation
  if (contacts.length === 1 && contacts[0]) {
    return (
      <div className={cn('flex items-center gap-2 py-1', className)}>
        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs">
          OTP will be sent to <span className="font-mono font-medium">{contacts[0].value}</span>
        </span>
      </div>
    );
  }

  // Multiple contacts — radio group
  return (
    <div className={cn('space-y-2', className)}>
      <Label className="text-xs font-medium">Select OTP recipient</Label>
      <RadioGroup
        value={selectedContactId}
        onValueChange={onSelect}
        className="space-y-1.5"
      >
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="flex items-center space-x-2 rounded-md border px-3 py-2 hover:bg-muted/50 cursor-pointer"
            onClick={() => onSelect(contact.id)}
          >
            <RadioGroupItem value={contact.id} id={`contact-${contact.id}`} />
            <Label
              htmlFor={`contact-${contact.id}`}
              className="flex items-center gap-2 cursor-pointer flex-1"
            >
              {contact.contact_type === 'PHONE' ? (
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-xs font-mono">{contact.value}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">
                {contact.contact_type}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
