@triage @reports @analytics
Feature: Triage Reporting & Analytics
  As a facility manager or quality officer
  I want to view triage performance reports and statistics
  So that I can monitor service quality and make data-driven improvements

  Background:
    Given I am logged in as a user with reporting access
    And I am on the triage reports dashboard

  # ============================================
  # WAIT TIME REPORTS
  # ============================================

  @smoke @wait-times
  Scenario: View wait time summary report
    Given there have been 100 triage assessments in the past 7 days
    When I select date range "Last 7 Days"
    And I view the wait time report
    Then I should see a summary including:
      | metric                    | format      |
      | Total Patients Triaged    | number      |
      | Average Wait Time         | HH:MM       |
      | Median Wait Time          | HH:MM       |
      | Wait Time Target Met %    | percentage  |

  @wait-times @by-category
  Scenario: View wait times broken down by KETA category
    When I view the wait time report by category
    Then I should see wait time statistics for each category:
      | category | target_time | avg_wait | median_wait | exceeded_count | exceeded_% |
      | RED      | 0 min       | 2 min    | 1 min       | 3              | 16.7%      |
      | ORANGE   | 10 min      | 8 min    | 7 min       | 12             | 17.9%      |
      | YELLOW   | 60 min      | 38 min   | 32 min      | 22             | 14.1%      |
      | GREEN    | 240 min     | 85 min   | 75 min      | 8              | 3.3%       |
      | BLUE     | 480 min     | 120 min  | 100 min     | 0              | 0%         |

  @wait-times @exceeded
  Scenario: Identify patients who exceeded wait time targets
    When I filter for "Wait Time Exceeded"
    Then I should see a list of patients who exceeded their category target
    With columns:
      | column           | description                    |
      | Patient          | Name and MRN                   |
      | Category         | KETA category                  |
      | Target           | Wait time target in minutes    |
      | Actual Wait      | Actual wait time               |
      | Exceeded By      | How much they exceeded target  |
      | Date             | Date of assessment             |

  @wait-times @trend
  Scenario: View wait time trends over time
    When I select date range "Last 30 Days"
    And I view the wait time trend chart
    Then I should see a line chart showing:
      | series              | description                       |
      | Average Wait Time   | Daily average across all patients |
      | RED Category        | Daily average for RED             |
      | ORANGE Category     | Daily average for ORANGE          |
    And I should be able to identify peak days

  @wait-times @percentile
  Scenario: View wait time percentiles
    When I view the wait time percentile report
    Then I should see:
      | percentile | wait_time |
      | 25th       | 15 min    |
      | 50th       | 35 min    |
      | 75th       | 65 min    |
      | 90th       | 120 min   |
      | 95th       | 180 min   |

  # ============================================
  # VOLUME REPORTS
  # ============================================

  @smoke @volume
  Scenario: View triage volume summary
    When I view the volume report for "Last 30 Days"
    Then I should see:
      | metric                  | value format |
      | Total Assessments       | number       |
      | Daily Average           | number       |
      | Busiest Day             | date + count |
      | Busiest Hour            | hour + count |
      | Peak Category           | category     |

  @volume @by-category
  Scenario: View volume breakdown by KETA category
    When I view the category volume report
    Then I should see a donut chart showing:
      | category | count | percentage |
      | RED      | 18    | 3.4%       |
      | ORANGE   | 67    | 12.8%      |
      | YELLOW   | 156   | 29.8%      |
      | GREEN    | 245   | 46.8%      |
      | BLUE     | 37    | 7.1%       |
    And the total should equal 523

  @volume @by-area
  Scenario: View volume breakdown by assigned care area
    When I view the area volume report
    Then I should see a bar chart showing patient counts per area:
      | area               | count |
      | ER - Acute Care    | 187   |
      | ER - Fast Track    | 89    |
      | OPD                | 156   |
      | ER - Resuscitation | 45    |
      | Other              | 46    |

  @volume @hourly
  Scenario: View hourly volume distribution
    When I view the hourly distribution chart
    Then I should see a histogram of triage assessments by hour
    And I should be able to identify:
      | insight            | example                     |
      | Peak hours         | 9 AM - 11 AM                |
      | Quiet hours        | 2 AM - 5 AM                 |
      | Lunch dip          | 12 PM - 1 PM (if present)   |

  @volume @daily
  Scenario: View daily volume by day of week
    When I view the day-of-week distribution
    Then I should see a bar chart showing:
      | day       | avg_volume |
      | Monday    | 85         |
      | Tuesday   | 78         |
      | Wednesday | 72         |
      | Thursday  | 74         |
      | Friday    | 80         |
      | Saturday  | 65         |
      | Sunday    | 55         |

  # ============================================
  # LWBS (LEFT WITHOUT BEING SEEN) REPORTS
  # ============================================

  @lwbs
  Scenario: View LWBS rate and trends
    When I view the LWBS report
    Then I should see:
      | metric              | value format |
      | Total LWBS          | number       |
      | LWBS Rate           | percentage   |
      | LWBS by Category    | breakdown    |
      | Avg Wait Before LWBS| time         |
      | Top LWBS Reasons    | list         |

  @lwbs @by-category
  Scenario: View LWBS rate by category
    When I view LWBS breakdown by category
    Then I should see:
      | category | lwbs_count | lwbs_rate | avg_wait_before_lwbs |
      | RED      | 0          | 0%        | N/A                  |
      | ORANGE   | 2          | 3%        | 25 min               |
      | YELLOW   | 8          | 5.1%      | 95 min               |
      | GREEN    | 15         | 6.1%      | 180 min              |
      | BLUE     | 5          | 13.5%     | 240 min              |

  @lwbs @reasons
  Scenario: View LWBS reasons breakdown
    When I view LWBS reasons
    Then I should see:
      | reason                         | count | percentage |
      | Long wait time                 | 12    | 40%        |
      | Felt better, decided to leave  | 6     | 20%        |
      | Emergency resolved elsewhere   | 5     | 16.7%      |
      | Could not wait any longer      | 4     | 13.3%      |
      | Other                          | 3     | 10%        |

  # ============================================
  # NURSE PERFORMANCE METRICS
  # ============================================

  @performance @triage-time
  Scenario: View average triage assessment time
    When I view the triage time report
    Then I should see:
      | metric                      | value  |
      | Average Triage Duration     | 4:32   |
      | Median Triage Duration      | 3:45   |
      | Target (< 5 min)            | 5:00   |
      | Assessments Meeting Target  | 78%    |

  @performance @by-nurse
  Scenario: View triage metrics by nurse (if permitted)
    Given I have permission to view staff performance
    When I view the nurse performance report
    Then I should see metrics per triage nurse:
      | nurse             | assessments | avg_duration | target_met |
      | Nurse Wanjiku     | 145         | 4:15         | 82%        |
      | Nurse Omondi      | 132         | 5:02         | 68%        |
      | Nurse Achieng     | 128         | 3:58         | 89%        |

  @performance @override
  Scenario: View category override statistics
    When I view the override report
    Then I should see:
      | metric                     | value  |
      | Total Overrides            | 45     |
      | Override Rate              | 8.6%   |
      | Upgraded (more urgent)     | 32     |
      | Downgraded (less urgent)   | 13     |
      | Most Common Override       | YELLOW→ORANGE |

  # ============================================
  # ALERTS & OUTCOMES
  # ============================================

  @alerts-report
  Scenario: View critical alert statistics
    When I view the alerts report
    Then I should see:
      | alert_type              | count | percentage |
      | Severe Hypoxemia        | 23    | 4.4%       |
      | Hypertensive Crisis     | 15    | 2.9%       |
      | Severe Tachycardia      | 12    | 2.3%       |
      | Severe Bradycardia      | 5     | 1.0%       |
      | Any Critical Alert      | 55    | 10.5%      |

  @outcomes
  Scenario: View triage outcomes
    When I view the outcomes report
    Then I should see patient disposition after triage:
      | outcome              | count | percentage |
      | Treated and Released | 380   | 72.7%      |
      | Admitted (IPD)       | 85    | 16.3%      |
      | Transferred          | 12    | 2.3%       |
      | LWBS                 | 30    | 5.7%       |
      | Deceased in ER       | 3     | 0.6%       |
      | Other                | 13    | 2.5%       |

  # ============================================
  # DATE RANGE & FILTERING
  # ============================================

  @date-range
  Scenario Outline: Select predefined date ranges
    When I select date range "<range>"
    Then the report should show data for "<description>"

    Examples:
      | range        | description                           |
      | Today        | Current day only                      |
      | Yesterday    | Previous day only                     |
      | Last 7 Days  | Past 7 days including today           |
      | Last 30 Days | Past 30 days including today          |
      | This Month   | Current calendar month                |
      | Last Month   | Previous calendar month               |
      | This Quarter | Current quarter                       |
      | Custom       | User-selected start and end dates     |

  @custom-date
  Scenario: Select custom date range
    When I click "Custom" date range
    And I set start date to "2026-01-01"
    And I set end date to "2026-01-15"
    And I click "Apply"
    Then the report should show data for January 1-15, 2026

  @filter @area
  Scenario: Filter reports by care area
    When I select area filter "ER - Acute Care"
    Then all report data should be filtered to only ER - Acute Care patients
    And a filter indicator should show "Filtered by: ER - Acute Care"

  @filter @category
  Scenario: Filter reports by triage category
    When I select category filter "RED, ORANGE"
    Then all report data should only include RED and ORANGE patients
    And the filter indicator should show active filters

  @filter @shift
  Scenario: Filter reports by shift
    When I select shift filter "Day Shift (7 AM - 3 PM)"
    Then all report data should only include assessments from day shift hours

  # ============================================
  # EXPORT & SHARING
  # ============================================

  @export @pdf
  Scenario: Export report as PDF
    Given I am viewing the wait time report
    When I click "Export" and select "PDF"
    Then a PDF should be generated with:
      | element              | included |
      | Report Title         | Yes      |
      | Date Range           | Yes      |
      | Summary Statistics   | Yes      |
      | Charts               | Yes      |
      | Detailed Table       | Yes      |
      | Generated Timestamp  | Yes      |
      | Facility Name        | Yes      |

  @export @excel
  Scenario: Export report as Excel
    Given I am viewing the volume report
    When I click "Export" and select "Excel"
    Then an Excel file should be downloaded with:
      | sheet             | content                    |
      | Summary           | High-level metrics         |
      | Category Detail   | Volume by category         |
      | Hourly Detail     | Volume by hour             |
      | Raw Data          | Individual assessments     |

  @export @csv
  Scenario: Export raw data as CSV
    When I click "Export" and select "CSV"
    Then a CSV file should be downloaded
    With one row per triage assessment
    And all relevant fields included

  @print
  Scenario: Print report
    When I click "Print"
    Then a print-optimized view should open
    With charts rendered for printing
    And page breaks at appropriate locations

  @schedule
  Scenario: Schedule automated report delivery
    Given I have permission to schedule reports
    When I click "Schedule Report"
    And I configure:
      | field       | value                    |
      | Frequency   | Weekly                   |
      | Day         | Monday                   |
      | Time        | 8:00 AM                  |
      | Recipients  | manager@facility.co.ke   |
      | Format      | PDF                      |
    And I click "Save Schedule"
    Then the report should be scheduled
    And I should receive a confirmation

  # ============================================
  # DASHBOARD VIEW
  # ============================================

  @smoke @dashboard
  Scenario: View triage KPI dashboard
    When I navigate to the triage dashboard
    Then I should see key metrics cards:
      | card                    | value_type |
      | Patients Today          | count      |
      | Avg Wait Time Today     | time       |
      | LWBS Rate (7 days)      | percentage |
      | Critical Alerts Today   | count      |
    And I should see trend indicators (up/down arrows)

  @dashboard @realtime
  Scenario: Dashboard shows real-time updates
    Given I am viewing the triage dashboard
    When a new triage assessment is completed
    Then the "Patients Today" count should increment
    And the average wait time should recalculate

  @dashboard @comparison
  Scenario: Compare current metrics to previous period
    When I view the dashboard
    Then each metric card should show:
      | element              | example              |
      | Current Value        | 45 patients          |
      | Change from Previous | +5 vs last week      |
      | Trend Indicator      | ↑ (green) or ↓ (red) |

  # ============================================
  # BENCHMARKING
  # ============================================

  @benchmark
  Scenario: Compare facility performance to benchmarks
    Given benchmark data is available
    When I view the benchmark comparison report
    Then I should see:
      | metric                | facility | benchmark | status    |
      | Avg Wait Time         | 42 min   | 45 min    | ✅ Better |
      | LWBS Rate             | 5.7%     | 5%        | ⚠️ Watch  |
      | Triage Time           | 4:32     | 5:00      | ✅ Better |
      | Critical Alert Rate   | 10.5%    | 8%        | ⚠️ Higher |

  # ============================================
  # PERMISSIONS
  # ============================================

  @permissions
  Scenario: Reports respect user permissions
    Given I am a triage nurse without manager permissions
    When I access the reports section
    Then I should see:
      | report              | accessible |
      | Wait Time Summary   | Yes        |
      | Volume by Category  | Yes        |
      | Nurse Performance   | No         |
      | Staff Comparison    | No         |
    And restricted reports should show "Access Restricted"
