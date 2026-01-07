@pharmacy @dispensing
Feature: Drug Dispensing Workflow
  As a pharmacist
  I want to dispense medications to patients
  So that patients receive their prescribed treatments with proper documentation and FEFO compliance

  Background:
    Given I am logged in as a user with "pharmacy.add_dispensing" permission
    And I am on the pharmacy dispensing screen

  # ============================================
  # DISPENSING FROM PRESCRIPTION
  # ============================================

  @smoke @dispense-prescription
  Scenario: Dispense all items from a prescription
    Given a prescription for patient "Jane Wanjiku" with items:
      | drug                    | quantity | status  |
      | Artemether-Lumefantrine | 24       | PENDING |
      | Paracetamol 500mg       | 20       | PENDING |
    And sufficient stock exists for both drugs
    When I select the prescription to dispense
    And I confirm all items for dispensing
    And I click "Dispense All"
    Then all items should be marked as dispensed
    And the prescription status should change to "DISPENSED"
    And stock should be deducted from appropriate batches
    And an audit log should record the dispensing

  @smoke @dispense-partial
  Scenario: Partially dispense a prescription
    Given a prescription with items:
      | drug                    | quantity | available_stock |
      | Artemether-Lumefantrine | 24       | 24              |
      | Metformin 500mg         | 30       | 10              |
    When I dispense the available items:
      | drug                    | dispense_qty |
      | Artemether-Lumefantrine | 24           |
      | Metformin 500mg         | 10           |
    Then prescription status should be "PARTIAL"
    And Metformin should show 10/30 dispensed
    And patient should be informed about partial fulfillment

  @dispense @batch-selection
  Scenario: FEFO batch auto-selection
    Given a drug "Paracetamol" with batches:
      | batch        | quantity | expiry_date | days_to_expiry |
      | PCM-2024-001 | 50       | 2026-02-15  | 39             |
      | PCM-2025-001 | 500      | 2027-06-30  | 539            |
    When I dispense 30 tablets of Paracetamol
    Then batch "PCM-2024-001" should be automatically selected (earliest expiry)
    And 30 units should be deducted from PCM-2024-001

  @dispense @batch-manual
  Scenario: Manually select batch for dispensing
    Given multiple valid batches exist for a drug
    When I click "Change Batch"
    Then I should see available batches listed
    When I select a different batch
    Then the selected batch should be used for dispensing
    And the manual selection should be logged

  @dispense @multi-batch
  Scenario: Dispense from multiple batches
    Given a prescription for 100 tablets of Paracetamol
    And available batches:
      | batch        | quantity |
      | PCM-2024-001 | 40       |
      | PCM-2024-002 | 30       |
      | PCM-2025-001 | 500      |
    When I dispense 100 tablets
    Then the system should use batches in FEFO order:
      | batch        | dispensed |
      | PCM-2024-001 | 40        |
      | PCM-2024-002 | 30        |
      | PCM-2025-001 | 30        |
    And 3 dispensing records should be created

  # ============================================
  # DIRECT DISPENSING (OTC)
  # ============================================

  @otc @direct
  Scenario: Dispense OTC drug without prescription
    Given a drug "Paracetamol 500mg" with schedule "OTC"
    And sufficient stock exists
    When I click "Direct Dispense"
    And I search and select patient "John Kamau"
    And I select drug "Paracetamol 500mg"
    And I enter quantity 20
    And I click "Dispense"
    Then the drug should be dispensed without prescription
    And a dispensing record should be created
    And stock should be deducted

  @otc @blocked
  Scenario: Block direct dispense for prescription-only drugs
    Given a drug "Amoxicillin 500mg" with schedule "POM"
    When I try to direct dispense without prescription
    Then I should see "This drug requires a prescription"
    And direct dispensing should be blocked

  @otc @quantity-limit
  Scenario: Enforce OTC quantity limits
    Given OTC quantity limit is set to 30 tablets
    When I try to direct dispense 50 tablets of OTC drug
    Then I should see a warning "Quantity exceeds recommended OTC limit"
    And I should be required to acknowledge before proceeding

  # ============================================
  # DISPENSING VALIDATION
  # ============================================

  @validation @stock
  Scenario: Prevent dispensing with insufficient stock
    Given a prescription for 100 tablets
    And only 50 tablets are available in stock
    When I try to dispense 100 tablets
    Then I should see "Insufficient stock. Available: 50"
    And I should be offered to dispense partial quantity

  @validation @expired
  Scenario: Prevent dispensing expired stock
    Given a batch has expired
    When I try to select the expired batch
    Then the batch should not be available for selection
    And I should see "This batch has expired"

  @validation @allergy
  Scenario: Display allergy alert during dispensing
    Given patient has allergy to "Penicillin"
    And the prescription includes "Amoxicillin"
    When I view the prescription for dispensing
    Then I should see a prominent allergy alert
    And the alert should require acknowledgment before proceeding

  @validation @double-dispense
  Scenario: Prevent double dispensing
    Given a prescription item has already been fully dispensed
    When I try to dispense the same item again
    Then I should see "This item has already been dispensed"
    And further dispensing should be blocked

  # ============================================
  # CONTROLLED DRUG DISPENSING
  # ============================================

  @controlled @dual-verification
  Scenario: Controlled drug requires dual pharmacist verification
    Given a prescription for "Morphine Injection"
    And "Morphine" is a controlled drug requiring verification
    When I prepare the dispensing
    Then I should see "Second pharmacist verification required"
    When a second pharmacist enters their credentials
    And they confirm the dispensing
    Then the dispensing should be completed
    And both pharmacists should be recorded

  @controlled @verification-different
  Scenario: Verifying pharmacist must be different from dispenser
    Given I am dispensing a controlled drug
    When I try to verify my own dispensing
    Then I should see "Cannot verify your own dispensing"
    And a different pharmacist must verify

  @controlled @register
  Scenario: Record controlled drug in register
    Given I dispense a controlled drug
    Then an entry should be created in the controlled drug register:
      | field              | recorded |
      | Date/Time          | Yes      |
      | Patient Name       | Yes      |
      | Patient ID         | Yes      |
      | Drug Name          | Yes      |
      | Quantity           | Yes      |
      | Batch Number       | Yes      |
      | Dispensing Pharm   | Yes      |
      | Verifying Pharm    | Yes      |
      | Running Balance    | Yes      |

  @controlled @balance
  Scenario: Update controlled drug running balance
    Given controlled drug has running balance of 100
    When I dispense 10 units
    Then the running balance should update to 90
    And discrepancies should be flagged

  # ============================================
  # PATIENT COUNSELING
  # ============================================

  @counseling
  Scenario: Record patient counseling
    Given I am completing a dispensing
    When I check "Patient counseled on medication usage"
    And I enter counseling notes "Explained dosage and side effects"
    Then the counseling should be recorded
    And the dispensing record should show "Counseling: Yes"

  @counseling @mandatory
  Scenario: Counseling mandatory for certain drugs
    Given I am dispensing "Metformin" (diabetes medication)
    Then I should be required to document counseling
    And I should not be able to complete without confirming counseling

  @counseling @instructions
  Scenario: Print medication instructions
    Given I am dispensing medications
    When I click "Print Instructions"
    Then patient medication information should be printed:
      | content              |
      | Drug name and dosage |
      | Administration route |
      | Frequency            |
      | Duration             |
      | Special instructions |
      | Side effects         |
      | Storage requirements |

  # ============================================
  # PRICING & BILLING
  # ============================================

  @pricing @calculation
  Scenario: Calculate dispensing total
    Given I am dispensing:
      | drug        | quantity | unit_price |
      | Drug A      | 20       | KES 10.00  |
      | Drug B      | 30       | KES 5.00   |
    Then the total should be calculated as:
      | line_item | calculation | total      |
      | Drug A    | 20 × 10.00  | KES 200.00 |
      | Drug B    | 30 × 5.00   | KES 150.00 |
      | Total     |             | KES 350.00 |

  @pricing @discount
  Scenario: Apply discount to dispensing
    Given total dispensing amount is KES 500.00
    When I apply a 10% discount
    Then the discount should be KES 50.00
    And the final amount should be KES 450.00
    And the discount should be logged with reason

  @billing @integration
  Scenario: Dispensing creates billing line items
    Given a prescription is linked to an encounter
    When I complete the dispensing
    Then billing line items should be created for each drug
    And the patient invoice should be updated
    And billing should reflect actual dispensed quantities

  # ============================================
  # RETURNS PROCESSING
  # ============================================

  @returns
  Scenario: Process medication return
    Given a previous dispensing record exists
    And patient returns 10 tablets with reason "Adverse reaction"
    When I process the return:
      | field    | value                 |
      | Quantity | 10                    |
      | Reason   | Adverse reaction      |
      | Batch    | Original batch        |
    Then stock should be restored to the batch
    And return should be documented
    And billing adjustment should be created

  @returns @quarantine
  Scenario: Returned medications go to quarantine
    Given medications are returned
    When I select "Quarantine returned stock"
    Then returned items should not be immediately available
    And they should be flagged for pharmacist review

  @returns @restriction
  Scenario: Restrict returns for controlled drugs
    Given a controlled drug was dispensed
    When I try to process a return
    Then I should see "Controlled drug returns require supervisor approval"
    And enhanced documentation should be required

  @returns @validation
  Scenario: Cannot return more than dispensed
    Given 20 tablets were dispensed
    When I try to return 25 tablets
    Then I should see "Return quantity exceeds dispensed amount"
    And the return should be blocked

  # ============================================
  # DISPENSING HISTORY & TRACKING
  # ============================================

  @history @patient
  Scenario: View patient dispensing history
    Given patient "Jane Wanjiku" has received multiple dispensings
    When I view dispensing history for the patient
    Then I should see all past dispensings:
      | field        | displayed |
      | Date         | Yes       |
      | Drug         | Yes       |
      | Quantity     | Yes       |
      | Batch        | Yes       |
      | Pharmacist   | Yes       |
      | Prescription | Yes       |

  @history @batch
  Scenario: View batch dispensing history
    Given batch "PCM-2025-001" has been used for dispensing
    When I view batch history
    Then I should see all dispensings from that batch
    And total dispensed should match batch records

  @tracking @audit
  Scenario: Full dispensing audit trail
    Given a dispensing is completed
    Then audit log should record:
      | event                  | logged |
      | Dispensing initiated   | Yes    |
      | Batch selected         | Yes    |
      | Quantity confirmed     | Yes    |
      | Stock deducted         | Yes    |
      | Counseling recorded    | Yes    |
      | Dispensing completed   | Yes    |

  # ============================================
  # DISPENSING QUEUE
  # ============================================

  @queue @display
  Scenario: View dispensing queue
    Given multiple prescriptions are pending
    When I view the dispensing queue
    Then I should see prescriptions sorted by:
      | priority | description                      |
      | 1        | Emergency prescriptions          |
      | 2        | Urgent prescriptions             |
      | 3        | Normal prescriptions (by time)   |

  @queue @status
  Scenario Outline: Queue item status indicators
    Given a prescription with status "<status>"
    Then the queue item should show indicator "<indicator>"

    Examples:
      | status    | indicator                    |
      | PENDING   | 🔵 Ready to dispense         |
      | PARTIAL   | 🟡 Partially dispensed       |
      | DISPENSED | ✅ Completed                 |
      | CANCELLED | ❌ Cancelled                 |

  @queue @workload
  Scenario: Display pharmacist workload
    Given I am logged in as a pharmacist
    When I view my workload
    Then I should see:
      | metric              | displayed |
      | Pending items       | Yes       |
      | Dispensed today     | Yes       |
      | Average wait time   | Yes       |

  # ============================================
  # OFFLINE DISPENSING
  # ============================================

  @offline @dispense
  Scenario: Dispense while offline
    Given I am offline
    And local stock cache is available
    When I complete a dispensing
    Then the dispensing should be saved locally
    And local stock should be updated
    And sync indicator should show "Pending"

  @offline @sync
  Scenario: Sync offline dispensings
    Given dispensings were completed offline
    When I come back online
    Then offline dispensings should sync to server
    And server stock should be updated
    And any conflicts should be flagged

  @offline @conflict
  Scenario: Handle sync conflicts
    Given I dispensed from batch "PCM-001" offline
    And another user dispensed from same batch online
    When I sync
    Then I should see a stock conflict alert
    And I should be able to review and resolve

  # ============================================
  # PRINT & LABELS
  # ============================================

  @print @label
  Scenario: Print medication label
    Given I am completing a dispensing
    When I click "Print Label"
    Then a medication label should print with:
      | field              |
      | Patient Name       |
      | MRN                |
      | Drug Name          |
      | Dosage Instructions|
      | Quantity           |
      | Date Dispensed     |
      | Expiry Date        |
      | Pharmacy Details   |

  @print @receipt
  Scenario: Print dispensing receipt
    Given dispensing is complete
    When I click "Print Receipt"
    Then receipt should show:
      | field            |
      | Patient details  |
      | Items dispensed  |
      | Quantities       |
      | Prices           |
      | Total amount     |
      | Pharmacist name  |
      | Date/Time        |

  # ============================================
  # PERMISSIONS & SECURITY
  # ============================================

  @permissions
  Scenario: Only pharmacists can dispense
    Given I am logged in as a nurse
    When I try to access dispensing screen
    Then I should see "You do not have permission to dispense medications"
    And dispensing functions should be disabled

  @permissions @controlled
  Scenario: Controlled drug dispensing requires special permission
    Given I have basic pharmacy permissions
    But I do not have "pharmacy.dispense_controlled" permission
    When I try to dispense a controlled drug
    Then I should see "Additional authorization required for controlled drugs"
    And the dispensing should be blocked

  @security @verification
  Scenario: Require re-authentication for high-value dispensing
    Given dispensing value exceeds KES 10,000
    When I try to complete the dispensing
    Then I should be prompted to re-enter my password
    And the dispensing should only proceed after verification
