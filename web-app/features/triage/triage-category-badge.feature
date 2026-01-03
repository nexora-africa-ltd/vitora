@triage @category @badge
Feature: Triage Category Badge Component
  As a healthcare provider
  I want to see clearly distinguishable triage category badges
  So that I can quickly identify patient priority levels

  Background:
    Given the application is loaded

  # ============================================
  # VISUAL APPEARANCE
  # ============================================

  @smoke @colors
  Scenario Outline: Category badges display correct colors
    Given a patient has triage category "<category>"
    When the category badge is rendered
    Then the badge background color should be "<bg_color>"
    And the badge text color should be "<text_color>"
    And the badge should have appropriate contrast ratio (≥4.5:1)

    Examples:
      | category | bg_color       | text_color |
      | RED      | #DC2626 (red)  | white      |
      | ORANGE   | #F97316 (orange)| white     |
      | YELLOW   | #EAB308 (yellow)| black     |
      | GREEN    | #22C55E (green)| white      |
      | BLUE     | #3B82F6 (blue) | white      |

  @labels
  Scenario Outline: Category badges display correct labels
    Given a patient has triage category "<category>"
    When the category badge is rendered with size "default"
    Then the badge should display "<short_label>"
    And the badge title attribute should show "<full_label>"

    Examples:
      | category | short_label | full_label              |
      | RED      | RED         | Emergency - Immediate   |
      | ORANGE   | ORANGE      | Very Urgent - <10 min   |
      | YELLOW   | YELLOW      | Urgent - <60 min        |
      | GREEN    | GREEN       | Standard - <240 min     |
      | BLUE     | BLUE        | Non-Urgent/Referral     |

  @sizes
  Scenario Outline: Category badges support multiple sizes
    Given a patient has triage category "RED"
    When the badge is rendered with size "<size>"
    Then the badge should have height "<height>"
    And font size should be "<font_size>"

    Examples:
      | size   | height | font_size |
      | sm     | 20px   | 12px      |
      | default| 24px   | 14px      |
      | lg     | 32px   | 16px      |
      | xl     | 40px   | 18px      |

  @icon
  Scenario Outline: Category badges include severity icon
    Given a patient has triage category "<category>"
    When the badge is rendered with icons enabled
    Then the badge should include "<icon>" icon

    Examples:
      | category | icon           |
      | RED      | alert-circle   |
      | ORANGE   | alert-triangle |
      | YELLOW   | clock          |
      | GREEN    | check-circle   |
      | BLUE     | info           |

  # ============================================
  # ACCESSIBILITY
  # ============================================

  @a11y @screen-reader
  Scenario: Badge is accessible to screen readers
    Given a patient has triage category "RED"
    When the badge is rendered
    Then it should have aria-label "Triage Category: Emergency - Immediate"
    And it should have role "status"

  @a11y @color-blind
  Scenario: Badge is distinguishable for color-blind users
    Given color-blind mode is enabled
    When category badges are displayed
    Then each badge should include a pattern or icon
    So categories are distinguishable without color alone

  @a11y @keyboard
  Scenario: Badge tooltip is keyboard accessible
    Given a badge with tooltip is displayed
    When I focus the badge with keyboard
    Then the tooltip should appear
    And I should be able to dismiss it with Escape

  # ============================================
  # INTERACTIVE STATES
  # ============================================

  @hover
  Scenario: Badge shows expanded info on hover
    Given a patient has triage category "ORANGE"
    When I hover over the category badge
    Then a tooltip should appear showing:
      """
      Very Urgent
      Target wait time: <10 minutes
      """

  @click
  Scenario: Clickable badge navigates to triage details
    Given a badge is configured as clickable
    And patient "John Kamau" has triage category "YELLOW"
    When I click on the category badge
    Then I should be navigated to the triage assessment details

  # ============================================
  # PULSE ANIMATION
  # ============================================

  @animation @critical
  Scenario: RED category badge pulses for attention
    Given a patient has triage category "RED"
    When the badge is first rendered
    Then the badge should have a subtle pulse animation
    For the first 5 seconds

  @animation @new
  Scenario: New assessments show brief highlight
    Given a triage assessment was just completed
    When the badge appears in the queue
    Then it should have a brief glow animation
    To indicate it's newly added

  # ============================================
  # DARK MODE
  # ============================================

  @dark-mode
  Scenario Outline: Badges maintain visibility in dark mode
    Given dark mode is enabled
    And a patient has triage category "<category>"
    When the badge is rendered
    Then the badge should use "<dark_bg_color>"
    And maintain sufficient contrast

    Examples:
      | category | dark_bg_color        |
      | RED      | #EF4444 (brighter)   |
      | ORANGE   | #FB923C (brighter)   |
      | YELLOW   | #FACC15 (brighter)   |
      | GREEN    | #4ADE80 (brighter)   |
      | BLUE     | #60A5FA (brighter)   |

  # ============================================
  # EDGE CASES
  # ============================================

  @unknown-category
  Scenario: Handle unknown category gracefully
    Given a patient has an invalid category value "PURPLE"
    When the badge is rendered
    Then the badge should display "UNKNOWN"
    With a gray background
    And an error should be logged

  @loading
  Scenario: Badge shows loading state
    Given triage data is being fetched
    When the badge component mounts
    Then it should show a skeleton loader
    With appropriate size

  @empty
  Scenario: Handle missing category
    Given a patient has no triage category assigned
    When the badge component is rendered
    Then it should display "Not Triaged"
    With a gray/muted style
