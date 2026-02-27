/**
 * New Encounter - Redirect Page
 *
 * Redirects to the first step (patient selection) of the new encounter flow.
 *
 * Route: /encounters/new → /encounters/new/patient
 */
import { redirect } from 'next/navigation';

export default function NewEncounterPage() {
  redirect('/encounters/new/patient');
}
