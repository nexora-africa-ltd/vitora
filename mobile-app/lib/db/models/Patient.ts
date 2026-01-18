/**
 * Patient Model
 *
 * WatermelonDB model for patient records with offline-first support.
 * Mirrors backend Django Patient model for seamless synchronization.
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export class Patient extends Model {
  static table = 'patients';

  // Auto-generated MRN
  @field('mrn') mrn!: string;

  // Basic demographics
  @field('first_name') firstName!: string;
  @field('last_name') lastName!: string;
  @field('date_of_birth') dateOfBirth!: string; // ISO date string
  @field('gender') gender!: string; // 'M', 'F', 'O'

  // Kenya location hierarchy
  @field('county_id') countyId!: string;
  @field('sub_county_id') subCountyId!: string;
  @field('ward_id') wardId?: string;

  // Contact information
  @field('phone_number') phoneNumber?: string;
  @field('email') email?: string;
  @field('national_id') nationalId?: string;
  @field('passport_number') passportNumber?: string;

  // Address
  @field('address_line1') addressLine1?: string;
  @field('address_line2') addressLine2?: string;
  @field('postal_code') postalCode?: string;

  // Emergency contact
  @field('emergency_contact_name') emergencyContactName?: string;
  @field('emergency_contact_phone') emergencyContactPhone?: string;
  @field('emergency_contact_relationship') emergencyContactRelationship?: string;

  // Privacy & consent
  @field('is_sensitive') isSensitive!: boolean;
  @field('consent_given') consentGiven!: boolean;
  @date('consent_date') consentDate?: Date;

  // Registration metadata
  @field('registered_by_id') registeredById?: string;
  @field('referral_source') referralSource?: string;

  // Sync tracking
  @field('is_synced') isSynced!: boolean;
  @date('last_synced_at') lastSyncedAt?: Date;
  @field('backend_id') backendId?: string;

  // Standard timestamps
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  /**
   * Get full name (first + last)
   */
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  /**
   * Calculate age from date of birth
   */
  get age(): number {
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  /**
   * Check if patient needs sync
   */
  get needsSync(): boolean {
    return !this.isSynced;
  }
}
