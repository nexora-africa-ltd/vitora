// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Legacy SHA ePrescription route redirect.
 * Use: preserves old deep links and routes users back to SHA claims workflow.
 * Inputs: none.
 */

import { redirect } from 'next/navigation';

export default function SHAPrescriptionsPage() {
  redirect('/transactions/sha-claims');
}
