@patients @search
Feature: Patient Search and Lookup
  As a healthcare worker
  I want to search for and view patient records
  So that I can access patient information for clinical care

  Background:
    Given I am logged in as a user with "patients.view_patient" permission
    And I am on the patient search page

  # ============================================
  # SEARCH BY IDENTIFIERS
  # ============================================

  @smoke @search-mrn
  Scenario: Search patient by MRN
    Given a patient exists with MRN "MRN-20260103-0042"
    When I search for "MRN-20260103-0042"
    Then I should see exactly 1 result
    And the result should display patient "Jane Wanjiku"
    And the MRN should be highlighted in the result

  @search @national-id
  Scenario: Search patient by national ID
    Given a patient exists with national ID "12345678"
    When I search for "12345678"
    Then I should see the matching patient
    And search should complete within 2 seconds

  @search @phone
  Scenario: Search patient by phone number
    Given a patient exists with phone "+254712345678"
    When I search for "0712345678"
    Then I should see the matching patient
    And various phone formats should match:
      | search_term    |
      | +254712345678  |
      | 254712345678   |
      | 0712345678     |
      | 712345678      |

  @search @name
  Scenario: Search patient by name
    Given patients exist:
      | first_name | last_name |
      | Jane       | Wanjiku   |
      | John       | Wanjiru   |
      | Janet      | Wambui    |
    When I search for "Jane"
    Then I should see "Jane Wanjiku" in results
    When I search for "Wanj"
    Then I should see both "Jane Wanjiku" and "John Wanjiru"

  @search @partial
  Scenario: Partial name search works
    Given a patient "Jane Wanjiku Kamau" exists
    When I search for "Wanjiku"
    Then the patient should appear in results
    When I search for "Jane K"
    Then the patient should appear in results

  @search @case-insensitive
  Scenario: Search is case insensitive
    Given a patient "JANE WANJIKU" exists
    When I search for "jane wanjiku"
    Then the patient should appear in results
    When I search for "Jane WANJIKU"
    Then the patient should appear in results

  # ============================================
  # SEARCH RESULTS DISPLAY
  # ============================================

  @results @display
  Scenario: Search results show essential patient info
    Given patients exist in the system
    When I perform a search
    Then each result should display:
      | field          |
      | MRN            |
      | Full Name      |
      | Date of Birth  |
      | Gender         |
      | Phone Number   |
      | Last Visit     |

  @results @photo
  Scenario: Display patient photo if available
    Given a patient has a profile photo
    When I view search results
    Then the patient's photo should be displayed
    And a placeholder should show for patients without photos

  @results @age
  Scenario: Display calculated age
    Given a patient with DOB "1985-05-20" exists
    When I view the search results
    Then age should be displayed as "40 years" (calculated)

  @results @status
  Scenario: Display patient status indicators
    Given a patient with active encounter exists
    When I view search results
    Then I should see status indicators:
      | indicator        | meaning                    |
      | 🟢 Active Visit  | Has ongoing encounter today|
      | 🔴 Admitted      | Currently inpatient        |
      | ⚠️ Critical      | Has critical vitals        |

  # ============================================
  # SEARCH FILTERS
  # ============================================

  @filter @gender
  Scenario: Filter search results by gender
    Given patients of different genders exist
    When I filter by gender "Female"
    Then I should only see female patients

  @filter @age
  Scenario: Filter search results by age range
    When I filter by age range 18 to 65
    Then I should only see patients aged 18-65

  @filter @location
  Scenario: Filter by county
    Given patients from different counties exist
    When I filter by county "Nairobi"
    Then I should only see patients from Nairobi county

  @filter @date
  Scenario: Filter by registration date
    When I filter by registration date range:
      | from       | to         |
      | 2026-01-01 | 2026-01-07 |
    Then I should only see patients registered in that period

  @filter @combine
  Scenario: Combine multiple filters
    When I search for "Jane"
    And I filter by gender "Female"
    And I filter by county "Nairobi"
    Then results should match all criteria

  # ============================================
  # PATIENT DETAILS VIEW
  # ============================================

  @smoke @details
  Scenario: View complete patient details
    Given a patient "Jane Wanjiku" exists
    When I click on the patient to view details
    Then I should see the patient profile with:
      | section           | content                      |
      | Demographics      | Name, DOB, Gender, Age       |
      | Contact Info      | Phone, Address, County       |
      | Emergency Contact | Name, Phone, Relationship    |
      | Medical Summary   | Allergies, Chronic Conditions|
      | Visit History     | List of past encounters      |

  @details @encounters
  Scenario: View patient encounter history
    Given a patient has 5 previous encounters
    When I view the patient's encounter history
    Then I should see all 5 encounters listed
    And each should show date, type, and diagnosis
    And encounters should be ordered by date (newest first)

  @details @timeline
  Scenario: View patient timeline
    Given a patient has encounters, labs, and prescriptions
    When I view the patient timeline
    Then I should see all activities in chronological order
    And I should be able to filter by activity type

  # ============================================
  # SENSITIVE PATIENT ACCESS
  # ============================================

  @sensitive @hidden
  Scenario: Sensitive patients hidden without permission
    Given a patient is marked as sensitive (HIV/GBV/Mental Health)
    And I do NOT have "patients.view_sensitive_patient" permission
    When I search for the patient
    Then the patient should NOT appear in results

  @sensitive @access
  Scenario: Sensitive patients visible with permission
    Given a patient is marked as sensitive
    And I have "patients.view_sensitive_patient" permission
    When I search for the patient
    Then the patient should appear in results
    And a "Sensitive" badge should be displayed
    And access should be logged

  @sensitive @audit
  Scenario: Viewing sensitive patient is audited
    Given I have permission to view sensitive patients
    When I view a sensitive patient's record
    Then an audit log should record:
      | field  | value                   |
      | action | view_sensitive_patient  |
      | user   | (my user ID)            |

  # ============================================
  # QUICK ACTIONS
  # ============================================

  @quick-actions
  Scenario: Quick actions from search results
    Given I see a patient in search results
    Then I should see quick action buttons:
      | action          | permission required     |
      | View Details    | patients.view_patient   |
      | New Encounter   | encounters.add_encounter|
      | Edit Patient    | patients.change_patient |
      | Add to Queue    | core.add_queue          |

  @quick-actions @encounter
  Scenario: Start new encounter from search
    Given I find patient "Jane Wanjiku" in search
    When I click "New Encounter"
    Then I should be taken to encounter creation page
    And the patient should be pre-selected

  @quick-actions @queue
  Scenario: Add patient to queue from search
    Given I find patient "Jane Wanjiku" in search
    When I click "Add to Queue"
    And I select department "OPD"
    Then the patient should be added to OPD queue
    And a queue ticket should be generated

  # ============================================
  # RECENT PATIENTS
  # ============================================

  @recent
  Scenario: View recently accessed patients
    Given I have viewed patients "Jane", "John", and "Mary" today
    When I click "Recent Patients"
    Then I should see these 3 patients listed
    And they should be ordered by most recently viewed

  @recent @limit
  Scenario: Recent patients list has limit
    Given I have viewed 20 patients today
    When I view recent patients
    Then I should see the most recent 10 patients

  # ============================================
  # OFFLINE SEARCH
  # ============================================

  @offline @search
  Scenario: Search works offline with cached data
    Given I have previously loaded patient data online
    And I am now offline
    When I search for a patient
    Then locally cached patients should be searchable
    And a banner should indicate "Offline - searching local data"

  @offline @limited
  Scenario: Offline search shows limited results
    Given I am offline
    When I search for a patient
    Then only locally synced patients should appear
    And a message should indicate "Limited results - connect for full search"

  # ============================================
  # PERFORMANCE
  # ============================================

  @performance @large-db
  Scenario: Search performs well with large database
    Given the database has 100,000+ patients
    When I search by MRN
    Then results should return within 2 seconds

  @performance @name-search
  Scenario: Name search performs acceptably
    Given the database has 100,000+ patients
    When I search by name "Jane"
    Then results should return within 3 seconds
    And partial matches should be ranked by relevance

  # ============================================
  # EMPTY STATES
  # ============================================

  @empty @no-results
  Scenario: Display message when no results found
    When I search for "ZZZZNONEXISTENT"
    Then I should see "No patients found matching your search"
    And I should see option to "Register New Patient"

  @empty @initial
  Scenario: Initial state before search
    When I open the search page without entering a query
    Then I should see placeholder text "Search by MRN, Name, National ID, or Phone"
    And recent patients may be displayed

  # ============================================
  # ADVANCED SEARCH
  # ============================================

  @advanced
  Scenario: Advanced search with multiple criteria
    When I open advanced search
    And I enter:
      | field        | value        |
      | First Name   | Jane         |
      | Last Name    | (any)        |
      | DOB Range    | 1980-1990    |
      | County       | Nairobi      |
    And I click "Search"
    Then I should see patients matching all criteria

  @advanced @medical
  Scenario: Search by medical criteria
    Given I have clinical search permission
    When I search for patients with:
      | criteria              | value      |
      | Chronic Condition     | Diabetes   |
      | Allergy               | Penicillin |
    Then I should see patients with matching conditions

  # ============================================
  # AUDIT & SECURITY
  # ============================================

  @audit @search
  Scenario: Patient searches are logged
    When I search for a patient
    And I view their record
    Then an audit log should record "patient_view"
    And the log should include search context

  @security @export
  Scenario: Patient data export requires permission
    Given I have "patients.export_patient" permission
    When I view a patient's record
    Then I should see "Export" option
    And export should generate FHIR-compliant Patient resource

  @security @no-export
  Scenario: Users without permission cannot export
    Given I do NOT have "patients.export_patient" permission
    When I view a patient's record
    Then I should NOT see "Export" option

  # ============================================
  # ACCESSIBILITY
  # ============================================

  @a11y
  Scenario: Search is accessible
    Then the search input should have proper aria-label
    And results should be navigable by keyboard
    And screen readers should announce result count
    And focus should move to results after search
