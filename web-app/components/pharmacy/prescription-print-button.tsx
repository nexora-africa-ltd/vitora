/**
 * Prescription Print Button Component
 *
 * Reusable button for printing prescriptions from various locations.
 * Uses the document generation system for consistent output.
 */

'use client';

import { useState } from 'react';
import { Printer, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Prescription } from '@/lib/types/pharmacy';
import {
  printPrescription,
  type PrintPrescriptionOptions,
  type FacilityInfo,
  type ClinicianInfo,
  type PatientInfo,
  type LayoutType,
} from '@/lib/documents';

interface PrescriptionPrintButtonProps {
  /** The prescription to print */
  prescription: Prescription;
  /** Patient information (optional, will use prescription data if not provided) */
  patient?: PatientInfo;
  /** Facility information (optional) */
  facility?: FacilityInfo;
  /** Clinician information (optional, will use prescription data if not provided) */
  clinician?: ClinicianInfo;
  /** Encounter ID */
  encounterId?: number | string;
  /** Button variant */
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  /** Button size */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** Show layout options dropdown */
  showOptions?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

export function PrescriptionPrintButton({
  prescription,
  patient,
  facility,
  clinician,
  encounterId,
  variant = 'outline',
  size = 'sm',
  showOptions = false,
  disabled = false,
  className,
}: PrescriptionPrintButtonProps) {
  const [selectedLayout, setSelectedLayout] = useState<LayoutType>('a4');
  const [selectedTheme, setSelectedTheme] = useState<string>('default');

  const handlePrint = (layout: LayoutType = selectedLayout, theme: string = selectedTheme) => {
    if (!prescription || !prescription.items || prescription.items.length === 0) {
      console.warn('Cannot print prescription: no items');
      return;
    }

    const options: PrintPrescriptionOptions = {
      prescription,
      patient: patient || {
        full_name: prescription.patient_name || 'Patient',
        mrn: prescription.patient_mrn,
      },
      facility,
      clinician: clinician || {
        name: prescription.prescriber_name || 'Prescriber',
      },
      encounterId: encounterId || prescription.encounter,
      layout,
      theme,
    };

    printPrescription(options);
  };

  // Simple button (no options)
  if (!showOptions) {
    return (
      <Button
        variant={variant}
        size={size}
        onClick={() => handlePrint()}
        disabled={disabled || !prescription?.items?.length}
        className={className}
      >
        <Printer className="h-4 w-4 mr-2" />
        Print
      </Button>
    );
  }

  // Button with layout options dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          disabled={disabled || !prescription?.items?.length}
          className={className}
        >
          <Printer className="h-4 w-4 mr-2" />
          Print
          <Settings2 className="h-3 w-3 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Print Format</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handlePrint('a4', 'default')}>
          <Printer className="h-4 w-4 mr-2" />
          Standard A4
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePrint('thermal-80mm', 'default')}>
          <Printer className="h-4 w-4 mr-2" />
          Thermal 80mm
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Themes</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handlePrint('a4', 'default')}>
          Default (Black/White)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePrint('a4', 'facility-private')}>
          Private Facility (Blue)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePrint('a4', 'facility-public')}>
          Public Facility (Green)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Hook for printing prescriptions programmatically
 */
export function usePrintPrescription() {
  const print = (
    prescription: Prescription,
    options?: Partial<Omit<PrintPrescriptionOptions, 'prescription'>>
  ) => {
    if (!prescription || !prescription.items?.length) {
      console.warn('Cannot print prescription: no items');
      return null;
    }

    return printPrescription({
      prescription,
      patient: options?.patient || {
        full_name: prescription.patient_name || 'Patient',
        mrn: prescription.patient_mrn,
      },
      facility: options?.facility,
      clinician: options?.clinician || {
        name: prescription.prescriber_name || 'Prescriber',
      },
      encounterId: options?.encounterId || prescription.encounter,
      layout: options?.layout || 'a4',
      theme: options?.theme || 'default',
    });
  };

  return { print };
}
