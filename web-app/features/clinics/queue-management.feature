Feature: Clinic Queue Management

  Scenario: Add patient to clinic queue after triage
    Given I am logged in as a triage nurse
    And patient "John Doe" has completed triage with category "GREEN"
    When I route patient to "Eye Clinic"
    Then patient should appear in Eye Clinic queue
    And queue number should be assigned

  Scenario: Call patient from queue
    Given I am logged in as a doctor assigned to "Eye Clinic"
    And there are 5 patients in the queue
    When I click "Call" on the first patient
    Then patient status should change to "CALLED"
    And patient should be assigned to me