@triage @assessment
Feature: Triage Assessment Form
  As a triage nurse
  I want to perform patient triage assessments
  So that patients are prioritized according to KETA (Kenya Emergency Triage Assessment) standards

  Background:
    Given I am logged in as a user with "perform_triage" permission
    And I am on the triage assessment page for patient "MRN-20260103-0001"
    And the patient has an active encounter

  # ============================================
  # PATIENT ARRIVAL & IDENTIFICATION
  # ============================================

  @smoke @arrival
  Scenario: Record patient arrival mode
    When I select arrival mode "Ambulance"
    And I enter arrival time as "10:30 AM"
    Then the arrival mode should be set to "AMBULANCE"
    And the arrival time should be recorded

  Scenario Outline: Select valid arrival modes
    When I select arrival mode "<mode>"
    Then the arrival mode should be set to "<code>"

    Examples:
      | mode                           | code     |
      | Walk-in                        | WALK_IN  |
      | Ambulance                      | AMBULANCE|
      | Police                         | POLICE   |
      | Referral from another facility | REFERRAL |
      | Other                          | OTHER    |

  # ============================================
  # CLINICAL ASSESSMENT DATA ENTRY
  # ============================================

  @smoke @chief-complaint
  Scenario: Enter chief complaint with category
    When I select chief complaint category "Chest Pain"
    And I enter chief complaint details "Sharp pain radiating to left arm, started 2 hours ago"
    Then the chief complaint category should be "CHEST_PAIN"
    And the chief complaint text should be saved

  Scenario Outline: Select valid chief complaint categories
    When I select chief complaint category "<category>"
    Then the chief complaint category code should be "<code>"

    Examples:
      | category              | code                  |
      | Chest Pain            | CHEST_PAIN            |
      | Difficulty Breathing  | DIFFICULTY_BREATHING  |
      | Trauma/Injury         | TRAUMA                |
      | Fever                 | FEVER                 |
      | Abdominal Pain        | ABDOMINAL_PAIN        |
      | Headache              | HEADACHE              |
      | Altered Consciousness | ALTERED_CONSCIOUSNESS |
      | Bleeding              | BLEEDING              |
      | Poisoning/Overdose    | POISONING             |
      | Obstetric Emergency   | OBSTETRIC             |
      | Pediatric Emergency   | PEDIATRIC             |
      | Other                 | OTHER                 |

  @pain-score
  Scenario: Enter pain score using visual scale
    When I click on pain level 7 on the pain scale
    Then the pain score should be set to 7
    And the pain indicator should show "Severe"

  Scenario Outline: Pain score validation and display
    When I set the pain score to <score>
    Then the pain indicator should show "<severity>"
    And the pain color should be "<color>"

    Examples:
      | score | severity   | color  |
      | 0     | None       | green  |
      | 1     | Minimal    | green  |
      | 3     | Mild       | yellow |
      | 5     | Moderate   | orange |
      | 7     | Severe     | red    |
      | 9     | Worst      | red    |
      | 10    | Unbearable | red    |

  Scenario: Pain score is optional
    When I leave the pain score empty
    And I submit the triage assessment
    Then the assessment should be saved successfully
    And the pain score should be null

  @avpu @mental-status
  Scenario Outline: Record AVPU mental status
    When I select mental status "<status>"
    Then the mental status code should be "<code>"
    And the mental status indicator should show "<description>"

    Examples:
      | status              | code | description          |
      | Alert               | A    | Patient is alert     |
      | Responds to Voice   | V    | Responds to voice    |
      | Responds to Pain    | P    | Responds to pain     |
      | Unresponsive        | U    | Patient unresponsive |

  @smoke @avpu
  Scenario: Unresponsive patient triggers RED alert
    When I select mental status "Unresponsive"
    Then an alert should appear with message "CRITICAL: Unresponsive patient - Immediate attention required"
    And the suggested triage category should be "RED"

  @mobility
  Scenario Outline: Record patient mobility status
    When I select mobility status "<status>"
    Then the mobility code should be "<code>"

    Examples:
      | status          | code       |
      | Ambulatory      | AMBULATORY |
      | Wheelchair      | WHEELCHAIR |
      | Stretcher       | STRETCHER  |
      | Immobile/Carried| IMMOBILE   |

  @allergies
  Scenario: Auto-populate allergies from patient record
    Given the patient has allergies "Penicillin, Sulfa drugs"
    When I open the triage assessment form
    Then the allergies field should show "Penicillin, Sulfa drugs"
    And I should be able to edit the allergies noted

  Scenario: Add allergies not in patient record
    Given the patient has no recorded allergies
    When I enter allergies noted "NKDA (No Known Drug Allergies)"
    Then the allergies noted should be saved with the assessment

  # ============================================
  # TRIAGE CATEGORIZATION (KETA)
  # ============================================

  @smoke @keta @category
  Scenario: System auto-calculates triage category
    Given I have entered the following assessment data:
      | field                    | value                |
      | chief_complaint_category | DIFFICULTY_BREATHING |
      | mental_status            | A                    |
      | pain_score               | 6                    |
    And the encounter has vitals:
      | vital          | value |
      | spo2           | 91    |
      | systolic_bp    | 140   |
      | heart_rate     | 95    |
    When I click "Calculate Triage Category"
    Then the auto-calculated category should be "ORANGE"
    And alerts should include "Low oxygen saturation (SpO2 91%)"

  @keta @red
  Scenario Outline: RED category triggers for critical conditions
    Given the encounter has vitals:
      | vital       | value   |
      | <vital>     | <value> |
    When I calculate the triage category
    Then the suggested category should be "RED"
    And an alert should be shown: "<alert>"

    Examples:
      | vital       | value | alert                                    |
      | spo2        | 85    | Severe hypoxemia - SpO2 critically low   |
      | systolic_bp | 85    | Severe hypotension - Systolic BP < 90    |
      | systolic_bp | 190   | Hypertensive crisis - Systolic BP > 180  |
      | heart_rate  | 35    | Severe bradycardia - HR < 40 bpm         |
      | heart_rate  | 160   | Severe tachycardia - HR > 150 bpm        |

  @keta @orange
  Scenario: ORANGE category for chest pain with warning vitals
    Given I have entered chief complaint category "Chest Pain"
    And the encounter has vitals:
      | vital       | value |
      | spo2        | 96    |
      | systolic_bp | 155   |
      | heart_rate  | 95    |
    When I calculate the triage category
    Then the suggested category should be "ORANGE"

  @keta @yellow
  Scenario: YELLOW category for moderate severity
    Given I have entered the following assessment data:
      | field                    | value          |
      | chief_complaint_category | FEVER          |
      | mental_status            | A              |
      | pain_score               | 5              |
    And the encounter has vitals:
      | vital       | value |
      | temperature | 38.8  |
      | spo2        | 97    |
    When I calculate the triage category
    Then the suggested category should be "YELLOW"

  @keta @green
  Scenario: GREEN category for stable patients
    Given I have entered the following assessment data:
      | field                    | value          |
      | chief_complaint_category | HEADACHE       |
      | mental_status            | A              |
      | pain_score               | 3              |
    And all vitals are within normal range
    When I calculate the triage category
    Then the suggested category should be "GREEN"

  @keta @blue
  Scenario: BLUE category for non-urgent/referral
    Given I have entered the following assessment data:
      | field                    | value |
      | chief_complaint_category | OTHER |
      | mental_status            | A     |
      | pain_score               | 1     |
    And all vitals are within normal range
    And the patient is seeking a follow-up or referral
    When I calculate the triage category
    Then the suggested category should be "BLUE"

  @override
  Scenario: Nurse can override auto-calculated category
    Given the auto-calculated category is "YELLOW"
    When I select triage category "ORANGE"
    Then I should see a prompt for override reason
    When I enter override reason "Patient appears distressed, sweating profusely"
    Then the triage category should be set to "ORANGE"
    And the override should be logged in audit trail

  @override @validation
  Scenario: Override requires mandatory reason
    Given the auto-calculated category is "GREEN"
    When I select triage category "YELLOW"
    And I try to save without entering an override reason
    Then I should see an error "Override reason is required when changing category"
    And the form should not submit

  # ============================================
  # CARE AREA ROUTING
  # ============================================

  @routing
  Scenario Outline: Route patient to appropriate care area
    When I select assigned area "<area>"
    Then the area code should be "<code>"

    Examples:
      | area               | code          |
      | ER - Resuscitation | ER_RESUS      |
      | ER - Acute Care    | ER_ACUTE      |
      | ER - Fast Track    | ER_FAST_TRACK |
      | Observation Unit   | OBSERVATION   |
      | OPD                | OPD           |
      | Trauma Bay         | TRAUMA        |
      | Pediatric ER       | PEDIATRIC_ER  |
      | Maternity/Labor    | MATERNITY     |
      | Specialty Clinic   | SPECIALTY     |

  @routing @auto
  Scenario: Auto-suggest care area based on category and complaint
    Given I have set triage category to "RED"
    And chief complaint category is "TRAUMA"
    Then the suggested care area should be "Trauma Bay"

  @clinician-assignment
  Scenario: Assign patient to specific clinician
    Given the following clinicians are available:
      | name          | area     |
      | Dr. Kamau     | ER_ACUTE |
      | Dr. Ochieng   | ER_ACUTE |
    When I select assigned area "ER - Acute Care"
    And I select assigned clinician "Dr. Kamau"
    Then the patient should be assigned to "Dr. Kamau"

  # ============================================
  # FORM SUBMISSION & QUEUE
  # ============================================

  @smoke @submit
  Scenario: Submit complete triage assessment
    Given I have completed all required triage fields:
      | field                    | value                       |
      | arrival_mode             | WALK_IN                     |
      | arrival_time             | 2026-01-03T10:30:00         |
      | chief_complaint_category | CHEST_PAIN                  |
      | chief_complaint          | Sharp chest pain, 2 hours   |
      | pain_score               | 7                           |
      | mental_status            | A                           |
      | mobility                 | AMBULATORY                  |
      | triage_category          | ORANGE                      |
      | assigned_area            | ER_ACUTE                    |
    When I click "Complete Triage"
    Then the assessment should be saved successfully
    And the patient should be added to the triage queue
    And I should see a success message "Triage assessment completed"
    And the triage end time should be recorded

  @validation
  Scenario: Cannot submit without required fields
    Given I have not entered chief complaint category
    When I try to submit the triage assessment
    Then I should see validation error "Chief complaint category is required"
    And the form should not submit

  @validation
  Scenario Outline: Required field validation
    Given I have left "<field>" empty
    When I try to submit the triage assessment
    Then I should see validation error "<error_message>"

    Examples:
      | field                    | error_message                       |
      | arrival_time             | Arrival time is required            |
      | chief_complaint_category | Chief complaint category is required|
      | chief_complaint          | Chief complaint details are required|
      | mental_status            | Mental status (AVPU) is required    |
      | mobility                 | Mobility status is required         |
      | triage_category          | Triage category is required         |
      | assigned_area            | Assigned care area is required      |

  # ============================================
  # TIMESTAMPS & AUDIT
  # ============================================

  @timestamps
  Scenario: Record critical timestamps
    Given I start a new triage assessment
    Then triage_start_time should be automatically set
    When I complete the assessment
    Then triage_end_time should be recorded
    And the total triage duration should be calculated

  @audit
  Scenario: All triage actions are audit logged
    When I complete a triage assessment
    Then an audit log entry should be created with:
      | field         | value                    |
      | action        | triage_create            |
      | resource_type | TriageAssessment         |
      | user          | current user             |

  @audit @override
  Scenario: Category overrides are specially logged
    When I override the category from "YELLOW" to "ORANGE"
    Then an audit log entry should be created with:
      | field   | value                              |
      | action  | triage_category_override           |
      | details | from: YELLOW, to: ORANGE, reason: X|
