@pharmacy @stock @inventory
Feature: Stock Inventory Management
  As a pharmacist or stock controller
  I want to manage drug inventory with batch tracking
  So that I can maintain accurate stock levels and ensure FEFO (First Expiry First Out) compliance

  Background:
    Given I am logged in as a user with "pharmacy.view_stockbatch" permission
    And I am on the stock inventory page

  # ============================================
  # STOCK OVERVIEW & DISPLAY
  # ============================================

  @smoke @overview
  Scenario: View stock inventory overview
    When I view the stock inventory
    Then I should see a summary showing:
      | metric               | description                    |
      | Total Items          | Count of unique drugs in stock |
      | Total Value          | Sum of stock value             |
      | Low Stock Items      | Count of items below reorder   |
      | Expiring Soon        | Count expiring within 90 days  |
      | Expired Items        | Count of expired stock         |

  @display @batches
  Scenario: View stock batches for a drug
    Given a drug "Paracetamol 500mg" has the following batches:
      | batch_number | quantity_available | expiry_date | status    |
      | PCM-2025-001 | 500                | 2027-06-30  | AVAILABLE |
      | PCM-2024-005 | 100                | 2026-03-15  | AVAILABLE |
      | PCM-2024-002 | 30                 | 2026-01-20  | LOW       |
    When I view stock for "Paracetamol 500mg"
    Then I should see 3 batches
    And total available quantity should show 630 units
    And batches should be ordered by expiry date (FEFO)

  @display @batch-details
  Scenario: View batch details
    Given a stock batch "AMX-2025-001" exists
    When I click on the batch to view details
    Then I should see:
      | field              | value                |
      | Batch Number       | AMX-2025-001         |
      | Drug               | Amoxicillin 500mg    |
      | Quantity Received  | 1000                 |
      | Quantity Available | 750                  |
      | Quantity Dispensed | 200                  |
      | Quantity Damaged   | 50                   |
      | Expiry Date        | 2027-03-15           |
      | Days to Expiry     | 432 days             |
      | Cost Price         | KES 5.00             |
      | Selling Price      | KES 8.00             |
      | Supplier           | Kenya Pharma Ltd     |
      | Received Date      | 2025-06-01           |
      | Received By        | John Pharmacist      |
      | Location           | Shelf A-12           |

  # ============================================
  # FEFO (First Expiry First Out)
  # ============================================

  @smoke @fefo
  Scenario: Batches are ordered by FEFO for dispensing
    Given a drug "Artemether-Lumefantrine" has batches:
      | batch_number | quantity | expiry_date |
      | AL-2025-003  | 100      | 2026-06-30  |
      | AL-2024-001  | 50       | 2026-02-28  |
      | AL-2025-001  | 200      | 2026-09-15  |
    When I view dispensing options for this drug
    Then batches should be suggested in order:
      | position | batch       | expiry_date |
      | 1        | AL-2024-001 | 2026-02-28  |
      | 2        | AL-2025-003 | 2026-06-30  |
      | 3        | AL-2025-001 | 2026-09-15  |

  @fefo @expiry-indicator
  Scenario Outline: Display expiry status indicator
    Given a batch with expiry date "<days_until_expiry>" days from today
    Then the batch should show status indicator "<indicator>"
    And the indicator color should be "<color>"

    Examples:
      | days_until_expiry | indicator        | color  |
      | 365               | Valid            | green  |
      | 85                | Expiring (3 mo)  | yellow |
      | 45                | Expiring (2 mo)  | orange |
      | 25                | Expiring (1 mo)  | red    |
      | -5                | EXPIRED          | red    |

  @fefo @exclude-expired
  Scenario: Expired batches excluded from dispensing
    Given a drug has both expired and valid batches
    When I view dispensing options
    Then expired batches should not appear in the selection list
    And only valid batches should be available for dispensing

  # ============================================
  # STOCK RECEIVING
  # ============================================

  @smoke @receive
  Scenario: Receive new stock batch
    Given I am logged in as a user with "pharmacy.add_stockbatch" permission
    When I click "Receive Stock"
    And I fill in the stock receipt form:
      | field             | value            |
      | Drug              | Paracetamol 500mg|
      | Batch Number      | PCM-2026-001     |
      | Quantity Received | 500              |
      | Expiry Date       | 2028-06-30       |
      | Cost Price        | KES 4.50         |
      | Selling Price     | KES 8.00         |
      | Supplier          | Pharma Supplies  |
      | Purchase Order    | PO-2026-0123     |
      | Storage Location  | Shelf B-05       |
    And I click "Save"
    Then the new batch should be created with status "AVAILABLE"
    And the stock count for Paracetamol should increase by 500
    And I should see "Stock received successfully"
    And an audit log should record the stock receipt

  @receive @validation
  Scenario: Cannot receive stock with past expiry date
    Given I am receiving a new stock batch
    When I enter an expiry date in the past
    And I try to save
    Then I should see an error "Expiry date cannot be in the past for new stock"
    And the batch should not be created

  @receive @validation
  Scenario: Batch number must be unique per drug
    Given a batch "AMX-2025-001" exists for drug "Amoxicillin"
    When I try to receive another batch with number "AMX-2025-001" for "Amoxicillin"
    Then I should see an error "Batch number already exists for this drug"

  @receive @barcode
  Scenario: Receive stock with barcode scanning
    Given I am on the stock receiving page
    When I scan barcode "5012345678901"
    Then the drug should be auto-identified
    And the batch number field should be pre-filled if available

  # ============================================
  # STOCK STATUS & LEVELS
  # ============================================

  @status @low-stock
  Scenario: Identify low stock items
    Given a drug "Amoxicillin" has:
      | current_stock | reorder_level |
      | 45            | 100           |
    When I view the inventory
    Then "Amoxicillin" should display a "Low Stock" badge in yellow
    And it should appear in the "Low Stock" filter

  @status @out-of-stock
  Scenario: Identify out of stock items
    Given a drug "Metformin" has current stock of 0
    When I view the inventory
    Then "Metformin" should display an "Out of Stock" badge in red
    And it should appear in the "Out of Stock" filter

  @status @filter
  Scenario Outline: Filter stock by status
    Given stock items exist with various statuses
    When I filter by status "<status>"
    Then I should only see items with status "<status>"

    Examples:
      | status       |
      | AVAILABLE    |
      | LOW          |
      | OUT_OF_STOCK |
      | EXPIRED      |
      | QUARANTINE   |

  # ============================================
  # STOCK ADJUSTMENTS
  # ============================================

  @adjustment @damage
  Scenario: Record damaged stock
    Given I am logged in as a user with "pharmacy.add_stockadjustment" permission
    And a batch "PCM-2025-001" has 500 units available
    When I record a stock adjustment:
      | field           | value                        |
      | Adjustment Type | DAMAGE                       |
      | Quantity        | 20                           |
      | Reason          | Water damage from roof leak  |
    And I save the adjustment
    Then the batch available quantity should decrease to 480
    And the batch damaged quantity should increase to 20
    And an audit log should record the adjustment

  @adjustment @loss
  Scenario: Record stock loss/theft
    Given a batch "AMX-2025-001" has 300 units available
    When I record a stock adjustment:
      | field           | value                          |
      | Adjustment Type | LOSS                           |
      | Quantity        | 15                             |
      | Reason          | Discrepancy found during count |
    Then the available quantity should decrease to 285
    And the adjustment should be flagged for supervisor review

  @adjustment @expired
  Scenario: Mark batch as expired
    Given a batch "VIT-2024-001" has 100 units with past expiry date
    When I mark the batch as expired
    Then all 100 units should be moved to expired quantity
    And the batch status should change to "EXPIRED"
    And the batch should not be available for dispensing

  @adjustment @return-supplier
  Scenario: Return stock to supplier
    Given a batch "DEFECT-001" has 50 units
    When I record a stock adjustment:
      | field            | value                       |
      | Adjustment Type  | RETURN_SUPPLIER             |
      | Quantity         | 50                          |
      | Reason           | Manufacturer recall         |
      | Reference Number | RET-2026-0045               |
    Then the available quantity should decrease to 0
    And the reference number should be recorded
    And documentation should be available for supplier reconciliation

  @adjustment @count-correction
  Scenario: Physical count correction
    Given a batch "PCM-2025-001" system shows 500 units
    And physical count reveals 485 units
    When I record a count correction of -15 units
    And I provide reason "Physical count 2026-01-07"
    Then the system quantity should adjust to 485
    And the variance should be documented

  @adjustment @approval
  Scenario: Large adjustments require approval
    Given I record a stock adjustment of 100 units or more
    When I save the adjustment
    Then the adjustment should be marked "Pending Approval"
    And a notification should be sent to the pharmacy manager
    And the stock should not be adjusted until approved

  # ============================================
  # STOCK VALUE & REPORTS
  # ============================================

  @value @calculation
  Scenario: Calculate stock value for a batch
    Given a batch with:
      | quantity_available | selling_price |
      | 200                | KES 8.00      |
    Then the batch value should display as KES 1,600.00

  @value @total
  Scenario: Calculate total inventory value
    Given multiple batches with values:
      | batch   | value      |
      | Batch 1 | KES 5,000  |
      | Batch 2 | KES 3,500  |
      | Batch 3 | KES 8,200  |
    When I view the inventory summary
    Then total inventory value should show KES 16,700.00

  @report @movement
  Scenario: View stock movement history
    Given a drug "Paracetamol" has had stock movements
    When I view the stock movement report
    Then I should see entries for:
      | movement_type | description                |
      | RECEIVED      | Stock received             |
      | DISPENSED     | Dispensed to patient       |
      | DAMAGED       | Damaged stock recorded     |
      | ADJUSTMENT    | Physical count correction  |

  @report @expiry
  Scenario: Generate expiry report
    Given stock with various expiry dates exists
    When I generate an expiry report
    Then I should see batches grouped by:
      | category           | description              |
      | Expired            | Past expiry date         |
      | Expiring (30 days) | Expiring within 30 days  |
      | Expiring (90 days) | Expiring within 90 days  |

  # ============================================
  # STOCK QUARANTINE & RECALL
  # ============================================

  @quarantine
  Scenario: Place batch in quarantine
    Given a batch "SUSPECT-001" has 200 units available
    When I place the batch in quarantine with reason "Quality investigation"
    Then the batch status should change to "QUARANTINE"
    And the batch should not be available for dispensing
    And a quarantine notice should be recorded

  @recall
  Scenario: Process product recall
    Given a manufacturer recall notice for batch prefix "RECALL-"
    And batches exist:
      | batch_number | drug        | quantity |
      | RECALL-001   | Drug A      | 100      |
      | RECALL-002   | Drug A      | 150      |
      | OTHER-001    | Drug A      | 200      |
    When I process the recall
    Then batches "RECALL-001" and "RECALL-002" should be marked "RECALLED"
    And batch "OTHER-001" should remain "AVAILABLE"
    And 250 total units should be affected by recall
    And recall documentation should be generated

  # ============================================
  # OFFLINE SUPPORT
  # ============================================

  @offline @sync
  Scenario: Stock operations sync when online
    Given I received stock while offline
    When I come back online
    Then pending stock receipts should sync to server
    And stock adjustments should sync
    And inventory should reflect all offline changes

  @offline @conflict
  Scenario: Handle stock sync conflict
    Given I dispensed from batch "PCM-2025-001" while offline
    And another user dispensed from the same batch
    When I sync
    Then I should see a stock conflict notification
    And I should be able to review and resolve the conflict

  # ============================================
  # PERMISSIONS
  # ============================================

  @permissions
  Scenario: View-only user cannot receive stock
    Given I am logged in as a user with only "pharmacy.view_stockbatch" permission
    When I view the stock inventory
    Then I should NOT see the "Receive Stock" button
    And I should NOT see stock adjustment options

  @permissions
  Scenario: Stock controller can manage inventory
    Given I am logged in as a user with "pharmacy.add_stockbatch" and "pharmacy.add_stockadjustment" permissions
    When I view the stock inventory
    Then I should see the "Receive Stock" button
    And I should see stock adjustment options
    And I should be able to record adjustments

  # ============================================
  # SUPPLIER TRACKING
  # ============================================

  @supplier
  Scenario: Track stock by supplier
    Given batches from different suppliers exist:
      | supplier           | total_stock |
      | Kenya Pharma Ltd   | 5000        |
      | Medical Supplies   | 3000        |
      | Generic Drugs Co   | 2500        |
    When I filter stock by supplier "Kenya Pharma Ltd"
    Then I should see only batches from that supplier
    And total should show 5000 units

  @supplier @report
  Scenario: Generate supplier report
    When I generate a supplier stock report
    Then I should see stock breakdown by supplier
    And total value per supplier should be calculated
