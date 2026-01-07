@triage @queue
Feature: Triage Queue Dashboard
  As a triage nurse or clinician
  I want to view and manage the triage queue
  So that patients are seen in priority order according to KETA standards

  Background:
    Given I am logged in as a user with "view_triage_queue" permission
    And I am on the triage queue dashboard

  # ============================================
  # QUEUE DISPLAY & SORTING
  # ============================================

  @smoke @priority-sort
  Scenario: Queue is sorted by KETA category then arrival time
    Given the following patients are in the queue:
      | patient       | category | arrival_time |
      | Mary Otieno   | RED      | 10:15        |
      | John Kamau    | ORANGE   | 09:30        |
      | Jane Wanjiku  | RED      | 10:00        |
      | Peter Odhiambo| YELLOW   | 09:00        |
    When I view the triage queue
    Then the patients should be displayed in this order:
      | position | patient       | category |
      | 1        | Jane Wanjiku  | RED      |
      | 2        | Mary Otieno   | RED      |
      | 3        | John Kamau    | ORANGE   |
      | 4        | Peter Odhiambo| YELLOW   |

  @category-badge
  Scenario Outline: Display color-coded category badges
    Given a patient with triage category "<category>"
    Then their queue card should show a "<color>" badge
    And the badge should display "<label>"

    Examples:
      | category | color  | label                  |
      | RED      | red    | Emergency - Immediate  |
      | ORANGE   | orange | Very Urgent - <10 min  |
      | YELLOW   | yellow | Urgent - <60 min       |
      | GREEN    | green  | Standard - <240 min    |
      | BLUE     | blue   | Non-Urgent/Referral    |

  @patient-info
  Scenario: Queue card displays essential patient information
    Given a patient "John Kamau" with MRN "MRN-20260103-0042" is in the queue
    When I view their queue card
    Then I should see:
      | field              | value               |
      | Patient Name       | John Kamau          |
      | MRN                | MRN-20260103-0042   |
      | Age                | 55 years            |
      | Chief Complaint    | Chest pain          |
      | Triage Category    | ORANGE badge        |
      | Assigned Area      | ER - Acute Care     |
      | Wait Time          | 8 minutes           |

  @wait-time
  Scenario: Display real-time wait time
    Given a patient arrived at "10:00 AM"
    And the current time is "10:15 AM"
    When I view the queue
    Then their wait time should show "15 min"

  @wait-time @exceeded
  Scenario Outline: Flag patients exceeding target wait time
    Given a patient with category "<category>" arrived "<wait_minutes>" minutes ago
    Then their queue card should show wait time "<status>"
    And the wait time should be styled in "<style>"

    Examples:
      | category | wait_minutes | status     | style      |
      | RED      | 2            | 2 min ⚠️   | critical   |
      | ORANGE   | 8            | 8 min      | normal     |
      | ORANGE   | 15           | 15 min ⚠️  | warning    |
      | YELLOW   | 45           | 45 min     | normal     |
      | YELLOW   | 75           | 75 min ⚠️  | warning    |
      | GREEN    | 180          | 3 hr       | normal     |
      | GREEN    | 300          | 5 hr ⚠️    | warning    |

  @alerts
  Scenario: Display critical alerts on queue cards
    Given a patient has the following alerts:
      | alert                                |
      | Severe hypoxemia - SpO2 critically low |
      | Patient arrived by ambulance         |
    When I view their queue card
    Then I should see an alert icon with "2 alerts"
    When I hover over the alert icon
    Then I should see the alert details

  # ============================================
  # FILTERING & SEARCH
  # ============================================

  @filter @area
  Scenario: Filter queue by assigned area
    Given the queue has patients assigned to different areas:
      | patient       | assigned_area |
      | Mary Otieno   | ER_RESUS      |
      | John Kamau    | ER_ACUTE      |
      | Jane Wanjiku  | ER_ACUTE      |
      | Peter Odhiambo| OPD           |
    When I select area filter "ER - Acute Care"
    Then I should only see patients:
      | patient       |
      | John Kamau    |
      | Jane Wanjiku  |
    And the queue count should show "2"

  @filter @category
  Scenario: Filter queue by triage category
    When I select category filter "RED"
    Then I should only see patients with RED category
    And other category patients should be hidden

  @filter @status
  Scenario: Filter queue by status
    When I select status filter "WAITING"
    Then I should only see patients with WAITING status
    And patients who are CALLED or WITH_CLINICIAN should be hidden

  @search
  Scenario: Search queue by patient name or MRN
    Given the queue has 20 patients
    When I search for "Kamau"
    Then I should see only patients with "Kamau" in their name
    When I search for "MRN-20260103-0042"
    Then I should see only the patient with that MRN

  @clear-filter
  Scenario: Clear all filters
    Given I have applied area filter "ER_ACUTE" and category filter "ORANGE"
    When I click "Clear Filters"
    Then all patients should be visible
    And filter selections should be reset

  # ============================================
  # QUEUE ACTIONS
  # ============================================

  @smoke @call-patient
  Scenario: Call patient from queue
    Given patient "John Kamau" is at position 1 with status "WAITING"
    When I click "Call" on their queue card
    Then their status should change to "CALLED"
    And called_at timestamp should be recorded
    And called_by should be set to my user
    And the queue card should show "Called by [My Name]"

  @announce
  Scenario: Announce patient call with visual indicator
    When I call patient "Mary Otieno"
    Then a prominent announcement should appear:
      """
      Now calling: Mary Otieno
      Please proceed to ER - Resuscitation
      """
    And the announcement should auto-dismiss after 10 seconds

  @with-clinician
  Scenario: Mark patient as with clinician
    Given patient "John Kamau" has status "CALLED"
    When I click "With Clinician" on their queue card
    Then their status should change to "WITH_CLINICIAN"
    And seen_by_clinician_time should be recorded on the triage assessment
    And wait time counter should stop

  @complete
  Scenario: Mark patient as completed
    Given patient "John Kamau" has status "WITH_CLINICIAN"
    When I click "Complete" on their queue card
    Then their status should change to "COMPLETED"
    And they should be removed from the active queue
    And a completion summary should be logged

  @lwbs
  Scenario: Mark patient as Left Without Being Seen (LWBS)
    Given patient "John Kamau" has status "WAITING"
    When I click "LWBS" on their queue card
    Then I should see a prompt for LWBS reason
    When I enter reason "Patient left, stated would return later"
    And I click "Confirm LWBS"
    Then their status should change to "LEFT_WITHOUT_BEING_SEEN"
    And they should be removed from the active queue
    And the LWBS should be logged with reason

  @lwbs @validation
  Scenario: LWBS requires reason
    Given patient "John Kamau" has status "WAITING"
    When I click "LWBS" on their queue card
    And I try to confirm without entering a reason
    Then I should see an error "LWBS reason is required"
    And the patient should remain in the queue

  # ============================================
  # QUEUE STATUS INDICATORS
  # ============================================

  @status-badge
  Scenario Outline: Display appropriate status badge
    Given a patient with status "<status>"
    Then their queue card should show status badge "<badge>" with style "<style>"

    Examples:
      | status                   | badge       | style   |
      | WAITING                  | Waiting     | default |
      | CALLED                   | Called      | info    |
      | WITH_CLINICIAN           | With Doctor | success |
      | COMPLETED                | Completed   | muted   |
      | LEFT_WITHOUT_BEING_SEEN  | LWBS        | warning |

  @queue-stats
  Scenario: Display queue statistics summary
    Given the queue has:
      | status         | count |
      | WAITING        | 12    |
      | CALLED         | 3     |
      | WITH_CLINICIAN | 5     |
    Then the queue header should show:
      | stat            | value |
      | Total in Queue  | 20    |
      | Waiting         | 12    |
      | In Progress     | 8     |

  @category-summary
  Scenario: Display category breakdown
    Given the queue has:
      | category | count |
      | RED      | 2     |
      | ORANGE   | 5     |
      | YELLOW   | 8     |
      | GREEN    | 4     |
      | BLUE     | 1     |
    Then the category summary should show colored counts for each category

  # ============================================
  # REAL-TIME UPDATES
  # ============================================

  @realtime
  Scenario: Queue updates in real-time
    Given I am viewing the triage queue
    When another nurse adds a new RED category patient
    Then the queue should automatically refresh
    And the new patient should appear at the top
    And I should see a notification "New patient added to queue"

  @refresh
  Scenario: Manual queue refresh
    When I click the refresh button
    Then the queue should reload
    And the last updated timestamp should update

  @auto-refresh
  Scenario: Queue auto-refreshes at configured interval
    Given queue auto-refresh is set to 30 seconds
    When 30 seconds pass
    Then the queue should automatically refresh
    And the "Last updated" timestamp should show current time

  # ============================================
  # NAVIGATION & ACTIONS
  # ============================================

  @view-details
  Scenario: View full triage assessment details
    When I click on a patient's queue card
    Then I should see the full triage assessment details modal including:
      | section            | content                    |
      | Patient Info       | Name, MRN, Age, Gender     |
      | Chief Complaint    | Category, Details          |
      | Clinical Assessment| AVPU, Pain, Mobility       |
      | Vitals             | From linked encounter      |
      | Alerts             | All generated alerts       |
      | Triage Decision    | Category, Assigned Area    |
      | Timestamps         | Arrival, Triage Start/End  |

  @edit-assessment
  Scenario: Edit triage assessment from queue
    Given I have "perform_triage" permission
    When I click "Edit" on a patient's queue card
    Then I should be taken to the triage assessment edit form
    And the form should be pre-filled with current data

  @start-new-triage
  Scenario: Start new triage from queue view
    When I click "New Triage" button
    Then I should see a patient selection dialog
    When I select a patient with an active encounter
    Then I should be taken to the triage assessment form

  # ============================================
  # EMPTY STATES & EDGE CASES
  # ============================================

  @empty-state
  Scenario: Display empty state when queue is empty
    Given there are no patients in the queue
    When I view the triage queue
    Then I should see an empty state message:
      """
      No patients currently in triage queue
      New patients will appear here after triage assessment
      """

  @empty-filter
  Scenario: Display message when filter returns no results
    Given the queue has 10 patients in GREEN category
    When I filter by category "RED"
    Then I should see a message "No RED category patients in queue"
    And a suggestion to clear filters

  # ============================================
  # PERMISSIONS & ACCESS CONTROL
  # ============================================

  @permissions
  Scenario: Users without queue permission see limited view
    Given I am logged in as a user without "view_triage_queue" permission
    When I try to access the triage queue
    Then I should see an access denied message
    And be redirected to the dashboard

  @permissions @actions
  Scenario: Call action requires appropriate permission
    Given I am logged in as a user with "view_triage_queue" permission
    But without "perform_triage" permission
    When I view the queue
    Then I should see the patient list
    But the "Edit" button should not be visible
    And I should be able to call patients

  # ============================================
  # RESPONSIVE DESIGN
  # ============================================

  @mobile
  Scenario: Queue displays correctly on mobile
    Given I am viewing on a mobile device (width: 375px)
    When I view the triage queue
    Then queue cards should stack vertically
    And patient info should be condensed
    And action buttons should be in a dropdown menu

  @tablet
  Scenario: Queue displays correctly on tablet
    Given I am viewing on a tablet (width: 768px)
    When I view the triage queue
    Then queue cards should display in a 2-column grid
    And all action buttons should be visible
