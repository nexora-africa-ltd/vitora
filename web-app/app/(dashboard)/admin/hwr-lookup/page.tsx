'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { DHAPractitionerSearch } from '@/components/sha/practitioner-search';
import { useToast } from '@/lib/hooks/use-toast';
import type { DHAPractitioner } from '@/lib/types/sha';

export default function HWRLookupPage() {
  const router = useRouter();
  const { toast } = useToast();

  const handleSelect = (practitioner: DHAPractitioner) => {
    // Store practitioner data for the new-staff page to pick up
    try {
      sessionStorage.setItem('hwr_practitioner', JSON.stringify(practitioner));
    } catch {
      // sessionStorage may be unavailable
    }
    toast({
      title: 'Navigating to New Staff',
      description: `Pre-filling form with ${practitioner.membership.full_name.trim()}'s registry data`,
    });
    router.push('/admin/staff/new');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="HWR Lookup"
        helpContent="Search the DHA Health Worker Registry (HWR) by National ID or Passport number to verify practitioner registration, licensing status, and professional details. Click 'Use This Data' to create a new staff member from the registry data."
      />

      <DHAPractitionerSearch
        showDetailedResult
        autoSelect={false}
        onSelect={handleSelect}
      />
    </div>
  );
}
