@triage @alerts @vitals
Feature: Vital Signs Alerts
  As a healthcare provider
  I want to see critical and warning alerts for abnormal vital signs
  So that I can quickly identify patients requiring immediate attention

  Background:
    Given I am logged in as a healthcare provider
    And I am viewing a patient's triage assessment

  # ============================================
  # CRITICAL ALERTS (RED - IMMEDIATE)
  # ============================================

  @smoke @critical @spo2
  Scenario: Critical alert for severe hypoxemia
    Given the patient has SpO2 of 85%
    Then a CRITICAL alert should be displayed:
      """
      🔴 CRITICAL: Severe hypoxemia - SpO2 85% (Critical threshold: <90%)
      Immediate intervention required
      """
    And the alert should be styled in red
    And an alert sound should play (if enabled)

  @critical @hypotension
  Scenario: Critical alert for severe hypotension
    Given the patient has systolic blood pressure of 82 mmHg
    Then a CRITICAL alert should be displayed:
      """
      🔴 CRITICAL: Severe hypotension - Systolic BP 82 mmHg (Critical threshold: <90)
      Risk of organ hypoperfusion
      """

  @critical @hypertension
  Scenario: Critical alert for hypertensive crisis
    Given the patient has systolic blood pressure of 195 mmHg
    Then a CRITICAL alert should be displayed:
      """
      🔴 CRITICAL: Hypertensive crisis - Systolic BP 195 mmHg (Critical threshold: >180)
      Immediate blood pressure management required
      """

  @critical @bradycardia
  Scenario: Critical alert for severe bradycardia
    Given the patient has heart rate of 35 bpm
    Then a CRITICAL alert should be displayed:
      """
      🔴 CRITICAL: Severe bradycardia - HR 35 bpm (Critical threshold: <40)
      Assess for signs of hemodynamic instability
      """

  @critical @tachycardia
  Scenario: Critical alert for severe tachycardia
    Given the patient has heart rate of 165 bpm
    Then a CRITICAL alert should be displayed:
      """
      🔴 CRITICAL: Severe tachycardia - HR 165 bpm (Critical threshold: >150)
      Assess cardiac rhythm and fluid status
      """

  @critical @hypothermia
  Scenario: Critical alert for severe hypothermia
    Given the patient has temperature of 34.5°C
    Then a CRITICAL alert should be displayed:
      """
      🔴 CRITICAL: Severe hypothermia - Temperature 34.5°C (Critical threshold: <35°C)
      Begin rewarming protocols
      """

  @critical @hyperthermia
  Scenario: Critical alert for severe hyperthermia
    Given the patient has temperature of 40.5°C
    Then a CRITICAL alert should be displayed:
      """
      🔴 CRITICAL: Severe hyperthermia - Temperature 40.5°C (Critical threshold: >40°C)
      Active cooling measures required
      """

  @critical @respiratory
  Scenario Outline: Critical alert for respiratory rate extremes
    Given the patient has respiratory rate of <rate> breaths/min
    Then a CRITICAL alert should be displayed containing "<condition>"

    Examples:
      | rate | condition                     |
      | 6    | Severe bradypnea - RR 6       |
      | 35   | Severe tachypnea - RR 35      |

  # ============================================
  # WARNING ALERTS (ORANGE/YELLOW)
  # ============================================

  @warning @spo2
  Scenario: Warning alert for low oxygen saturation
    Given the patient has SpO2 of 93%
    Then a WARNING alert should be displayed:
      """
      🟠 WARNING: Low oxygen saturation - SpO2 93% (Warning threshold: <95%)
      Monitor closely, consider supplemental oxygen
      """
    And the alert should be styled in orange

  @warning @blood-pressure
  Scenario Outline: Warning alerts for blood pressure
    Given the patient has systolic blood pressure of <systolic> mmHg
    And diastolic blood pressure of <diastolic> mmHg
    Then a WARNING alert should be displayed containing "<message>"

    Examples:
      | systolic | diastolic | message                              |
      | 145      | 88        | Elevated blood pressure - 145/88     |
      | 95       | 65        | Low blood pressure - 95/65           |
      | 130      | 95        | Elevated diastolic - 130/95          |

  @warning @heart-rate
  Scenario Outline: Warning alerts for heart rate
    Given the patient has heart rate of <hr> bpm
    Then a WARNING alert should be displayed containing "<message>"

    Examples:
      | hr  | message                          |
      | 48  | Bradycardia - HR 48 bpm          |
      | 108 | Tachycardia - HR 108 bpm         |

  @warning @temperature
  Scenario Outline: Warning alerts for temperature
    Given the patient has temperature of <temp>°C
    Then a WARNING alert should be displayed containing "<message>"

    Examples:
      | temp | message                           |
      | 35.5 | Low temperature - 35.5°C          |
      | 38.8 | Fever - Temperature 38.8°C        |
      | 39.5 | High fever - Temperature 39.5°C   |

  @warning @respiratory
  Scenario: Warning alert for elevated respiratory rate
    Given the patient has respiratory rate of 26 breaths/min
    Then a WARNING alert should be displayed:
      """
      🟠 WARNING: Tachypnea - Respiratory rate 26/min (Warning threshold: >24)
      Assess respiratory effort and oxygenation
      """

  # ============================================
  # MULTIPLE ALERTS
  # ============================================

  @multiple-alerts
  Scenario: Display multiple alerts for multiple abnormal vitals
    Given the patient has the following vitals:
      | vital           | value |
      | spo2            | 91    |
      | systolic_bp     | 155   |
      | heart_rate      | 112   |
      | temperature     | 38.9  |
    Then the alerts panel should show 4 alerts:
      | type    | message                    |
      | WARNING | Low oxygen saturation      |
      | WARNING | Elevated blood pressure    |
      | WARNING | Tachycardia                |
      | WARNING | Fever                      |

  @alert-priority
  Scenario: Critical alerts are displayed before warnings
    Given the patient has:
      | vital       | value |
      | spo2        | 85    |
      | heart_rate  | 108   |
    Then the alerts should be ordered:
      | priority | type     | message                |
      | 1        | CRITICAL | Severe hypoxemia       |
      | 2        | WARNING  | Tachycardia            |

  # ============================================
  # ALERT PANEL UI
  # ============================================

  @smoke @alert-panel
  Scenario: Alert panel displays summary count
    Given the patient has 2 critical alerts and 3 warnings
    Then the alert panel header should show:
      """
      ⚠️ 5 Alerts (2 Critical, 3 Warnings)
      """
    And the panel should be expanded by default

  @alert-icon
  Scenario Outline: Alert icon reflects severity
    Given the patient has <critical> critical alerts and <warning> warnings
    Then the alert icon should be "<color>" with badge showing "<count>"

    Examples:
      | critical | warning | color  | count |
      | 0        | 0       | green  | 0     |
      | 0        | 2       | orange | 2     |
      | 1        | 0       | red    | 1     |
      | 2        | 3       | red    | 5     |

  @collapse
  Scenario: Alert panel can be collapsed and expanded
    Given the alert panel is expanded
    When I click on the alert panel header
    Then the panel should collapse
    And only the summary count should be visible
    When I click on the header again
    Then the panel should expand
    And all alert details should be visible

  @dismiss
  Scenario: Individual warnings can be acknowledged
    Given the patient has a warning alert "Elevated blood pressure"
    When I click "Acknowledge" on the warning
    Then the warning should be marked as acknowledged
    And it should move to an "Acknowledged" section
    But it should still be visible for reference

  @no-dismiss-critical
  Scenario: Critical alerts cannot be dismissed
    Given the patient has a critical alert "Severe hypoxemia"
    Then the "Acknowledge" button should not be available for critical alerts
    And a tooltip should explain "Critical alerts cannot be dismissed"

  # ============================================
  # THRESHOLD CONFIGURATION
  # ============================================

  @thresholds @admin
  Scenario: Admin can view vital thresholds
    Given I am logged in as an admin user
    When I navigate to "Settings > Triage > Vital Thresholds"
    Then I should see the current threshold values:
      | vital_type      | critical_low | warning_low | warning_high | critical_high |
      | SpO2            | 90           | 95          | -            | -             |
      | Systolic BP     | 90           | 100         | 140          | 180           |
      | Diastolic BP    | -            | -           | 90           | 120           |
      | Heart Rate      | 40           | 50          | 100          | 150           |
      | Temperature     | 35.0         | 36.0        | 38.5         | 40.0          |
      | Respiratory Rate| 8            | 10          | 24           | 30            |

  @thresholds @edit
  Scenario: Admin can modify vital thresholds
    Given I am on the vital thresholds settings page
    When I change SpO2 warning_low from 95 to 94
    And I click "Save Changes"
    Then the threshold should be updated
    And future alerts should use the new threshold

  @thresholds @validation
  Scenario: Threshold validation prevents invalid values
    Given I am editing vital thresholds
    When I set critical_low higher than warning_low
    Then I should see validation error "Critical low must be less than warning low"
    And the form should not save

  # ============================================
  # SOUND & VISUAL NOTIFICATIONS
  # ============================================

  @audio
  Scenario: Critical alert plays audio notification
    Given audio alerts are enabled in settings
    When a patient with SpO2 85% is triaged
    Then a critical alert sound should play
    And the sound should be distinct from warning sounds

  @audio @disable
  Scenario: Audio can be disabled
    Given audio alerts are disabled in settings
    When a critical alert is triggered
    Then no sound should play
    But the visual alert should still appear

  @visual-flash
  Scenario: Critical alert has visual flash
    Given a new critical alert is generated
    Then the alert panel should flash red briefly
    And the alert should pulse for 3 seconds to draw attention

  # ============================================
  # CONTEXTUAL GUIDANCE
  # ============================================

  @guidance
  Scenario: Alerts include clinical guidance
    Given the patient has SpO2 of 88%
    When I view the alert details
    Then I should see:
      | section        | content                                    |
      | Alert          | Severe hypoxemia - SpO2 88%                |
      | Clinical Note  | Consider supplemental oxygen therapy       |
      | Actions        | - Check airway patency                     |
      |                | - Assess breathing effort                  |
      |                | - Consider non-rebreather mask or CPAP     |
      | Reference      | KETA Guidelines - Red Category             |

  @history
  Scenario: View vital trend with alerts
    Given the patient has historical vitals:
      | time  | spo2 |
      | 09:00 | 97   |
      | 09:30 | 94   |
      | 10:00 | 91   |
      | 10:30 | 88   |
    When I view the vital trend chart
    Then I should see a declining SpO2 trend
    And alert markers should be shown at 91% and 88%
    And the trend should indicate "Deteriorating"

  # ============================================
  # NO ALERTS STATE
  # ============================================

  @no-alerts
  Scenario: Display reassuring message when no alerts
    Given all patient vitals are within normal range
    When I view the alert panel
    Then I should see:
      """
      ✅ All vitals within normal limits
      No alerts at this time
      """
    And the panel should show a green indicator

  # ============================================
  # PRINTING & EXPORT
  # ============================================

  @print
  Scenario: Print triage assessment with alerts
    When I click "Print Assessment"
    Then the print preview should include all alerts
    And alerts should be clearly marked with severity
    And timestamp should be included
