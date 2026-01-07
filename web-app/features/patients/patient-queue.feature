@patients @queue
Feature: Patient Queue Management
  As a queue manager or healthcare worker
  I want to manage patient queues across departments
  So that patient flow is optimized and wait times are minimized

  Background:
    Given I am logged in as a user with queue management permissions
    And I am on the queue management page

  # ============================================
  # QUEUE OVERVIEW
  # ============================================

  @smoke @dashboard
  Scenario: View queue dashboard
    When I view the queue dashboard
    Then I should see queues for departments:
      | department | waiting | in_progress | avg_wait |
      | Reception  | 5       | 2           | 8 min    |
      | Triage     | 3       | 1           | 12 min   |
      | OPD        | 8       | 3           | 25 min   |
      | Laboratory | 4       | 2           | 15 min   |
      | Pharmacy   | 6       | 1           | 10 min   |
      | Cashier    | 3       | 1           | 5 min    |

  @dashboard @realtime
  Scenario: Queue updates in real-time
    Given I am viewing the queue dashboard
    When a new patient is added to OPD queue
    Then the dashboard should update automatically
    And OPD waiting count should increase by 1

  @dashboard @metrics
  Scenario: View queue metrics
    Then I should see metrics:
      | metric                  | description                |
      | Total Patients Today    | All patients who visited   |
      | Currently Waiting       | Sum across all queues      |
      | Average Wait Time       | Overall average            |
      | Longest Current Wait    | Patient waiting longest    |
      | Peak Hour               | Busiest time today         |

  # ============================================
  # ADDING PATIENTS TO QUEUE
  # ============================================

  @smoke @add-queue
  Scenario: Add patient to OPD queue after registration
    Given patient "Jane Wanjiku" is registered
    When I add the patient to OPD queue
    Then patient should appear in OPD queue
    And a queue ticket should be generated
    And ticket number should be displayed (e.g., "OPD-042")

  @add-queue @priority
  Scenario Outline: Add patient with priority level
    When I add patient to queue with priority "<priority>"
    Then patient should be positioned according to priority
    And priority badge should be displayed as "<badge>"

    Examples:
      | priority   | badge     |
      | Emergency  | 🔴 Red    |
      | Urgent     | 🟠 Orange |
      | Pregnant   | 🟣 Purple |
      | Elderly    | 🔵 Blue   |
      | Child      | 🟢 Green  |
      | Standard   | ⚪ White  |

  @add-queue @department
  Scenario: Add patient to specific department queue
    When I add patient to queue:
      | field       | value      |
      | Department  | Laboratory |
      | Priority    | Urgent     |
      | Notes       | Fasting    |
    Then patient should appear in Laboratory queue
    And notes should be visible to lab staff

  @add-queue @ticket
  Scenario: Generate queue ticket
    When I add patient to queue
    Then a ticket should be generated with:
      | field         | value                    |
      | Ticket Number | OPD-042                  |
      | Patient Name  | Jane Wanjiku             |
      | Department    | OPD                      |
      | Queue Time    | 2026-01-07 09:30 AM      |
      | Position      | 8                        |
    And ticket should be printable

  # ============================================
  # QUEUE PRIORITIZATION
  # ============================================

  @priority @auto
  Scenario: Automatic priority detection
    Given patient "Mary Kamau" is registered
    And patient age is 75 years
    When I add patient to queue
    Then priority should be auto-suggested as "Elderly"
    And I should be able to override if needed

  @priority @pregnancy
  Scenario: Pregnant patient priority
    Given patient is flagged as pregnant
    When I add to queue
    Then priority should be auto-suggested as "Pregnant"
    And patient should move ahead of standard priority

  @priority @emergency
  Scenario: Emergency bypasses queue
    When I add patient with "Emergency" priority
    Then patient should be placed at front of queue
    And staff should receive emergency alert
    And patient should not wait

  @priority @order
  Scenario: Queue ordering by priority and time
    Given patients in OPD queue:
      | name  | priority  | wait_time |
      | John  | Standard  | 30 min    |
      | Mary  | Urgent    | 10 min    |
      | Peter | Emergency | 2 min     |
      | Jane  | Standard  | 45 min    |
    Then queue order should be:
      | position | name  | reason                      |
      | 1        | Peter | Emergency priority          |
      | 2        | Mary  | Urgent priority             |
      | 3        | Jane  | Standard, longest wait      |
      | 4        | John  | Standard, shorter wait      |

  # ============================================
  # CALLING PATIENTS
  # ============================================

  @smoke @call
  Scenario: Call next patient
    Given I am a clinician in OPD room 3
    When I click "Call Next Patient"
    Then the next patient in queue should be called
    And patient status should change to "Called"
    And display screen should show patient name and room

  @call @display
  Scenario: Patient display screen shows called patients
    Given a display screen is configured for OPD
    When patient "Jane Wanjiku" is called to Room 3
    Then display should show:
      | ticket    | name          | room   |
      | OPD-042   | Jane W.       | Room 3 |

  @call @no-show
  Scenario: Handle patient no-show
    Given patient "John Kamau" was called 5 minutes ago
    When I mark patient as "No Show"
    Then patient should be removed from active queue
    And status should be "No Show"
    And next patient should be called

  @call @re-queue
  Scenario: Re-queue patient who missed call
    Given patient missed their call
    When I re-queue the patient
    Then patient should be added back to queue
    And wait time should restart
    And previous call should be noted

  # ============================================
  # PATIENT JOURNEY TRACKING
  # ============================================

  @journey @track
  Scenario: Track patient through departments
    Given patient "Jane Wanjiku" is in the system
    When I view patient journey
    Then I should see:
      | step       | time     | status    |
      | Reception  | 09:00 AM | Complete  |
      | Triage     | 09:15 AM | Complete  |
      | OPD        | 09:30 AM | In Progress|
      | Laboratory | -        | Pending   |
      | Pharmacy   | -        | Pending   |
      | Cashier    | -        | Pending   |

  @journey @status
  Scenario Outline: Queue status transitions
    Given patient is in queue
    When status changes to "<new_status>"
    Then the status should be "<new_status>"
    And timestamp should be recorded

    Examples:
      | new_status   |
      | Waiting      |
      | Called       |
      | In Progress  |
      | Complete     |
      | No Show      |
      | Transferred  |

  @journey @auto-advance
  Scenario: Auto-advance to next department
    Given patient completes OPD consultation
    And doctor orders lab tests
    Then patient should be auto-added to Laboratory queue
    And patient should be notified
    And queue ticket should show next department

  # ============================================
  # QUEUE MANAGEMENT
  # ============================================

  @manage @reorder
  Scenario: Manually reorder queue
    Given I have queue manager permission
    When I drag patient "Mary Kamau" to position 3
    Then queue order should update
    And reason for reordering should be required

  @manage @transfer
  Scenario: Transfer patient between queues
    Given patient is in OPD queue
    When I transfer to Specialist queue
    Then patient should move to Specialist queue
    And OPD queue should update
    And transfer reason should be recorded

  @manage @remove
  Scenario: Remove patient from queue
    When I remove patient from queue
    And I select reason "Patient left"
    Then patient should be removed
    And removal should be logged

  @manage @bulk
  Scenario: Bulk queue operations
    Given I select multiple patients in queue
    When I apply bulk action "Mark Complete"
    Then all selected patients should be marked complete

  # ============================================
  # WAIT TIME MANAGEMENT
  # ============================================

  @wait-time @display
  Scenario: Display estimated wait time
    Given patient position is 5 in OPD queue
    And average service time is 10 minutes
    Then estimated wait should show "~50 minutes"

  @wait-time @alert
  Scenario: Alert for excessive wait time
    Given patient has been waiting over 60 minutes
    Then queue manager should receive alert
    And patient should be flagged in queue
    And wait time should be highlighted red

  @wait-time @sla
  Scenario: Track wait time SLA compliance
    When I view queue analytics
    Then I should see:
      | metric              | value |
      | Within SLA (30 min) | 75%   |
      | Over SLA            | 25%   |
      | Average Wait        | 28 min|

  # ============================================
  # DISPLAY SCREENS
  # ============================================

  @display @config
  Scenario: Configure queue display screen
    Given I have admin permissions
    When I configure display for Reception area
    Then I should set:
      | setting        | value          |
      | Department     | OPD            |
      | Show Names     | First name only|
      | Audio Alert    | Enabled        |
      | Language       | English/Swahili|

  @display @public
  Scenario: Public queue display
    When a public display is showing
    Then it should display:
      | element             |
      | Currently being served |
      | Next in queue (3-5)    |
      | Estimated wait time    |
    And sensitive info should be hidden
    And audio should announce called patients

  # ============================================
  # NOTIFICATIONS
  # ============================================

  @notification @patient
  Scenario: Notify patient when turn approaches
    Given patient provided phone number
    And patient is position 2 in queue
    Then patient should receive SMS notification
    And message should say "Your turn is approaching"

  @notification @staff
  Scenario: Notify staff of queue status
    Given OPD queue exceeds 15 patients
    Then staff should receive notification
    And notification should suggest calling additional staff

  # ============================================
  # TRIAGE QUEUE
  # ============================================

  @triage @priority
  Scenario: Triage assigns priority
    Given patient is in Triage queue
    When nurse completes triage:
      | vital   | value | status   |
      | SpO2    | 91%   | Critical |
    Then patient should be assigned "Emergency" priority
    And patient should be moved to front of OPD queue
    And doctor should be alerted

  @triage @bypass
  Scenario: Critical patient bypasses triage
    When patient presents with obvious emergency
    And I mark as "Emergency - Bypass Triage"
    Then patient should skip triage queue
    And go directly to emergency treatment

  # ============================================
  # REPORTS & ANALYTICS
  # ============================================

  @report @daily
  Scenario: Generate daily queue report
    When I generate daily report
    Then report should show:
      | metric                  |
      | Total patients served   |
      | Average wait per dept   |
      | Peak hours              |
      | No-show count           |
      | SLA compliance          |

  @report @trends
  Scenario: View queue trends
    When I view weekly trends
    Then I should see:
      | trend                   |
      | Daily patient volume    |
      | Wait time by day/hour   |
      | Department comparison   |
      | Staffing correlation    |

  # ============================================
  # OFFLINE SUPPORT
  # ============================================

  @offline @queue
  Scenario: Manage queue offline
    Given I am offline
    When I add patients to queue
    Then queue should work locally
    And data should sync when online
    And conflicts should be flagged

  @offline @display
  Scenario: Display shows offline cached data
    Given display is offline
    Then cached queue should display
    And banner should show "Offline mode"

  # ============================================
  # INTEGRATION
  # ============================================

  @integration @encounter
  Scenario: Queue integrates with encounters
    Given patient is called from queue
    When clinician starts encounter
    Then queue status should auto-update to "In Progress"
    When encounter is completed
    Then queue status should update to "Complete"

  @integration @billing
  Scenario: Queue feeds into billing
    Given patient completes all queues
    Then billing should have all visited departments
    And total services should be ready for payment

  # ============================================
  # ACCESSIBILITY
  # ============================================

  @a11y
  Scenario: Queue display is accessible
    Then display should have:
      | feature               |
      | High contrast text    |
      | Large font sizes      |
      | Audio announcements   |
      | Multi-language support|
