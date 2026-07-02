'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/lib/hooks/use-toast';
import { clinicsApi } from '@/lib/api/clinics';
import type { ClinicType } from '@/lib/types/clinic';

interface DefaultClinic {
  code: string;
  name: string;
  clinic_type: ClinicType;
  location: string;
  capacity: number;
  default_service_fee: string;
  triage_required: boolean;
  is_sensitive?: boolean;
  required_permission?: string;
  category: string;
}

const DEFAULT_CLINICS: DefaultClinic[] = [
  // Primary Care
  { code: 'OPD-DEFAULT', name: 'General OPD', clinic_type: 'GENERAL_OPD', location: 'Outpatient Block, Room 1', capacity: 3, default_service_fee: '500.00', triage_required: true, category: 'Primary Care' },
  { code: 'FILTER-DEFAULT', name: 'Filter/Screening Clinic', clinic_type: 'FILTER_CLINIC', location: 'Outpatient Block, Triage Area', capacity: 2, default_service_fee: '0.00', triage_required: false, category: 'Primary Care' },
  // MCH
  { code: 'ANC-DEFAULT', name: 'Antenatal Clinic', clinic_type: 'ANC', location: 'MCH Wing, Room 2', capacity: 2, default_service_fee: '300.00', triage_required: false, category: 'Maternal & Child Health' },
  { code: 'PNC-DEFAULT', name: 'Postnatal Clinic', clinic_type: 'PNC', location: 'MCH Wing, Room 3', capacity: 1, default_service_fee: '300.00', triage_required: false, category: 'Maternal & Child Health' },
  { code: 'FP-DEFAULT', name: 'Family Planning Clinic', clinic_type: 'FP', location: 'MCH Wing, Room 4', capacity: 1, default_service_fee: '200.00', triage_required: false, category: 'Maternal & Child Health' },
  { code: 'CWC-DEFAULT', name: 'Child Welfare Clinic', clinic_type: 'CWC', location: 'MCH Wing, Room 1', capacity: 2, default_service_fee: '200.00', triage_required: false, category: 'Maternal & Child Health' },
  { code: 'IMM-DEFAULT', name: 'Immunization Clinic', clinic_type: 'IMMUNIZATION', location: 'MCH Wing, Vaccination Room', capacity: 2, default_service_fee: '0.00', triage_required: false, category: 'Maternal & Child Health' },
  { code: 'NUTRITION-DEFAULT', name: 'Nutrition Clinic', clinic_type: 'NUTRITION', location: 'Outpatient Block, Room 5', capacity: 1, default_service_fee: '200.00', triage_required: true, category: 'Maternal & Child Health' },
  // Specialist
  { code: 'DENTAL-DEFAULT', name: 'Dental Clinic', clinic_type: 'DENTAL', location: 'Specialist Block, Dental Suite', capacity: 1, default_service_fee: '1500.00', triage_required: false, category: 'Specialist' },
  { code: 'EYE-DEFAULT', name: 'Eye Clinic', clinic_type: 'EYE', location: 'Specialist Block, Ophthalmology', capacity: 1, default_service_fee: '1500.00', triage_required: false, category: 'Specialist' },
  { code: 'ENT-DEFAULT', name: 'ENT Clinic', clinic_type: 'ENT', location: 'Specialist Block, ENT', capacity: 1, default_service_fee: '1500.00', triage_required: false, category: 'Specialist' },
  { code: 'SURGICAL-DEFAULT', name: 'Surgical Outpatient Clinic', clinic_type: 'SURGICAL', location: 'Specialist Block, Surgery OPD', capacity: 1, default_service_fee: '1500.00', triage_required: true, category: 'Specialist' },
  { code: 'ORTHO-DEFAULT', name: 'Orthopedic Clinic', clinic_type: 'ORTHO', location: 'Specialist Block, Ortho', capacity: 1, default_service_fee: '1500.00', triage_required: true, category: 'Specialist' },
  { code: 'DERM-DEFAULT', name: 'Dermatology Clinic', clinic_type: 'DERM', location: 'Specialist Block, Dermatology', capacity: 1, default_service_fee: '1500.00', triage_required: false, category: 'Specialist' },
  // Allied Health
  { code: 'PHYSIO-DEFAULT', name: 'Physiotherapy Clinic', clinic_type: 'PHYSIO', location: 'Rehab Wing', capacity: 2, default_service_fee: '800.00', triage_required: false, category: 'Allied Health' },
  { code: 'OT-DEFAULT', name: 'Occupational Therapy', clinic_type: 'OT', location: 'Rehab Wing', capacity: 1, default_service_fee: '800.00', triage_required: false, category: 'Allied Health' },
  { code: 'SOCIALWORK-DEFAULT', name: 'Social Work Services', clinic_type: 'SOCIAL_WORK', location: 'Counseling Wing', capacity: 1, default_service_fee: '0.00', triage_required: false, category: 'Allied Health' },
  { code: 'COUNSELLING-DEFAULT', name: 'Counselling Services', clinic_type: 'COUNSELLING', location: 'Counseling Wing', capacity: 2, default_service_fee: '0.00', triage_required: false, category: 'Allied Health' },
  // Chronic Care
  { code: 'CCC-DEFAULT', name: 'Comprehensive Care Clinic', clinic_type: 'CCC', location: 'Chronic Care Wing', capacity: 2, default_service_fee: '0.00', triage_required: false, is_sensitive: true, required_permission: 'clinics.view_ccc_clinic', category: 'Chronic Care' },
  { code: 'TB-DEFAULT', name: 'TB Clinic', clinic_type: 'TB', location: 'Chronic Care Wing', capacity: 1, default_service_fee: '0.00', triage_required: false, category: 'Chronic Care' },
  { code: 'DIABETIC-DEFAULT', name: 'Diabetic Clinic', clinic_type: 'DIABETIC', location: 'Chronic Care Wing', capacity: 1, default_service_fee: '0.00', triage_required: false, category: 'Chronic Care' },
  { code: 'HYPERTENSION-DEFAULT', name: 'Hypertension Clinic', clinic_type: 'HYPERTENSION', location: 'Chronic Care Wing', capacity: 1, default_service_fee: '0.00', triage_required: false, category: 'Chronic Care' },
  { code: 'MENTAL-DEFAULT', name: 'Mental Health Clinic', clinic_type: 'MENTAL_HEALTH', location: 'Chronic Care Wing, Counseling Room', capacity: 1, default_service_fee: '0.00', triage_required: false, is_sensitive: true, required_permission: 'clinics.view_mental_health_clinic', category: 'Chronic Care' },
  { code: 'ONCO-DEFAULT', name: 'Oncology Clinic', clinic_type: 'ONCOLOGY', location: 'Specialist Block, Oncology', capacity: 1, default_service_fee: '0.00', triage_required: true, category: 'Chronic Care' },
  { code: 'DIALYSIS-DEFAULT', name: 'Dialysis Unit', clinic_type: 'DIALYSIS', location: 'Renal Unit', capacity: 4, default_service_fee: '0.00', triage_required: false, category: 'Chronic Care' },
  // Procedure Areas
  { code: 'PROCEDURE-DEFAULT', name: 'Procedure Room', clinic_type: 'PROCEDURE', location: 'Outpatient Block, Procedure Room', capacity: 1, default_service_fee: '1200.00', triage_required: false, category: 'Procedure Areas' },
  { code: 'DRESSING-DEFAULT', name: 'Dressing/Wound Care', clinic_type: 'DRESSING', location: 'Outpatient Block, Dressing Room', capacity: 1, default_service_fee: '300.00', triage_required: false, category: 'Procedure Areas' },
  { code: 'INJECTION-DEFAULT', name: 'Injection Room', clinic_type: 'INJECTION', location: 'Outpatient Block, Treatment Room', capacity: 1, default_service_fee: '200.00', triage_required: false, category: 'Procedure Areas' },
];

const CATEGORIES = [...new Set(DEFAULT_CLINICS.map((c) => c.category))];

export function SeedClinicsDialog() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSeeding, setIsSeeding] = useState(false);
  const [seededCount, setSeededCount] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggleClinic = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleCategory = (category: string) => {
    const categoryClinics = DEFAULT_CLINICS.filter((c) => c.category === category);
    const allSelected = categoryClinics.every((c) => selected.has(c.code));
    setSelected((prev) => {
      const next = new Set(prev);
      categoryClinics.forEach((c) => {
        if (allSelected) next.delete(c.code);
        else next.add(c.code);
      });
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(DEFAULT_CLINICS.map((c) => c.code)));
  };

  const clearAll = () => {
    setSelected(new Set());
  };

  const handleSeed = async () => {
    if (selected.size === 0) return;
    setIsSeeding(true);
    setSeededCount(0);

    const clinicsToCreate = DEFAULT_CLINICS.filter((c) => selected.has(c.code));
    let created = 0;
    let failed = 0;

    for (const clinic of clinicsToCreate) {
      try {
        await clinicsApi.create({
          name: clinic.name,
          clinic_type: clinic.clinic_type,
          code: clinic.code,
          location: clinic.location,
          capacity: clinic.capacity,
          default_service_fee: clinic.default_service_fee,
          triage_required: clinic.triage_required,
          is_sensitive: clinic.is_sensitive ?? false,
          required_permission: clinic.required_permission ?? '',
          status: 'ACTIVE',
          accepts_walk_ins: true,
        });
        created++;
        setSeededCount(created);
      } catch {
        failed++;
      }
    }

    setIsSeeding(false);
    queryClient.invalidateQueries({ queryKey: ['clinics'] });

    if (created > 0) {
      toast({
        title: 'Clinics created',
        description: `${created} clinic${created > 1 ? 's' : ''} created successfully${failed > 0 ? `. ${failed} failed (may already exist).` : '.'}`,
      });
    } else {
      toast({
        title: 'No clinics created',
        description: 'All selected clinics may already exist.',
        variant: 'destructive',
      });
    }

    setOpen(false);
    setSelected(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="h-4 w-4 mr-2" />
          Seed Default Clinics
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Seed Default Clinics
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between py-2">
          <p className="text-sm text-muted-foreground">
            Select clinics to create. {selected.size} of {DEFAULT_CLINICS.length} selected.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {CATEGORIES.map((category) => {
              const categoryClinics = DEFAULT_CLINICS.filter((c) => c.category === category);
              const allSelected = categoryClinics.every((c) => selected.has(c.code));
              const someSelected = categoryClinics.some((c) => selected.has(c.code));

              return (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox
                      checked={allSelected}
                      ref={undefined}
                      data-indeterminate={someSelected && !allSelected ? true : undefined}
                      onCheckedChange={() => toggleCategory(category)}
                    />
                    <span className="text-sm font-semibold">{category}</span>
                    <Badge variant="secondary" className="text-xs">
                      {categoryClinics.length}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 ml-6">
                    {categoryClinics.map((clinic) => (
                      <label
                        key={clinic.code}
                        className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selected.has(clinic.code)}
                          onCheckedChange={() => toggleClinic(clinic.code)}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-sm truncate block">{clinic.name}</span>
                          <span className="text-xs text-muted-foreground truncate block">
                            {clinic.location}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between pt-4 border-t">
          {isSeeding && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating {seededCount}/{selected.size}...
            </div>
          )}
          {!isSeeding && <div />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isSeeding}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSeed}
              disabled={selected.size === 0 || isSeeding}
            >
              {isSeeding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Create {selected.size} Clinic{selected.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
