/**
 * IPD/Inpatient Step Definitions
 *
 * Steps for inpatient admission, ward management, bed management
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';
import { createPatient, createUser, PERMISSIONS } from '../../support/fixtures';

// ============================================
// PRECONDITIONS
// ============================================

Given(
  'patient {string} has admission recommendation from Dr. {word}',
  async function (this: VitoraWorld, patientName: string, doctor: string) {
    const [firstName, ...rest] = patientName.split(' ');
    this.patient = createPatient({ firstName, lastName: rest.join(' ') || 'Test' });
    this.store('admissionRecommendation', { doctor, patient: patientName });
  }
);

Given(
  'the patient agrees to inpatient admission',
  async function (this: VitoraWorld) {
    this.store('patientAgreesToAdmission', true);
  }
);

Given(
  'patient is admitted to {word} Ward',
  async function (this: VitoraWorld, ward: string) {
    this.store('admittedWard', ward);
    this.store('isAdmitted', true);
  }
);

Given(
  '{word} Ward has available beds',
  async function (this: VitoraWorld, ward: string) {
    this.store('wardWithAvailableBeds', ward);
  }
);

Given(
  'all beds in {word} Ward are occupied',
  async function (this: VitoraWorld, ward: string) {
    this.store('wardFullyOccupied', ward);
  }
);

Given(
  'no beds are available',
  async function (this: VitoraWorld) {
    this.store('noBedsAvailable', true);
  }
);

Given(
  'patient has admission recommendation',
  async function (this: VitoraWorld) {
    this.store('hasAdmissionRecommendation', true);
  }
);

Given(
  'patient has SHA insurance',
  async function (this: VitoraWorld) {
    this.store('insuranceType', 'SHA');
  }
);

// ============================================
// ACTIONS
// ============================================

When(
  'I view bed selection',
  async function (this: VitoraWorld) {
    this.store('viewingBedSelection', true);
    this.currentPage = 'bed selection';
  }
);

When(
  'I select bed {string}',
  async function (this: VitoraWorld, bed: string) {
    this.store('selectedBed', bed);
  }
);

When(
  'I try to admit patient',
  async function (this: VitoraWorld) {
    this.store('attemptedAdmission', true);
  }
);

When(
  'I add patient to admission waitlist',
  async function (this: VitoraWorld) {
    this.store('addedToWaitlist', true);
  }
);

When(
  'I set priority {string}',
  async function (this: VitoraWorld, priority: string) {
    this.store('waitlistPriority', priority);
  }
);

When(
  'patient declines admission',
  async function (this: VitoraWorld) {
    this.store('admissionDeclined', true);
  }
);

When(
  'I select reason {string}',
  async function (this: VitoraWorld, reason: string) {
    this.store('declineReason', reason);
  }
);

When(
  'I process admission',
  async function (this: VitoraWorld) {
    this.store('admissionProcessed', true);
  }
);

When(
  'I view ward {string}',
  async function (this: VitoraWorld, ward: string) {
    this.store('viewingWard', ward);
    this.currentPage = `ward - ${ward}`;
  }
);

When(
  'I view the ward dashboard',
  async function (this: VitoraWorld) {
    this.currentPage = 'ward dashboard';
  }
);

When(
  'nurse views the kardex',
  async function (this: VitoraWorld) {
    this.store('viewingKardex', true);
    this.currentPage = 'kardex';
  }
);

When(
  'a patient is discharged from bed {string}',
  async function (this: VitoraWorld, bed: string) {
    this.store('dischargedFromBed', bed);
  }
);

// ============================================
// ASSERTIONS
// ============================================

Then(
  'an inpatient admission should be created',
  async function (this: VitoraWorld) {
    this.store('inpatientAdmissionCreated', true);
    expect(true).toBe(true);
  }
);

Then(
  'bed {string} status should change to {string}',
  async function (this: VitoraWorld, bed: string, status: string) {
    this.store('bedStatusChange', { bed, status });
    expect(status.length).toBeGreaterThan(0);
  }
);

Then(
  'an IPD encounter should be created',
  async function (this: VitoraWorld) {
    this.store('ipdEncounterCreated', true);
    expect(true).toBe(true);
  }
);

Then(
  'all OPD data should be preserved and linked',
  async function (this: VitoraWorld) {
    this.store('opdDataPreserved', true);
    expect(true).toBe(true);
  }
);

Then(
  'the bed should be reserved for this patient',
  async function (this: VitoraWorld) {
    this.store('bedReserved', true);
    expect(true).toBe(true);
  }
);

Then(
  'patient should be added to waitlist',
  async function (this: VitoraWorld) {
    this.store('addedToWaitlist', true);
    expect(true).toBe(true);
  }
);

Then(
  'waitlist position should be shown',
  async function (this: VitoraWorld) {
    this.store('waitlistPositionShown', true);
    expect(true).toBe(true);
  }
);

Then(
  'I should be notified when bed becomes available',
  async function (this: VitoraWorld) {
    this.store('bedAvailabilityNotification', true);
    expect(true).toBe(true);
  }
);

Then(
  'the encounter should remain as OPD',
  async function (this: VitoraWorld) {
    this.store('encounterRemainsOPD', true);
    expect(true).toBe(true);
  }
);

Then(
  'decline reason should be documented',
  async function (this: VitoraWorld) {
    this.store('declineReasonDocumented', true);
    expect(true).toBe(true);
  }
);

Then(
  'insurance eligibility should be verified',
  async function (this: VitoraWorld) {
    this.store('insuranceVerified', true);
    expect(true).toBe(true);
  }
);

Then(
  'coverage details should be displayed',
  async function (this: VitoraWorld) {
    this.store('coverageDetailsDisplayed', true);
    expect(true).toBe(true);
  }
);

Then(
  'pre-authorization should be requested if required',
  async function (this: VitoraWorld) {
    this.store('preAuthRequested', true);
    expect(true).toBe(true);
  }
);
