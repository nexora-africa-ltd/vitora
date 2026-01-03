@triage @thresholds @admin
Feature: Vital Threshold Configuration
  As a facility administrator
  I want to configure vital sign thresholds
  So that alerts are customized to our facility's clinical protocols

  Background:
    Given I am logged in as a facility administrator
    And I am on the triage settings page

  # ============================================
  # VIEWING THRESHOLDS
  # ============================================

  @smoke @view
  Scenario: View current vital thresholds
    When I navigate to "Settings > Triage > Vital Thresholds"
    Then I should see a table of vital thresholds:
      | Vital Type        | Critical Low | Warning Low | Warning High | Critical High | Active |
      | SpO2 (%)          | 90           | 95          | -            | -             | ✓      |
      | Systolic BP       | 90           | 100         | 140          | 180           | ✓      |
      | Diastolic BP      | -            | -           | 90           | 120           | ✓      |
      | Heart Rate (bpm)  | 40           | 50          | 100          | 150           | ✓      |
      | Temperature (°C)  | 35.0         | 36.0        | 38.5         | 40.0          | ✓      |
      | Respiratory Rate  | 8            | 10          | 24           | 30            | ✓      |

  @defaults
  Scenario: View default threshold values
    When I click "Show Defaults" on a vital threshold
    Then I should see the system default values
    And any customized values should be highlighted

  # ============================================
  # EDITING THRESHOLDS
  # ============================================

  @smoke @edit
  Scenario: Edit a vital threshold
    Given the SpO2 warning_low threshold is 95
    When I click "Edit" on SpO2
    And I change warning_low to 94
    And I click "Save"
    Then the threshold should be updated to 94
    And a success message should appear
    And the change should be audit logged

  @edit @validation
  Scenario: Validate threshold hierarchy
    Given I am editing Heart Rate thresholds
    When I set the following values:
      | field         | value |
      | critical_low  | 50    |
      | warning_low   | 40    |
    Then I should see an error "Critical low (50) must be less than Warning low (40)"
    And the form should not save

  @edit @validation
  Scenario Outline: Validate threshold value ranges
    Given I am editing "<vital>" thresholds
    When I enter "<value>" for "<field>"
    Then I should see validation error "<error>"

    Examples:
      | vital     | field        | value | error                                |
      | SpO2      | warning_low  | 105   | SpO2 must be between 0 and 100       |
      | SpO2      | warning_low  | -5    | SpO2 must be between 0 and 100       |
      | Heart Rate| critical_high| 350   | Heart rate must be below 300 bpm     |
      | Temperature| critical_low| 20    | Temperature must be between 25-45°C  |

  @edit @order
  Scenario: Threshold values must be in correct order
    Given I am editing Temperature thresholds
    When I enter values:
      | critical_low | warning_low | warning_high | critical_high |
      | 35.0         | 36.0        | 38.5         | 37.0          |
    Then I should see an error "Warning high (38.5) must be less than Critical high (37.0)"

  @edit @optional
  Scenario: Some thresholds can be left empty
    Given I am editing SpO2 thresholds
    When I leave critical_high empty
    And I save the threshold
    Then the save should succeed
    And high values for SpO2 should not trigger alerts

  # ============================================
  # RESET & DEFAULTS
  # ============================================

  @reset
  Scenario: Reset threshold to system default
    Given I have customized SpO2 warning_low to 94
    When I click "Reset to Default" on SpO2
    Then I should see a confirmation dialog:
      """
      Reset SpO2 thresholds to system defaults?
      Current: Warning Low = 94
      Default: Warning Low = 95
      """
    When I confirm the reset
    Then warning_low should be reset to 95
    And the change should be audit logged

  @reset-all
  Scenario: Reset all thresholds to defaults
    Given multiple thresholds have been customized
    When I click "Reset All to Defaults"
    And I confirm the action
    Then all thresholds should be reset to system defaults
    And a summary of changes should be shown

  # ============================================
  # ACTIVATION & DEACTIVATION
  # ============================================

  @deactivate
  Scenario: Deactivate a vital threshold
    Given Respiratory Rate threshold is active
    When I toggle the "Active" switch off for Respiratory Rate
    Then the threshold should be deactivated
    And Respiratory Rate should not trigger alerts
    And a warning should appear:
      """
      ⚠️ Warning: Respiratory rate will not generate alerts when deactivated
      """

  @activate
  Scenario: Reactivate a vital threshold
    Given Respiratory Rate threshold is inactive
    When I toggle the "Active" switch on
    Then the threshold should be reactivated
    And Respiratory Rate should generate alerts again

  # ============================================
  # PEDIATRIC & SPECIAL THRESHOLDS
  # ============================================

  @pediatric
  Scenario: Configure age-specific thresholds (if enabled)
    Given pediatric-specific thresholds are enabled
    When I view the threshold configuration
    Then I should see threshold sets for:
      | age_group        |
      | Adult (>12 years)|
      | Pediatric (1-12) |
      | Infant (<1 year) |
    And I can configure each separately

  @pregnancy
  Scenario: Configure pregnancy-specific thresholds (if enabled)
    Given pregnancy thresholds are enabled
    When I view the threshold configuration
    Then I should see an option for "Pregnancy Thresholds"
    With adjusted normal ranges

  # ============================================
  # IMPORT & EXPORT
  # ============================================

  @export
  Scenario: Export threshold configuration
    When I click "Export Configuration"
    Then a JSON file should be downloaded containing:
      """
      {
        "facility": "Demo Health Facility",
        "exported_at": "2026-01-03T10:00:00Z",
        "thresholds": {
          "SPO2": {
            "critical_low": 90,
            "warning_low": 95,
            "is_active": true
          },
          ...
        }
      }
      """

  @import
  Scenario: Import threshold configuration
    Given I have a valid threshold configuration JSON file
    When I click "Import Configuration"
    And I select the JSON file
    Then I should see a preview of changes
    When I confirm the import
    Then all thresholds should be updated
    And changes should be audit logged

  @import @validation
  Scenario: Validate imported configuration
    Given I have an invalid threshold configuration file
    When I try to import it
    Then I should see validation errors
    And the import should be rejected

  # ============================================
  # PREVIEW & TESTING
  # ============================================

  @preview
  Scenario: Preview alert generation with test values
    Given I am on the threshold configuration page
    When I click "Test Thresholds"
    Then I should see a test form where I can enter:
      | vital       | test_value |
      | SpO2        | 91         |
      | Heart Rate  | 48         |
    And see what alerts would be generated:
      | alert type | message                           |
      | WARNING    | Low SpO2 (91%) - below 95%        |
      | WARNING    | Bradycardia (48 bpm) - below 50   |

  # ============================================
  # AUDIT & HISTORY
  # ============================================

  @audit
  Scenario: View threshold change history
    When I click "View History" on SpO2 thresholds
    Then I should see a history of changes:
      | date       | user         | change                        |
      | 2026-01-03 | Admin John   | warning_low: 95 → 94          |
      | 2025-12-15 | Admin Mary   | Created with default values   |

  @audit @all
  Scenario: View all threshold audit logs
    When I click "Audit Log" in the settings header
    Then I should see all threshold changes across all vitals
    With filters for date range and user

  # ============================================
  # PERMISSIONS
  # ============================================

  @permissions @view
  Scenario: Non-admin can view but not edit thresholds
    Given I am logged in as a triage nurse
    When I navigate to the threshold settings
    Then I should see the current thresholds
    But the "Edit" buttons should be disabled
    And a message should explain "Administrator access required to modify thresholds"

  @permissions @edit
  Scenario: Only admins can modify thresholds
    Given I am logged in as a regular clinician
    When I try to access threshold editing API directly
    Then the request should be rejected with 403 Forbidden

  # ============================================
  # SYNC & MULTI-FACILITY
  # ============================================

  @sync
  Scenario: Thresholds sync with offline storage
    Given I have modified thresholds while online
    When I go offline
    Then the modified thresholds should be available locally
    And triage calculations should use the updated thresholds

  @multi-facility
  Scenario: Different facilities can have different thresholds
    Given I am a super-admin managing multiple facilities
    When I view threshold settings
    Then I should see a facility selector
    And each facility can have independent threshold configurations

  # ============================================
  # WARNINGS & SAFETY
  # ============================================

  @safety-warning
  Scenario: Warn when setting critical thresholds outside safe ranges
    Given I am editing SpO2 critical_low
    When I try to set it to 80 (very low)
    Then I should see a warning:
      """
      ⚠️ Caution: Setting critical threshold to 80% is unusually low.
      Most clinical guidelines recommend 85-90% for critical hypoxemia.
      Are you sure you want to proceed?
      """
    And I must confirm to proceed

  @safety-validation
  Scenario: Prevent obviously dangerous threshold values
    Given I am editing Heart Rate critical_low
    When I try to set it to 10 bpm
    Then I should see an error "Heart rate critical_low cannot be below 20 bpm"
    And the form should not save
