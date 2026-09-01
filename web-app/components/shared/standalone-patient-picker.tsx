'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Search, User, UserCheck, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { patientsApi } from '@/lib/api/patients';
import type { Patient } from '@/lib/types/patient';

/**
 * Minimal shape any module's walk-in record must satisfy so the picker can render it.
 */
export interface WalkInOptionLike {
  id: number;
  registration_number: string;
  full_name: string;
  phone_number?: string;
  national_id?: string;
}

/**
 * Discriminated value emitted by the picker.
 * - `inline`: the form keeps using its own inline walk-in fields (caller's existing state)
 * - `walkin`: an existing walk-in record was chosen (submit `walkin_*_id`)
 * - `patient`: a registered patient was chosen (submit `patient_id`)
 */
export type PickedPatient =
  | { mode: 'inline' }
  | { mode: 'walkin'; walkin: WalkInOptionLike }
  | {
      mode: 'patient';
      patient: Pick<Patient, 'id' | 'mrn' | 'first_name' | 'last_name' | 'phone_number'>;
    };

interface StandalonePatientPickerProps {
  value: PickedPatient;
  onChange: (value: PickedPatient) => void;
  /**
   * Module-specific walk-in search function. Returns a paginated-ish payload with `results`.
   * Each row must satisfy `WalkInOptionLike`.
   */
  searchWalkIn: (query: string) => Promise<{ results: WalkInOptionLike[] }>;
  /**
   * Singular noun for the walk-in tab label (e.g., "patient", "customer").
   */
  walkInNoun?: string;
}

/**
 * Unified picker that lets standalone-module forms attach an order/prescription to
 * EITHER a previously-registered walk-in, OR a regular Patient record, OR fall back
 * to capturing inline walk-in details on the form itself.
 *
 * This closes the disconnect where freshly-registered walk-ins were invisible to the
 * order/prescription create forms.
 */
export function StandalonePatientPicker({
  value,
  onChange,
  searchWalkIn,
  walkInNoun = 'patient',
}: StandalonePatientPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'walkin' | 'patient'>('walkin');
  const [walkInQuery, setWalkInQuery] = useState('');
  const [patientQuery, setPatientQuery] = useState('');

  const { data: walkInData, isLoading: walkInLoading } = useQuery({
    queryKey: ['picker-walkin', walkInQuery, walkInNoun],
    queryFn: () => searchWalkIn(walkInQuery),
    enabled: open && tab === 'walkin',
  });

  const { data: patientData, isLoading: patientLoading } = useQuery({
    queryKey: ['picker-patient', patientQuery],
    queryFn: () => patientsApi.getPatients({ search: patientQuery, page_size: 20 }),
    enabled: open && tab === 'patient' && patientQuery.length >= 2,
  });

  function pickWalkIn(w: WalkInOptionLike) {
    onChange({ mode: 'walkin', walkin: w });
    setOpen(false);
  }

  function pickPatient(p: Patient) {
    onChange({
      mode: 'patient',
      patient: {
        id: p.id,
        mrn: p.mrn,
        first_name: p.first_name,
        last_name: p.last_name,
        phone_number: p.phone_number,
      },
    });
    setOpen(false);
  }

  function clear() {
    onChange({ mode: 'inline' });
  }

  // ── Selected chip ─────────────────────────────────────────────────────────
  if (value.mode === 'walkin') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
        <UserCheck className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{value.walkin.full_name}</span>
            <Badge variant="outline" className="shrink-0 text-xs">
              Walk-in · {value.walkin.registration_number}
            </Badge>
          </div>
          {(value.walkin.phone_number || value.walkin.national_id) && (
            <div className="truncate text-xs text-muted-foreground">
              {[value.walkin.phone_number, value.walkin.national_id].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={clear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (value.mode === 'patient') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
        <UserCheck className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">
              {value.patient.first_name} {value.patient.last_name}
            </span>
            <Badge variant="outline" className="shrink-0 text-xs">
              Registered · {value.patient.mrn}
            </Badge>
          </div>
          {value.patient.phone_number && (
            <div className="truncate text-xs text-muted-foreground">
              {value.patient.phone_number}
            </div>
          )}
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={clear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // ── Inline mode: show "Select existing" trigger ───────────────────────────
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-full justify-start">
          <Search className="mr-2 h-4 w-4" />
          Select existing {walkInNoun} or registered patient…
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select patient</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'walkin' | 'patient')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="walkin">
              <User className="mr-2 h-4 w-4" />
              Existing walk-in
            </TabsTrigger>
            <TabsTrigger value="patient">
              <UserCheck className="mr-2 h-4 w-4" />
              Registered patient
            </TabsTrigger>
          </TabsList>

          <TabsContent value="walkin" className="space-y-3">
            <Input
              placeholder={`Search ${walkInNoun}s by name, phone, ID, or reg #…`}
              value={walkInQuery}
              onChange={(e) => setWalkInQuery(e.target.value)}
              autoFocus
            />
            <ScrollArea className="h-80 rounded-md border">
              {walkInLoading && <div className="p-4 text-sm text-muted-foreground">Searching…</div>}
              {!walkInLoading && (walkInData?.results.length ?? 0) === 0 && (
                <div className="p-4 text-sm text-muted-foreground">
                  No walk-in {walkInNoun}s found. Use the form below to register a new one.
                </div>
              )}
              {walkInData?.results.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => pickWalkIn(w)}
                  className="flex w-full items-center gap-3 border-b px-3 py-2 text-left hover:bg-accent"
                >
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{w.full_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[w.registration_number, w.phone_number, w.national_id]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <Check className="h-4 w-4 text-primary opacity-0" />
                </button>
              ))}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="patient" className="space-y-3">
            <Input
              placeholder="Search registered patients by name, MRN, or phone (min 2 chars)…"
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
              autoFocus
            />
            <ScrollArea className="h-80 rounded-md border">
              {patientQuery.length < 2 && (
                <div className="p-4 text-sm text-muted-foreground">
                  Type at least 2 characters to search.
                </div>
              )}
              {patientQuery.length >= 2 && patientLoading && (
                <div className="p-4 text-sm text-muted-foreground">Searching…</div>
              )}
              {patientQuery.length >= 2 &&
                !patientLoading &&
                (patientData?.results.length ?? 0) === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">
                    No registered patients matched.
                  </div>
                )}
              {patientData?.results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickPatient(p)}
                  className="flex w-full items-center gap-3 border-b px-3 py-2 text-left hover:bg-accent"
                >
                  <UserCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {p.first_name} {p.last_name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[p.mrn, p.phone_number].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </button>
              ))}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
