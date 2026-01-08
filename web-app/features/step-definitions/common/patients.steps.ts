/**
 * Common Step Definitions - Patients
 *
 * Shared steps for patient setup used across modules (OPD/IPD/triage/pharmacy).
 */

import { Given } from '@cucumber/cucumber';
import { VitoraWorld } from '../../support/world';
import { createPatient, createPatientData } from '../../support/fixtures';

Given(
  'a patient {string} with MRN {string} exists',
  async function (this: VitoraWorld, fullName: string, mrn: string) {
    const [firstName, ...rest] = fullName.split(' ');
    const lastName = rest.join(' ') || 'Test';

    // Prefer creating in backend if available; otherwise just store context.
    this.patient = createPatient({ firstName, lastName, mrn });
    this.store('currentPatient', { id: 1, mrn, firstName, lastName });

    try {
      const patientData = createPatientData({
        mrn,
        first_name: firstName,
        last_name: lastName,
      });
      const created = await this.apiRequest('POST', '/patients/', patientData);
      this.store('currentPatient', created);
    } catch {
      // Offline / API not available in dry-run contexts.
    }
  }
);
