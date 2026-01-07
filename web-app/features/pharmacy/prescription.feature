@pharmacy @prescription
Feature: Prescription Management
  As a clinician or pharmacist
  I want to create and manage prescriptions
  So that patients receive appropriate medications with proper documentation

  Background:
    Given I am logged in as a user with clinical permissions
    And a patient "Jane Wanjiku" with MRN "MRN-20260103-0042" exists
    And the patient has an active encounter

  # ============================================
  # PRESCRIPTION CREATION
  # ============================================

  @smoke @create
  Scenario: Create a new prescription
    Given I am on the encounter page for patient "Jane Wanjiku"
    When I click "Add Prescription"
    And I add the following prescription items:
      | drug                      | quantity | dosage    | frequency      | duration | route |
      | Artemether-Lumefantrine   | 24       | 4 tablets | Twice daily    | 3 days   | Oral  |
      | Paracetamol 500mg         | 20       | 2 tablets | Three times    | 7 days   | Oral  |
    And I add clinical notes "Take AL with fatty food for better absorption"
    And I submit the prescription
    Then a prescription should be created with status "PENDING"
    And the prescription should be linked to the encounter
    And the prescription should have 2 items
    And a notification should be sent to pharmacy

  @create @search
  Scenario: Search drugs while prescribing
    Given I am creating a prescription
    When I type "para" in the drug search field
    Then I should see matching drugs:
      | drug                |
      | Paracetamol 500mg   |
      | Paracetamol 250mg   |
      | Paracetamol Syrup   |
    When I select "Paracetamol 500mg"
    Then the drug should be added to the prescription

  @create @template
  Scenario: Create prescription from clinical template
    Given a clinical template "Uncomplicated Malaria (Adult)" exists
    When I select the template
    Then the prescription should be pre-populated with:
      | drug                    | quantity | dosage    | frequency   | duration |
      | Artemether-Lumefantrine | 24       | 4 tablets | Twice daily | 3 days   |
    And I should be able to modify the items before saving

  @create @dosage
  Scenario Outline: Enter dosage instructions
    Given I am adding a drug to a prescription
    When I enter dosage instructions:
      | field     | value        |
      | Quantity  | <quantity>   |
      | Dosage    | <dosage>     |
      | Frequency | <frequency>  |
      | Duration  | <duration>   |
      | Route     | <route>      |
    Then the instructions should be displayed as "<display>"

    Examples:
      | quantity | dosage    | frequency         | duration | route | display                                  |
      | 24       | 4 tablets | Twice daily (BD)  | 3 days   | Oral  | 4 tablets BD × 3 days, Oral              |
      | 10       | 5ml       | Three times (TDS) | 5 days   | Oral  | 5ml TDS × 5 days, Oral                   |
      | 3        | 1 vial    | Once daily (OD)   | 3 days   | IV    | 1 vial OD × 3 days, IV                   |
      | 30       | 1 tablet  | Once daily (OD)   | 30 days  | Oral  | 1 tablet OD × 30 days, Oral              |

  @create @prn
  Scenario: Add PRN (as needed) medication
    Given I am creating a prescription
    When I add a drug with PRN instructions:
      | drug              | dosage    | max_frequency | indication |
      | Paracetamol 500mg | 2 tablets | Every 6 hours | For fever  |
    Then the prescription should show "PRN - as needed for fever"
    And maximum daily dose should be calculated

  # ============================================
  # ALLERGY & INTERACTION CHECKS
  # ============================================

  @smoke @allergy
  Scenario: Alert for drug allergy
    Given patient "Jane Wanjiku" has an allergy to "Penicillin"
    When I try to prescribe "Amoxicillin 500mg"
    Then I should see an allergy alert:
      | alert_type | message                                          |
      | CRITICAL   | ⚠️ ALLERGY ALERT: Patient allergic to Penicillin |
    And the prescription should be blocked until acknowledged
    And I should have to confirm override if proceeding

  @allergy @cross-reactivity
  Scenario: Alert for cross-reactive drug allergy
    Given patient has allergy to "Penicillin"
    When I try to prescribe a cephalosporin
    Then I should see a cross-reactivity warning
    And the warning should indicate possible cross-reaction

  @interaction @drug-drug
  Scenario: Alert for drug-drug interaction
    Given the patient is currently taking "Warfarin"
    When I prescribe "Aspirin"
    Then I should see an interaction alert:
      | severity | message                                      |
      | HIGH     | ⚠️ Increased bleeding risk with Warfarin    |
    And I should be required to acknowledge before proceeding

  @interaction @check
  Scenario: Run full interaction check
    Given a prescription with multiple drugs
    When the system performs interaction checking
    Then all drug-drug interactions should be identified
    And severity levels should be displayed (Low/Medium/High/Critical)
    And clinical recommendations should be shown

  # ============================================
  # PRESCRIPTION VALIDITY & STATUS
  # ============================================

  @validity
  Scenario: Prescription has 30-day validity
    Given I create a prescription on "2026-01-07"
    Then the prescription should have valid_until date of "2026-02-06"
    And the prescription should show "29 days remaining"

  @validity @expired
  Scenario: Expired prescription cannot be dispensed
    Given a prescription was created on "2025-11-01"
    And today is "2026-01-07" (more than 30 days later)
    When I try to dispense from this prescription
    Then I should see "Prescription has expired"
    And the prescription status should be "EXPIRED"
    And dispensing should be blocked

  @status @pending
  Scenario: New prescription has PENDING status
    When I create a new prescription
    Then the status should be "PENDING"
    And the prescription should appear in pharmacy queue

  @status @partial
  Scenario: Prescription becomes PARTIAL when partially dispensed
    Given a prescription with 2 items
    When 1 item is fully dispensed
    And 1 item remains undispensed
    Then the prescription status should be "PARTIAL"

  @status @dispensed
  Scenario: Prescription becomes DISPENSED when fully dispensed
    Given a prescription with all items
    When all items are fully dispensed
    Then the prescription status should be "DISPENSED"
    And no further dispensing should be allowed

  @status @cancelled
  Scenario: Cancel a prescription
    Given a pending prescription exists
    When I cancel the prescription with reason "Patient declined treatment"
    Then the prescription status should be "CANCELLED"
    And the cancellation reason should be recorded
    And an audit log should record the cancellation

  @status @cancel-partial
  Scenario: Cannot cancel dispensed items
    Given a prescription where some items have been dispensed
    When I try to cancel the prescription
    Then I should see "Cannot cancel prescription with dispensed items"
    And only undispensed items can be cancelled individually

  # ============================================
  # PRESCRIPTION QUEUE (PHARMACY VIEW)
  # ============================================

  @queue @display
  Scenario: View prescription queue
    Given I am logged in as a pharmacist
    And I am on the pharmacy prescription queue
    Then I should see pending prescriptions showing:
      | field             | description                  |
      | Patient Name      | Patient's full name          |
      | MRN               | Medical Record Number        |
      | Prescriber        | Doctor who wrote prescription|
      | Items Count       | Number of items              |
      | Time in Queue     | How long waiting             |
      | Priority          | Normal/Urgent                |

  @queue @sort
  Scenario: Queue sorted by priority and time
    Given prescriptions in the queue:
      | patient | priority | wait_time |
      | John    | URGENT   | 5 min     |
      | Mary    | NORMAL   | 30 min    |
      | Peter   | URGENT   | 15 min    |
    Then the queue should be sorted:
      | position | patient | reason                     |
      | 1        | Peter   | Urgent, longest wait       |
      | 2        | John    | Urgent, recent             |
      | 3        | Mary    | Normal priority            |

  @queue @filter
  Scenario Outline: Filter prescription queue
    Given prescriptions with various statuses exist
    When I filter the queue by status "<status>"
    Then I should only see prescriptions with status "<status>"

    Examples:
      | status    |
      | PENDING   |
      | PARTIAL   |
      | DISPENSED |
      | CANCELLED |

  @queue @search
  Scenario: Search prescriptions by patient
    When I search for patient "Jane Wanjiku"
    Then I should see all prescriptions for that patient
    And results should include prescription history

  # ============================================
  # PRESCRIPTION ITEMS MANAGEMENT
  # ============================================

  @items @add
  Scenario: Add item to existing prescription
    Given a pending prescription with 1 item
    When I add another item:
      | drug        | quantity | dosage    | frequency |
      | Vitamin C   | 30       | 1 tablet  | Once daily|
    Then the prescription should have 2 items
    And the new item should have status "PENDING"

  @items @remove
  Scenario: Remove item from prescription
    Given a pending prescription with 2 items
    When I remove one item with reason "Out of stock"
    Then the prescription should have 1 item
    And the removal should be logged

  @items @modify
  Scenario: Modify prescription item quantity
    Given a pending prescription item for 24 tablets
    When I modify the quantity to 12 tablets
    And I provide reason "Patient can only afford partial"
    Then the quantity should be updated to 12
    And modification history should be recorded

  @items @substitution
  Scenario: Allow generic substitution
    Given a prescription item with "is_substitutable" set to true
    When the pharmacist selects a generic equivalent
    Then the substitution should be allowed
    And the original prescribed drug should be documented
    And the dispensed generic should be recorded

  @items @no-substitution
  Scenario: Block substitution when not allowed
    Given a prescription item with "is_substitutable" set to false
    When the pharmacist tries to substitute
    Then substitution should be blocked
    And message should show "Doctor specified no substitution"

  # ============================================
  # CONTROLLED DRUG PRESCRIPTIONS
  # ============================================

  @controlled @validation
  Scenario: Controlled drug prescription requirements
    Given I am prescribing a controlled drug "Morphine"
    Then I should be required to enter:
      | field                | required |
      | Quantity (words)     | Yes      |
      | Patient ID Number    | Yes      |
      | Diagnosis/Indication | Yes      |
      | Duration             | Yes      |
    And the prescription should be flagged as "Controlled Drug"

  @controlled @verification
  Scenario: Controlled drug requires dual verification
    Given a prescription for controlled drug exists
    When a pharmacist prepares the dispensing
    Then a second pharmacist verification should be required
    And both pharmacist IDs should be recorded

  @controlled @limits
  Scenario: Enforce controlled drug quantity limits
    Given I am prescribing "Tramadol"
    When I enter quantity exceeding 30-day supply
    Then I should see a warning about quantity limits
    And I should be required to provide justification

  # ============================================
  # PRESCRIPTION HISTORY & AUDIT
  # ============================================

  @history @patient
  Scenario: View patient prescription history
    Given patient "Jane Wanjiku" has previous prescriptions
    When I view prescription history
    Then I should see all past prescriptions
    And each should show:
      | field        | description              |
      | Date         | When prescribed          |
      | Prescriber   | Who prescribed           |
      | Items        | Drugs prescribed         |
      | Status       | Current status           |
      | Dispensed    | What was dispensed       |

  @history @refill
  Scenario: Create prescription from history
    Given a previous prescription exists for the patient
    When I click "Refill" on a past prescription
    Then a new prescription should be created with same items
    And I should be able to modify before saving
    And the original prescription should be linked

  @audit
  Scenario: Prescription actions are audited
    Given prescription operations are performed
    Then audit log should record:
      | action                | logged |
      | Prescription created  | Yes    |
      | Item added            | Yes    |
      | Item modified         | Yes    |
      | Item cancelled        | Yes    |
      | Prescription dispensed| Yes    |
      | Allergy override      | Yes    |

  # ============================================
  # OFFLINE SUPPORT
  # ============================================

  @offline @create
  Scenario: Create prescription offline
    Given I am offline
    When I create a prescription
    Then the prescription should be saved locally
    And status should show "Pending Sync"
    And a sync indicator should be visible

  @offline @sync
  Scenario: Sync prescriptions when online
    Given prescriptions were created offline
    When I come back online
    Then prescriptions should sync to server
    And pharmacy queue should be updated
    And local pending status should clear

  # ============================================
  # CLINICAL NOTES & INSTRUCTIONS
  # ============================================

  @notes
  Scenario: Add clinical notes for pharmacist
    Given I am creating a prescription
    When I add clinical notes "Patient has difficulty swallowing - consider liquid form"
    Then the notes should be visible to the pharmacist
    And notes should be highlighted on the dispensing screen

  @instructions @special
  Scenario: Add special instructions
    Given I am prescribing "Insulin"
    When I add special instructions:
      | instruction                              |
      | Store in refrigerator                    |
      | Inject subcutaneously                    |
      | Rotate injection sites                   |
    Then instructions should be attached to the prescription
    And instructions should print on patient label

  # ============================================
  # PERMISSIONS
  # ============================================

  @permissions @prescribe
  Scenario: Only authorized users can prescribe
    Given I am logged in as a nurse without prescribing rights
    When I try to create a prescription
    Then I should see "You do not have permission to prescribe"
    And the prescription form should be disabled

  @permissions @view
  Scenario: Pharmacist can view but not create prescriptions
    Given I am logged in as a pharmacist
    When I view a prescription
    Then I should see full prescription details
    And I should NOT see "Create Prescription" option
    But I should see "Dispense" option
