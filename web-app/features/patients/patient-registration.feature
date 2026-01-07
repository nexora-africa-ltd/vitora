@patients @registration
Feature: Patient Registration
  As a receptionist or registration clerk
  I want to register new patients and manage their demographic information
  So that patients have a unique medical record for continuity of care

  Background:
    Given I am logged in as a user with "patients.add_patient" permission
    And I am on the patient registration page

  # ============================================
  # NEW PATIENT REGISTRATION
  # ============================================

  @smoke @create
  Scenario: Register a new patient with required fields
    When I fill in the registration form:
      | field        | value           |
      | First Name   | Jane            |
      | Last Name    | Wanjiku         |
      | Date of Birth| 1985-05-20      |
      | Gender       | Female          |
      | National ID  | 12345678        |
      | Phone Number | +254712345678   |
      | County       | Nairobi         |
      | Sub-County   | Westlands       |
    And I click "Register Patient"
    Then a new patient record should be created
    And an MRN should be auto-generated in format "MRN-YYYYMMDD-XXXX"
    And I should see a success message "Patient registered successfully"
    And "registered_by" should be set to my user account
    And an audit log entry "patient_create" should be recorded

  @mrn @auto-generate
  Scenario: MRN is auto-generated on registration
    When I register a new patient
    Then the MRN should follow format "MRN-YYYYMMDD-XXXX"
    And the date portion should match today's date
    And the sequence number should be unique for the day
    And MRN generation should complete within 500ms

  @mrn @unique
  Scenario: Each patient gets a unique MRN
    Given I register 5 patients today
    Then each patient should have a different MRN
    And sequence numbers should increment (0001, 0002, 0003, etc.)

  # ============================================
  # FIELD VALIDATION
  # ============================================

  @validation @dob
  Scenario: Date of birth cannot be in the future
    When I enter date of birth as "2030-01-01"
    And I try to submit the form
    Then I should see an error "Date of birth cannot be a future date"
    And the patient should not be created

  @validation @dob
  Scenario: Date of birth is required
    When I leave date of birth empty
    And I try to submit the form
    Then I should see an error "Date of birth is required"

  @validation @national-id
  Scenario: Kenya national ID format validation
    When I enter national ID as "1234"
    Then I should see a warning "National ID should be 8 digits"
    When I enter national ID as "12345678"
    Then the validation should pass

  @validation @phone
  Scenario Outline: Kenya phone number format validation
    When I enter phone number as "<phone>"
    Then the validation result should be "<result>"

    Examples:
      | phone          | result  |
      | +254712345678  | valid   |
      | 0712345678     | valid   |
      | 254712345678   | valid   |
      | 12345          | invalid |
      | +1234567890    | invalid |

  @validation @required
  Scenario: Required fields are enforced
    When I try to submit with missing required fields
    Then I should see validation errors for:
      | field       |
      | First Name  |
      | Last Name   |
      | Date of Birth|
      | Gender      |
      | County      |
      | Sub-County  |

  # ============================================
  # KENYA LOCATION HIERARCHY
  # ============================================

  @smoke @location
  Scenario: Kenya location hierarchy cascades correctly
    When I select county "Nairobi"
    Then sub-county dropdown should show only Nairobi sub-counties
    When I select sub-county "Westlands"
    Then ward dropdown should show only Westlands wards
    And I should be able to select ward "Parklands"

  @location @counties
  Scenario: All 47 Kenya counties are available
    When I open the county dropdown
    Then I should see 47 counties available
    And counties should include:
      | county   |
      | Nairobi  |
      | Mombasa  |
      | Kisumu   |
      | Nakuru   |
      | Kiambu   |

  @location @cascade
  Scenario: Sub-county changes when county changes
    Given I have selected county "Nairobi" and sub-county "Westlands"
    When I change county to "Mombasa"
    Then sub-county should be cleared
    And sub-county dropdown should show Mombasa sub-counties
    And ward should be cleared

  @location @api
  Scenario: Location data loads from API
    When I select county "Nairobi"
    Then the system should call GET /api/locations/sub-counties/?county={id}
    And sub-counties should populate within 1 second

  # ============================================
  # EMERGENCY CONTACTS
  # ============================================

  @smoke @emergency-contact
  Scenario: Add emergency contact during registration
    When I add an emergency contact:
      | field        | value          |
      | Name         | John Wanjiku   |
      | Phone        | +254723456789  |
      | Relationship | Spouse         |
    And I complete registration
    Then the emergency contact should be saved with the patient

  @emergency-contact @multiple
  Scenario: Add multiple emergency contacts
    When I add emergency contact "John Wanjiku" as "Spouse"
    And I click "Add Another Emergency Contact"
    And I add emergency contact "Mary Wanjiku" as "Parent"
    Then 2 emergency contacts should be saved

  @emergency-contact @relationship
  Scenario Outline: Emergency contact relationship options
    When I select relationship "<relationship>"
    Then it should be accepted

    Examples:
      | relationship |
      | Spouse       |
      | Parent       |
      | Child        |
      | Sibling      |
      | Friend       |
      | Guardian     |
      | Other        |

  @emergency-contact @recommended
  Scenario: System recommends at least one emergency contact
    When I try to register without any emergency contact
    Then I should see a soft warning "Emergency contact recommended for patient safety"
    But the registration should still be allowed

  # ============================================
  # REFERRAL SOURCE
  # ============================================

  @referral
  Scenario Outline: Capture patient referral source
    When I select referral source "<source>"
    Then the referral source should be recorded

    Examples:
      | source          |
      | Self            |
      | Clinic          |
      | Other Facility  |

  @referral @facility
  Scenario: Capture referring facility name
    When I select referral source "Other Facility"
    Then I should see a field for "Referred From Facility"
    When I enter "Kenyatta National Hospital"
    Then the referring facility should be recorded

  # ============================================
  # CONSENT MANAGEMENT
  # ============================================

  @smoke @consent
  Scenario: Capture patient consent during registration
    When I check the consent checkbox
    Then consent_given should be set to true
    And consent_date should be set to current timestamp
    And the consent agreement should be recorded

  @consent @default
  Scenario: Consent defaults to not given
    When I view the registration form
    Then consent checkbox should be unchecked
    And consent_given should default to false

  @consent @decline
  Scenario: Patient can decline consent
    When I leave consent unchecked
    And I enter reason "Patient refused"
    Then the patient can still be registered
    And consent_given should be false
    And decline reason should be recorded

  @consent @display
  Scenario: Display consent agreement text
    When I view the consent section
    Then I should see consent text explaining:
      | purpose                                          |
      | Processing of personal data for healthcare       |
      | Sharing with SHA for claims                      |
      | Storage for legally required period              |
    And patient rights should be displayed

  # ============================================
  # DATA ENCRYPTION
  # ============================================

  @security @encryption
  Scenario: Sensitive fields are encrypted at rest
    When I register a patient with national ID "12345678"
    Then the national_id field should be encrypted in the database
    And phone_number should be encrypted in the database
    And decryption should only occur on authorized access

  # ============================================
  # DUPLICATE DETECTION
  # ============================================

  @duplicate @warning
  Scenario: Warn about potential duplicate patient
    Given a patient exists with national ID "12345678"
    When I try to register another patient with national ID "12345678"
    Then I should see a warning "Patient with this National ID already exists"
    And I should see option to view existing patient
    And I should see existing patient's MRN

  @duplicate @phone
  Scenario: Detect duplicate by phone number
    Given a patient exists with phone "+254712345678"
    When I enter the same phone number
    Then I should see a warning about potential duplicate
    And I should be able to proceed if it's a different person

  # ============================================
  # SENSITIVE PATIENT FLAG
  # ============================================

  @sensitive
  Scenario: Mark patient as sensitive
    Given I have "patients.add_sensitive" permission
    When I check "Sensitive Patient (HIV/GBV/Mental Health)"
    Then is_sensitive should be set to true
    And the patient should be hidden from users without view_sensitive permission

  @sensitive @hidden
  Scenario: Sensitive patients are hidden by default
    Given a patient is marked as sensitive
    And I do NOT have "patients.view_sensitive_patient" permission
    When I search for the patient
    Then the patient should not appear in search results

  # ============================================
  # GENDER OPTIONS
  # ============================================

  @gender
  Scenario Outline: Gender selection options
    When I select gender "<gender>"
    Then the selection should be saved as "<code>"

    Examples:
      | gender | code |
      | Male   | M    |
      | Female | F    |
      | Other  | O    |

  # ============================================
  # OFFLINE REGISTRATION
  # ============================================

  @offline @create
  Scenario: Register patient while offline
    Given I am offline
    When I complete patient registration
    Then the patient should be saved locally
    And a temporary MRN should be assigned
    And the record should be queued for sync
    And I should see "Offline - Pending Sync" indicator

  @offline @sync
  Scenario: Offline registrations sync when online
    Given I registered a patient while offline
    When I come back online
    Then the patient should sync to the server
    And the temporary MRN should be replaced with server MRN
    And audit log should record sync timestamp

  @offline @conflict
  Scenario: Handle MRN conflict on sync
    Given I registered a patient offline with temp MRN
    And another user registered a patient with same details online
    When I sync
    Then I should see a conflict notification
    And I should be able to merge or mark as separate patients

  # ============================================
  # AUDIT TRAIL
  # ============================================

  @audit
  Scenario: Registration creates audit log
    When I register a new patient
    Then an audit log entry should be created with:
      | field         | value          |
      | action        | patient_create |
      | user          | (my user ID)   |
      | resource_type | Patient        |
      | timestamp     | (current time) |
      | ip_address    | (my IP)        |

  # ============================================
  # ACCESSIBILITY
  # ============================================

  @a11y
  Scenario: Registration form is keyboard navigable
    When I use keyboard navigation
    Then I should be able to complete registration using only keyboard
    And focus should move logically through form fields
    And required fields should be announced to screen readers

  @a11y @labels
  Scenario: All form fields have proper labels
    Then all form inputs should have associated labels
    And error messages should be linked to their fields
    And ARIA attributes should be properly set

  # ============================================
  # PERFORMANCE
  # ============================================

  @performance
  Scenario: Registration completes quickly
    When I submit valid registration data
    Then the patient should be created within 2 seconds
    And MRN should be generated within 500ms
    And success message should display immediately
