@patients @opd @outpatient
Feature: Outpatient (OPD) Clinical Flow
  As a clinician (doctor, clinical officer, or nurse)
  I want to manage outpatient encounters and clinical documentation
  So that patients receive proper care and medical records are maintained

  Background:
    Given I am logged in as a user with clinical permissions
    And I am on the outpatient department page

  # ============================================
  # ENCOUNTER CREATION
  # ============================================

  @smoke @encounter-create
  Scenario: Create a new OPD encounter
    Given patient "Jane Wanjiku" (MRN-20260103-0042) exists
    When I start a new encounter for the patient
    And I select encounter type "OPD"
    Then a new encounter should be created
    And encounter_date should be set to today
    And encounter should be linked to the patient
    And I should be on the encounter documentation page

  @encounter @from-queue
  Scenario: Start encounter from queue
    Given patient "Jane Wanjiku" is in the OPD queue
    When I click "Call Patient" or "Start Encounter"
    Then a new OPD encounter should be created
    And the patient should be removed from waiting queue
    And queue status should update to "In Consultation"

  @encounter @type
  Scenario Outline: Create encounter with different types
    When I create an encounter with type "<type>"
    Then the encounter type should be "<type>"
    And appropriate workflow should be initiated

    Examples:
      | type      |
      | OPD       |
      | EMERGENCY |
      | FOLLOW_UP |

  # ============================================
  # VITALS CAPTURE
  # ============================================

  @smoke @vitals
  Scenario: Record patient vitals
    Given I am documenting an encounter
    When I enter vitals:
      | vital            | value  |
      | Temperature      | 37.5   |
      | Pulse            | 78     |
      | Blood Pressure   | 120/80 |
      | Respiratory Rate | 18     |
      | SpO2             | 98     |
      | Weight           | 65.5   |
      | Height           | 165    |
    And I save the vitals
    Then all vitals should be recorded in the encounter
    And BMI should be auto-calculated as 24.1

  @vitals @validation
  Scenario Outline: Vitals validation ranges
    When I enter <vital> as "<value>"
    Then validation should show "<result>"

    Examples:
      | vital            | value  | result                    |
      | Temperature      | 37.0   | valid                     |
      | Temperature      | 42.5   | warning - very high       |
      | Temperature      | 34.0   | warning - very low        |
      | Pulse            | 75     | valid                     |
      | Pulse            | 180    | warning - tachycardia     |
      | Pulse            | 40     | warning - bradycardia     |
      | SpO2             | 98     | valid                     |
      | SpO2             | 92     | critical - hypoxemia      |
      | Blood Pressure   | 120/80 | valid                     |
      | Blood Pressure   | 180/110| warning - hypertensive    |

  @vitals @spo2-alert
  Scenario: SpO2 critical alert when below 95%
    When I enter SpO2 as "92"
    Then a critical alert should display:
      | alert_type | message                              |
      | CRITICAL   | ⚠️ Hypoxemia Alert - SpO2 92%        |
    And the alert should be red and prominent
    And the alert should persist until acknowledged
    And I should see option to escalate to doctor

  @vitals @bmi
  Scenario: BMI auto-calculation
    When I enter weight "70" kg and height "175" cm
    Then BMI should be calculated as "22.9"
    And BMI category should show "Normal"

  @vitals @bmi-categories
  Scenario Outline: BMI category display
    Given weight and height result in BMI of <bmi>
    Then the category should display as "<category>"

    Examples:
      | bmi  | category     |
      | 17   | Underweight  |
      | 22   | Normal       |
      | 27   | Overweight   |
      | 32   | Obese        |

  # ============================================
  # CHIEF COMPLAINT
  # ============================================

  @smoke @chief-complaint
  Scenario: Record chief complaint
    Given I am documenting an encounter
    When I enter chief complaint "Fever and body aches for 3 days"
    Then the chief complaint should be saved
    And it should be displayed prominently in the encounter

  @chief-complaint @required
  Scenario: Chief complaint is required for OPD encounters
    Given I try to complete an OPD encounter
    When chief complaint is empty
    Then I should see validation error "Chief complaint is required"

  # ============================================
  # MEDICAL HISTORY
  # ============================================

  @history @allergies
  Scenario: Record patient allergies
    When I add allergies:
      | allergy     | reaction           |
      | Penicillin  | Rash, difficulty breathing |
      | Sulfa drugs | Hives              |
    Then allergies should be saved to the encounter
    And allergies should display prominently with warning icon
    And allergies should persist across encounters

  @history @chronic
  Scenario: Record chronic conditions
    When I add chronic conditions:
      | condition    | since      |
      | Hypertension | 2020-01-01 |
      | Diabetes     | 2018-06-15 |
    Then chronic conditions should be recorded
    And they should appear in patient medical summary

  @history @medications
  Scenario: Record current medications
    When I add current medications:
      | medication        | dosage    | frequency   |
      | Amlodipine 5mg    | 1 tablet  | Once daily  |
      | Metformin 500mg   | 1 tablet  | Twice daily |
    Then current medications should be recorded
    And they should be checked against new prescriptions

  @history @surgeries
  Scenario: Record past surgeries
    When I add past surgery "Appendectomy" on "2015-03-20"
    Then past surgeries should be recorded in medical history

  @history @family
  Scenario: Record family history
    When I add family history:
      | relative | condition  |
      | Father   | Diabetes   |
      | Mother   | Hypertension|
    Then family history should be recorded

  @history @social
  Scenario: Record social history
    When I record social history:
      | factor     | value                  |
      | Smoking    | Former smoker, quit 2020|
      | Alcohol    | Occasional             |
      | Occupation | Teacher                |
    Then social history should be recorded

  @history @prepopulate
  Scenario: Medical history pre-populates from previous encounters
    Given patient has previous encounter with allergies "Penicillin"
    When I start a new encounter
    Then allergies should be pre-populated with "Penicillin"
    And chronic conditions should be pre-populated
    And I can update the history if needed

  # ============================================
  # CLINICAL NOTES
  # ============================================

  @notes @hpi
  Scenario: Document History of Present Illness
    When I enter HPI:
      """
      Patient reports 3-day history of fever, reaching 38.5°C at home.
      Associated with generalized body aches, mild headache, and fatigue.
      No cough, no rash, no vomiting.
      """
    Then the HPI should be saved to the encounter

  @notes @examination
  Scenario: Document examination findings
    When I enter examination findings:
      | system   | findings                              |
      | General  | Alert, febrile, mild pallor          |
      | HEENT    | No jaundice, no lymphadenopathy       |
      | Chest    | Clear breath sounds bilaterally       |
      | Abdomen  | Soft, non-tender, no organomegaly     |
    Then examination findings should be recorded

  # ============================================
  # DIAGNOSIS (ICD-10)
  # ============================================

  @smoke @diagnosis
  Scenario: Add diagnosis with ICD-10 code
    When I search for diagnosis "malaria"
    Then I should see ICD-10 options:
      | code   | description                              |
      | B50.9  | Plasmodium falciparum malaria, unspecified|
      | B51.9  | Plasmodium vivax malaria, unspecified    |
      | B54    | Unspecified malaria                      |
    When I select "B50.9 - Plasmodium falciparum malaria"
    And I mark it as primary diagnosis
    Then the diagnosis should be added to the encounter

  @diagnosis @multiple
  Scenario: Add multiple diagnoses
    When I add diagnoses:
      | code  | description                  | primary |
      | B50.9 | P. falciparum malaria        | Yes     |
      | R50.9 | Fever, unspecified           | No      |
      | D64.9 | Anemia, unspecified          | No      |
    Then all 3 diagnoses should be recorded
    And primary diagnosis should be marked

  @diagnosis @search
  Scenario: ICD-10 code search
    When I search for "diabetes"
    Then I should see relevant ICD-10 codes
    And codes should include E11 (Type 2 diabetes)
    And search should return within 1 second

  @diagnosis @required
  Scenario: At least one diagnosis required
    When I try to complete an encounter without diagnosis
    Then I should see warning "At least one diagnosis is recommended"
    But I should be able to proceed with justification

  # ============================================
  # TREATMENT PLAN
  # ============================================

  @treatment @template
  Scenario: Apply clinical template for treatment
    When I select clinical template "Uncomplicated Malaria (Adult)"
    Then treatment plan should pre-populate with:
      | component    | content                           |
      | Medications  | Artemether-Lumefantrine           |
      | Investigations| Malaria RDT, FBC                 |
      | Follow-up    | Return if symptoms persist 3 days |
    And I should be able to customize before saving

  @treatment @prescribe
  Scenario: Create prescription from encounter
    When I add medication to treatment plan:
      | drug                    | dosage    | frequency   | duration |
      | Artemether-Lumefantrine | 4 tablets | Twice daily | 3 days   |
      | Paracetamol 500mg       | 2 tablets | Three times | 7 days   |
    Then a prescription should be created
    And it should be linked to this encounter
    And it should appear in pharmacy queue

  @treatment @lab-order
  Scenario: Order laboratory tests
    When I order lab tests:
      | test        | urgency |
      | Malaria RDT | Urgent  |
      | FBC         | Routine |
    Then lab orders should be created
    And they should appear in lab queue
    And patient should be directed to lab

  # ============================================
  # ALLERGY ALERTS
  # ============================================

  @allergy @alert
  Scenario: Display allergy alert during prescribing
    Given patient has allergy to "Penicillin"
    When I try to prescribe "Amoxicillin"
    Then I should see allergy alert:
      | severity | message                                  |
      | CRITICAL | Patient allergic to Penicillin class     |
    And prescription should be blocked until acknowledged

  @allergy @display
  Scenario: Allergies displayed prominently in encounter
    Given patient has recorded allergies
    When I view the encounter
    Then allergies should be displayed in a prominent banner
    And the banner should be red for drug allergies
    And allergies should be visible throughout documentation

  # ============================================
  # ENCOUNTER COMPLETION
  # ============================================

  @complete
  Scenario: Complete OPD encounter
    Given I have documented:
      | component        | status   |
      | Vitals           | Recorded |
      | Chief Complaint  | Recorded |
      | Diagnosis        | Added    |
      | Treatment Plan   | Created  |
    When I click "Complete Encounter"
    Then the encounter should be marked complete
    And billing items should be generated
    And patient should be directed to next department

  @complete @summary
  Scenario: Generate encounter summary
    Given an encounter is complete
    When I view or print the summary
    Then it should include:
      | section          |
      | Patient Info     |
      | Vitals           |
      | Chief Complaint  |
      | Diagnoses        |
      | Treatment Plan   |
      | Prescriptions    |
      | Lab Orders       |
      | Follow-up        |

  @complete @billing
  Scenario: Encounter generates billing items
    Given I complete an encounter with consultation and lab orders
    Then billing line items should be auto-created:
      | item            | source      |
      | OPD Consultation| Encounter   |
      | Lab Tests       | Lab Orders  |
      | Medications     | Prescription|

  # ============================================
  # FOLLOW-UP & REFERRAL
  # ============================================

  @followup
  Scenario: Schedule follow-up appointment
    When I schedule follow-up:
      | field    | value                        |
      | Date     | 7 days from today            |
      | Reason   | Review lab results           |
      | Notes    | Return earlier if worsening  |
    Then follow-up should be scheduled
    And patient should receive reminder (if enabled)

  @referral @internal
  Scenario: Create internal referral
    When I refer patient to "Specialist - Cardiology"
    And I add referral reason "Suspected cardiac condition"
    Then referral should be created
    And specialist should be notified
    And referral status should be "Pending"

  @referral @external
  Scenario: Create external referral
    When I refer patient to external facility
    And I enter facility "Kenyatta National Hospital"
    And I add referral letter
    Then external referral should be documented
    And referral letter should be printable

  # ============================================
  # ADMISSION RECOMMENDATION
  # ============================================

  @admission @recommend
  Scenario: Recommend patient for inpatient admission
    Given patient requires inpatient care
    When I click "Recommend for Admission"
    And I enter:
      | field               | value                               |
      | Admission Reason    | Severe malaria requiring IV treatment|
      | Provisional Diagnosis| B50.0 - Severe falciparum malaria  |
      | Recommended Ward    | Medical Ward                        |
    Then encounter status should change to "ADMISSION_PENDING"
    And reception should be notified
    And admission recommendation should expire after 24 hours

  @admission @notification
  Scenario: Reception receives admission notification
    Given a doctor recommends admission for patient
    Then reception should receive notification:
      | content                                           |
      | Patient MRN-20260103-0042 recommended for admission|
      | By: Dr. Ochieng                                   |
      | Reason: Severe malaria requiring IV treatment     |

  # ============================================
  # OFFLINE DOCUMENTATION
  # ============================================

  @offline @encounter
  Scenario: Document encounter while offline
    Given I am offline
    When I complete encounter documentation
    Then encounter should be saved locally
    And sync indicator should show "Pending"
    And all data should sync when online

  @offline @vitals
  Scenario: Record vitals offline
    Given I am offline
    When I record patient vitals
    Then vitals should be saved locally
    And should sync automatically when connected

  # ============================================
  # CLINICAL OFFICER SCOPE
  # ============================================

  @role @clinical-officer
  Scenario: Clinical officer can document encounters
    Given I am logged in as a clinical officer
    Then I should be able to:
      | action                    |
      | Create OPD encounters     |
      | Record vitals             |
      | Add diagnoses             |
      | Prescribe within scope    |
      | Order approved lab tests  |
      | Escalate to doctor        |

  @role @escalate
  Scenario: Clinical officer escalates to doctor
    Given I am a clinical officer
    And patient needs specialist review
    When I click "Escalate to Doctor"
    And I select urgency "Urgent"
    Then the case should be flagged for doctor review
    And doctor should receive notification

  # ============================================
  # AUDIT TRAIL
  # ============================================

  @audit
  Scenario: All encounter actions are audited
    Given I perform actions on an encounter
    Then audit log should record:
      | action             |
      | encounter_create   |
      | vitals_recorded    |
      | diagnosis_added    |
      | prescription_created|
      | encounter_complete |

  # ============================================
  # EMERGENCY ENCOUNTERS
  # ============================================

  @emergency
  Scenario: Create emergency encounter
    When I create encounter type "EMERGENCY"
    Then the encounter should be flagged as emergency
    And it should bypass normal queue
    And triage should be mandatory
    And all staff should be alerted if critical

  @emergency @bypass
  Scenario: Emergency bypasses payment requirements
    Given an emergency encounter is created
    Then services should be provided first
    And billing should be deferred
    And documentation should note emergency status
