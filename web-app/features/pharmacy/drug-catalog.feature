@pharmacy @drug-catalog
Feature: Drug Catalog Management
  As a pharmacist or pharmacy administrator
  I want to manage the drug catalog
  So that the facility has an accurate list of available medications aligned with Kenya Essential Medicines List (KEML)

  Background:
    Given I am logged in as a user with "pharmacy.view_drug" permission
    And I am on the drug catalog page

  # ============================================
  # DRUG SEARCH & DISPLAY
  # ============================================

  @smoke @search
  Scenario: Search drugs by generic name
    Given the drug catalog contains the following drugs:
      | generic_name              | strength | form    | category     |
      | Paracetamol               | 500mg    | TABLET  | ANALGESIC    |
      | Amoxicillin               | 500mg    | CAPSULE | ANTIBIOTIC   |
      | Artemether-Lumefantrine   | 20/120mg | TABLET  | ANTIMALARIAL |
    When I search for "paracetamol"
    Then I should see 1 result
    And the result should display "Paracetamol 500mg Tablet"

  @search
  Scenario: Search drugs by brand name
    Given a drug "Paracetamol" with brand names "Panadol, Calpol, Hedex"
    When I search for "panadol"
    Then I should see the drug "Paracetamol 500mg Tablet" in the results

  @search @partial
  Scenario: Search drugs with partial match
    Given the drug catalog contains "Artemether-Lumefantrine"
    When I search for "artem"
    Then I should see "Artemether-Lumefantrine" in the results

  @filter
  Scenario Outline: Filter drugs by category
    Given the drug catalog has drugs in multiple categories
    When I filter by category "<category>"
    Then I should only see drugs with category "<category>"

    Examples:
      | category        |
      | ANALGESIC       |
      | ANTIBIOTIC      |
      | ANTIMALARIAL    |
      | ANTIRETROVIRAL  |
      | ANTIHYPERTENSIVE|
      | ANTIDIABETIC    |

  @filter
  Scenario Outline: Filter drugs by form
    Given the drug catalog has drugs in multiple forms
    When I filter by form "<form>"
    Then I should only see drugs with form "<form>"

    Examples:
      | form       |
      | TABLET     |
      | CAPSULE    |
      | SYRUP      |
      | INJECTION  |
      | CREAM      |
      | INHALER    |

  @filter @schedule
  Scenario Outline: Filter drugs by schedule
    Given the drug catalog has drugs with different schedules
    When I filter by schedule "<schedule>"
    Then I should only see drugs with schedule "<schedule>"
    And "<description>" should be displayed

    Examples:
      | schedule | description              |
      | OTC      | Over The Counter         |
      | POM      | Prescription Only        |
      | P        | Pharmacy Only            |
      | CD       | Controlled Drug          |

  @keml
  Scenario: Filter drugs by KEML (Kenya Essential Medicines List)
    Given the drug catalog has essential and non-essential drugs
    When I filter by "Essential Medicines Only"
    Then I should only see drugs marked as KEML essential
    And each drug should display a KEML badge

  # ============================================
  # DRUG DISPLAY & DETAILS
  # ============================================

  @smoke @display
  Scenario: Display drug information card
    Given a drug "Amoxicillin" exists in the catalog
    When I view the drug card
    Then I should see:
      | field            | value                    |
      | Generic Name     | Amoxicillin              |
      | Strength         | 500mg                    |
      | Form             | Capsule                  |
      | Category         | Antibiotic               |
      | Schedule         | POM                      |
      | KEML Code        | 06.02.01                 |
      | Current Stock    | 450 units                |

  @display @stock
  Scenario: Display stock status indicator on drug card
    Given a drug "Paracetamol" with current stock of 45 units
    And the reorder level is 50 units
    When I view the drug card
    Then I should see a "Low Stock" indicator in yellow

  @display @stock
  Scenario: Display out of stock indicator
    Given a drug "Metformin" with current stock of 0 units
    When I view the drug card
    Then I should see an "Out of Stock" indicator in red

  @details
  Scenario: View complete drug details
    Given a drug "Artemether-Lumefantrine" exists
    When I click on the drug to view details
    Then I should see the full drug information:
      | field                | value                              |
      | Code                 | ARTEM20                            |
      | Generic Name         | Artemether-Lumefantrine            |
      | Brand Names          | Coartem, Lumartem                  |
      | Strength             | 20/120mg                           |
      | Form                 | Tablet                             |
      | Category             | Antimalarial                       |
      | Schedule             | POM                                |
      | KEML Code            | 06.05.03                           |
      | NHIF/SHA Code        | MAL-001                            |
      | Reorder Level        | 100                                |
      | Shelf Life           | 36 months                          |
      | Storage Requirements | Store below 30°C                   |
      | Reference Price      | KES 150.00                         |

  @details @batches
  Scenario: View available batches for a drug
    Given a drug "Paracetamol" with multiple batches:
      | batch_number | quantity | expiry_date | status    |
      | PCM-2025-001 | 500      | 2027-06-30  | Available |
      | PCM-2024-005 | 100      | 2026-03-15  | Available |
      | PCM-2024-002 | 50       | 2026-01-30  | Expiring  |
    When I view the drug details
    Then I should see 3 batches listed
    And batches should be ordered by expiry date (earliest first)

  # ============================================
  # DRUG CATALOG MANAGEMENT (Admin)
  # ============================================

  @admin @create
  Scenario: Add new drug to catalog
    Given I am logged in as a user with "pharmacy.add_drug" permission
    When I click "Add New Drug"
    And I fill in the drug information:
      | field           | value                    |
      | Code            | METRO400                 |
      | Generic Name    | Metronidazole            |
      | Brand Names     | Flagyl                   |
      | Strength        | 400mg                    |
      | Form            | TABLET                   |
      | Category        | ANTIBIOTIC               |
      | Schedule        | POM                      |
      | KEML Code       | 06.02.02                 |
      | Reorder Level   | 100                      |
    And I click "Save"
    Then the drug "Metronidazole 400mg Tablet" should be added to the catalog
    And I should see a success message "Drug added successfully"

  @admin @create @validation
  Scenario: Drug code must be unique
    Given a drug with code "PARA500" already exists
    When I try to add a new drug with code "PARA500"
    Then I should see an error "Drug code already exists"
    And the drug should not be created

  @admin @edit
  Scenario: Edit drug information
    Given I am logged in as a user with "pharmacy.change_drug" permission
    And a drug "Paracetamol 500mg" exists
    When I edit the drug and change reorder level to 75
    And I save the changes
    Then the reorder level should be updated to 75
    And I should see "Drug updated successfully"

  @admin @deactivate
  Scenario: Deactivate drug from catalog
    Given I am logged in as a user with "pharmacy.change_drug" permission
    And a drug "Obsolete Drug" exists with active status
    When I click "Deactivate"
    And I confirm the deactivation
    Then the drug should be marked as inactive
    And the drug should not appear in active drug searches
    And existing stock should remain trackable

  # ============================================
  # DRUG SCHEDULE & RESTRICTIONS
  # ============================================

  @schedule @prescription
  Scenario Outline: Prescription requirement based on schedule
    Given a drug with schedule "<schedule>"
    Then the drug should show prescription required as "<requires_prescription>"

    Examples:
      | schedule | requires_prescription |
      | OTC      | No                    |
      | POM      | Yes                   |
      | P        | No                    |
      | CD       | Yes                   |

  @schedule @controlled
  Scenario: Controlled drug identification
    Given a drug is classified as schedule "CD"
    When I view the drug details
    Then I should see a "Controlled Drug" warning badge
    And I should see "Requires dual verification for dispensing"
    And I should see "Register entry required"

  @schedule @narcotic
  Scenario: Narcotic drug special handling
    Given a drug "Morphine" is marked as narcotic
    When I view the drug details
    Then I should see a "Narcotic" warning badge in red
    And I should see enhanced security requirements
    And the drug should appear in narcotic reports

  # ============================================
  # KEML INTEGRATION
  # ============================================

  @keml @display
  Scenario: Display KEML badge for essential medicines
    Given a drug "Amoxicillin" is on the Kenya Essential Medicines List
    When I view the drug card
    Then I should see a "KEML" badge
    And the KEML code "06.02.01" should be displayed

  @keml @search
  Scenario: Search by KEML code
    Given drugs with KEML codes exist:
      | drug        | keml_code |
      | Paracetamol | 02.01     |
      | Amoxicillin | 06.02.01  |
    When I search for KEML code "06.02"
    Then I should see "Amoxicillin" in the results

  # ============================================
  # PAGINATION & PERFORMANCE
  # ============================================

  @pagination
  Scenario: Paginate large drug catalog
    Given the drug catalog has 500 drugs
    When I view the catalog
    Then I should see 20 drugs per page
    And pagination controls should be displayed
    And I should be able to navigate to page 2

  @performance
  Scenario: Drug search returns within acceptable time
    Given the drug catalog has 1000+ drugs
    When I search for "para"
    Then results should display within 1 second

  # ============================================
  # OFFLINE SUPPORT
  # ============================================

  @offline
  Scenario: View drug catalog offline
    Given I have previously loaded the drug catalog online
    And I am now offline
    When I view the drug catalog
    Then I should see cached drug information
    And a banner should indicate "Offline - showing cached data"

  @offline @sync
  Scenario: Sync drug catalog updates when online
    Given new drugs were added to the catalog while I was offline
    When I come back online
    Then the drug catalog should sync automatically
    And I should see newly added drugs

  # ============================================
  # ACCESSIBILITY
  # ============================================

  @a11y
  Scenario: Drug catalog is keyboard navigable
    When I use keyboard navigation in the drug catalog
    Then I should be able to navigate through drug cards using Tab
    And I should be able to select a drug using Enter
    And focus indicators should be visible

  @a11y @screen-reader
  Scenario: Drug information is screen reader accessible
    Given a drug "Paracetamol 500mg" is displayed
    Then the drug card should have proper ARIA labels
    And stock status should be announced to screen readers
    And schedule warnings should be accessible
