'use client';

import { PageHeader } from '@/components/shared/page-header';
import { ProcedureForm } from '@/components/procedures/procedure-form';

export default function NewProcedurePage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Procedure"
        helpContent="Add a new procedure to the catalog. Fill in the clinical details, consent requirements, coding, and billing information."
      />
      <div className="max-w-4xl mx-auto">
        <ProcedureForm />
      </div>
    </div>
  );
}
