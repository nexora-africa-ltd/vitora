'use client';

import { FloatingPeekPanel } from '@/components/shared/floating-peek-panel';
import { EncounterPeekContent } from '@/components/encounters/encounter-peek-content';
import { PatientPeekContent } from '@/components/patients/patient-peek-content';
import { usePeekPanelStore } from '@/lib/stores/peek-panel-store';
import { Stethoscope, User } from 'lucide-react';

/**
 * Global peek panel renderer. Place once in the dashboard layout.
 * Reads from the Zustand peek-panel store and renders the appropriate content.
 */
export function GlobalPeekPanel() {
  const { state, target, setState } = usePeekPanelStore();

  if (!target) return null;

  const icon = target.type === 'encounter' ? Stethoscope : User;
  const fullPageHref =
    target.type === 'encounter'
      ? `/encounters/${target.id}`
      : `/patients/${target.id}`;

  return (
    <FloatingPeekPanel
      state={state}
      onStateChange={setState}
      title={target.title}
      subtitle={target.subtitle}
      icon={icon}
      fullPageHref={fullPageHref}
    >
      {target.type === 'encounter' ? (
        <EncounterPeekContent encounterId={target.id} />
      ) : (
        <PatientPeekContent patientId={target.id} />
      )}
    </FloatingPeekPanel>
  );
}
