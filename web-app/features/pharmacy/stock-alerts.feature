@pharmacy @alerts
Feature: Stock Alerts and Notifications
  As a pharmacist or stock controller
  I want to receive alerts about stock issues
  So that I can proactively manage inventory and prevent stockouts or waste

  Background:
    Given I am logged in as a user with "pharmacy.view_stockalert" permission
    And I am on the pharmacy alerts dashboard

  # ============================================
  # LOW STOCK ALERTS
  # ============================================

  @smoke @low-stock
  Scenario: Display low stock alert
    Given a drug "Paracetamol 500mg" has:
      | current_stock | reorder_level |
      | 45            | 100           |
    Then a low stock alert should be generated
    And the alert should show:
      | field       | value                    |
      | Type        | LOW_STOCK                |
      | Drug        | Paracetamol 500mg        |
      | Severity    | HIGH                     |
      | Message     | Stock below reorder level|
      | Current     | 45 units                 |
      | Reorder at  | 100 units                |

  @low-stock @severity
  Scenario Outline: Low stock alert severity based on level
    Given a drug with reorder level of 100
    And current stock is <stock> units
    Then the alert severity should be "<severity>"

    Examples:
      | stock | severity |
      | 80    | MEDIUM   |
      | 50    | HIGH     |
      | 20    | CRITICAL |
      | 0     | CRITICAL |

  @out-of-stock
  Scenario: Display out of stock alert
    Given a drug "Amoxicillin 500mg" has 0 units available
    Then an out of stock alert should be generated
    And the alert type should be "OUT_OF_STOCK"
    And the severity should be "CRITICAL"
    And the message should indicate "No stock available"

  @low-stock @auto-generate
  Scenario: Auto-generate low stock alerts
    Given the stock alert generation job runs
    Then alerts should be generated for all drugs below reorder level
    And duplicate alerts should not be created
    And resolved alerts should not be regenerated

  # ============================================
  # EXPIRY ALERTS
  # ============================================

  @smoke @expiring
  Scenario: Display expiring soon alert
    Given a batch "PCM-2024-001" expires in 30 days
    Then an expiring alert should be generated
    And the alert should show:
      | field       | value                      |
      | Type        | EXPIRING_SOON              |
      | Drug        | Paracetamol 500mg          |
      | Batch       | PCM-2024-001               |
      | Severity    | HIGH                       |
      | Message     | Expires in 30 days         |
      | Expiry Date | (date 30 days from now)    |
      | Quantity    | (remaining quantity)        |

  @expiring @severity
  Scenario Outline: Expiry alert severity by days remaining
    Given a batch expires in <days> days
    Then the expiry alert severity should be "<severity>"

    Examples:
      | days | severity |
      | 90   | LOW      |
      | 60   | MEDIUM   |
      | 30   | HIGH     |
      | 14   | CRITICAL |
      | 7    | CRITICAL |

  @expired
  Scenario: Display expired stock alert
    Given a batch "VIT-2024-001" has expired
    Then an expired alert should be generated
    And the alert type should be "EXPIRED"
    And the severity should be "CRITICAL"
    And the message should indicate "Stock has expired - requires disposal"
    And the batch should be flagged for quarantine

  @expiring @auto-generate
  Scenario: Auto-generate expiry alerts
    Given batches with various expiry dates exist
    When the expiry alert generation job runs
    Then alerts should be generated for:
      | condition                | alert_type    |
      | Expires within 90 days   | EXPIRING_SOON |
      | Expires within 60 days   | EXPIRING_SOON |
      | Expires within 30 days   | EXPIRING_SOON |
      | Already expired          | EXPIRED       |

  # ============================================
  # RECALL ALERTS
  # ============================================

  @recall
  Scenario: Display product recall alert
    Given a manufacturer recall for batch prefix "RECALL-"
    When the recall alert is created
    Then the alert should show:
      | field       | value                       |
      | Type        | RECALLED                    |
      | Severity    | CRITICAL                    |
      | Message     | Manufacturer recall notice  |
      | Action      | Quarantine immediately      |
    And affected batches should be listed

  @recall @action
  Scenario: Take action on recall alert
    Given a recall alert for batch "RECALL-001"
    When I click "Quarantine Affected Stock"
    Then all matching batches should be quarantined
    And stock should no longer be available for dispensing
    And the action should be logged

  # ============================================
  # ALERT DASHBOARD
  # ============================================

  @dashboard @overview
  Scenario: View alerts dashboard overview
    When I view the alerts dashboard
    Then I should see summary counts:
      | category      | description              |
      | Critical      | Count of critical alerts |
      | High          | Count of high alerts     |
      | Medium        | Count of medium alerts   |
      | Low           | Count of low alerts      |
      | Unacknowledged| Count pending action     |

  @dashboard @filter
  Scenario Outline: Filter alerts by type
    Given alerts of different types exist
    When I filter by type "<type>"
    Then I should only see "<type>" alerts

    Examples:
      | type          |
      | LOW_STOCK     |
      | OUT_OF_STOCK  |
      | EXPIRING_SOON |
      | EXPIRED       |
      | RECALLED      |

  @dashboard @filter-severity
  Scenario Outline: Filter alerts by severity
    Given alerts of different severities exist
    When I filter by severity "<severity>"
    Then I should only see "<severity>" alerts

    Examples:
      | severity |
      | LOW      |
      | MEDIUM   |
      | HIGH     |
      | CRITICAL |

  @dashboard @sort
  Scenario: Alerts sorted by severity and date
    Given multiple alerts exist
    When I view the alerts list
    Then alerts should be sorted by:
      | priority | criteria                   |
      | 1        | CRITICAL severity first    |
      | 2        | Then HIGH severity         |
      | 3        | Then by creation date      |

  @dashboard @search
  Scenario: Search alerts by drug name
    When I search for "Paracetamol"
    Then I should see all alerts related to Paracetamol
    And results should include low stock and expiry alerts

  # ============================================
  # ALERT ACKNOWLEDGMENT
  # ============================================

  @acknowledge
  Scenario: Acknowledge an alert
    Given I am logged in as a user with "pharmacy.change_stockalert" permission
    And a low stock alert exists
    When I click "Acknowledge"
    Then the alert should be marked as acknowledged
    And my user ID should be recorded
    And acknowledgment timestamp should be recorded
    And the alert should move to "Acknowledged" section

  @acknowledge @bulk
  Scenario: Bulk acknowledge alerts
    Given 5 low stock alerts exist
    When I select all alerts
    And I click "Acknowledge Selected"
    Then all 5 alerts should be acknowledged
    And my user ID should be recorded on each

  @acknowledge @persist
  Scenario: Acknowledged alerts persist but remain visible
    Given an alert has been acknowledged
    When I view the alerts dashboard
    Then the alert should show "Acknowledged by [User] on [Date]"
    And the alert should remain visible until resolved

  # ============================================
  # ALERT RESOLUTION
  # ============================================

  @resolve @restock
  Scenario: Resolve low stock alert by restocking
    Given a low stock alert for "Paracetamol"
    When new stock is received
    And stock level exceeds reorder level
    Then the alert should be auto-resolved
    And resolution notes should show "Stock replenished"

  @resolve @manual
  Scenario: Manually resolve an alert
    Given I am logged in as a user with "pharmacy.change_stockalert" permission
    And an expiring stock alert exists
    When I click "Resolve"
    And I enter resolution notes "Stock transferred to outreach program"
    Then the alert should be marked as resolved
    And my user ID should be recorded
    And resolution timestamp should be recorded

  @resolve @expired-disposal
  Scenario: Resolve expired alert with disposal
    Given an expired stock alert exists for batch "VIT-2024-001"
    When I click "Resolve with Disposal"
    And I enter disposal details:
      | field           | value                    |
      | Disposal method | Returned to supplier     |
      | Reference       | RET-2026-0001            |
      | Notes           | Expired vitamin C        |
    Then the alert should be resolved
    And the batch should be marked as disposed
    And disposal record should be created

  @resolve @validation
  Scenario: Resolution notes required for manual resolve
    Given an alert is being resolved manually
    When I try to resolve without entering notes
    Then I should see "Resolution notes are required"
    And the resolve action should be blocked

  # ============================================
  # NOTIFICATIONS
  # ============================================

  @notification @realtime
  Scenario: Receive real-time notification for critical alert
    Given a critical alert is generated
    Then users with pharmacy permissions should receive notification
    And the notification should show:
      | field    | value                      |
      | Type     | Critical Pharmacy Alert    |
      | Message  | (alert message)            |
      | Action   | View Alert                 |

  @notification @badge
  Scenario: Display unread alert badge
    Given 3 unacknowledged critical alerts exist
    Then the pharmacy menu should show a badge with "3"
    And the badge should be red for critical alerts

  @notification @email
  Scenario: Email notification for critical alerts
    Given email notifications are enabled
    When a critical out-of-stock alert is generated
    Then an email should be sent to pharmacy manager
    And the email should contain alert details
    And a link to the alert should be included

  @notification @preferences
  Scenario: Configure notification preferences
    Given I am on notification settings
    When I configure preferences:
      | alert_type    | in_app | email |
      | CRITICAL      | Yes    | Yes   |
      | HIGH          | Yes    | No    |
      | MEDIUM        | Yes    | No    |
      | LOW           | No     | No    |
    Then I should receive notifications per my preferences

  # ============================================
  # ALERT THRESHOLDS
  # ============================================

  @threshold @configure
  Scenario: Configure alert thresholds
    Given I am logged in as a pharmacy administrator
    When I access alert threshold settings
    And I configure:
      | setting                  | value |
      | Expiry warning (days)    | 90    |
      | Critical expiry (days)   | 30    |
      | Low stock percentage     | 20%   |
    Then alerts should be generated using these thresholds

  @threshold @drug-specific
  Scenario: Set drug-specific alert thresholds
    Given drug "Insulin" requires special handling
    When I set custom thresholds for Insulin:
      | setting         | value |
      | Reorder level   | 200   |
      | Expiry warning  | 60    |
    Then Insulin alerts should use these custom thresholds
    And other drugs should use default thresholds

  # ============================================
  # REPORTING
  # ============================================

  @report @history
  Scenario: View alert history report
    When I generate alert history report for last 30 days
    Then I should see:
      | metric                    | included |
      | Total alerts generated    | Yes      |
      | Alerts by type            | Yes      |
      | Alerts by severity        | Yes      |
      | Average resolution time   | Yes      |
      | Unresolved alerts         | Yes      |

  @report @trends
  Scenario: View alert trends
    Given alerts have been tracked over time
    When I view alert trends
    Then I should see graphs showing:
      | trend                     |
      | Alerts over time          |
      | Most frequent alert types |
      | Drugs with most alerts    |

  @report @export
  Scenario: Export alerts report
    When I export alerts to CSV
    Then the file should include:
      | column          |
      | Alert Date      |
      | Alert Type      |
      | Severity        |
      | Drug            |
      | Batch           |
      | Status          |
      | Acknowledged By |
      | Resolved By     |
      | Resolution Notes|

  # ============================================
  # OFFLINE SUPPORT
  # ============================================

  @offline @display
  Scenario: View cached alerts offline
    Given I have previously loaded alerts online
    And I am now offline
    When I view the alerts dashboard
    Then I should see cached alerts
    And a banner should indicate "Showing cached data"

  @offline @acknowledge-sync
  Scenario: Sync offline acknowledgments
    Given I acknowledged alerts while offline
    When I come back online
    Then acknowledgments should sync to server
    And timestamps should reflect actual acknowledgment time

  # ============================================
  # AUTOMATION
  # ============================================

  @automation @schedule
  Scenario: Scheduled alert generation
    Given alert generation is scheduled for 6:00 AM daily
    When the scheduled time arrives
    Then low stock alerts should be generated/updated
    And expiry alerts should be generated/updated
    And notification should be sent if new critical alerts exist

  @automation @stock-change
  Scenario: Generate alerts on stock change
    Given a drug drops below reorder level after dispensing
    Then a low stock alert should be generated immediately
    And pharmacy staff should be notified

  @automation @expiry-check
  Scenario: Daily expiry check
    Given the daily expiry check runs
    Then batches expiring within threshold should be flagged
    And newly expired batches should generate alerts
    And expired batches should be blocked from dispensing
