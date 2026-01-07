@pharmacy @reports
Feature: Pharmacy Reports and Analytics
  As a pharmacist, pharmacy manager, or administrator
  I want to generate reports on pharmacy operations
  So that I can monitor inventory, track dispensing patterns, and make informed decisions

  Background:
    Given I am logged in as a user with "pharmacy.view_reports" permission
    And I am on the pharmacy reports page

  # ============================================
  # STOCK SUMMARY REPORT
  # ============================================

  @smoke @stock-summary
  Scenario: Generate current stock summary report
    When I generate a stock summary report
    Then I should see:
      | metric               | description                    |
      | Total Drugs          | Count of unique drugs in stock |
      | Total Units          | Sum of all available units     |
      | Total Value          | Sum of stock value (KES)       |
      | Low Stock Items      | Count below reorder level      |
      | Out of Stock Items   | Count with zero stock          |
      | Expiring Soon (90d)  | Count expiring within 90 days  |

  @stock-summary @breakdown
  Scenario: View stock by category breakdown
    When I view stock summary by category
    Then I should see breakdown:
      | category         | drugs | units | value      |
      | Analgesics       | 5     | 2000  | KES 50,000 |
      | Antibiotics      | 12    | 3500  | KES 120,000|
      | Antimalarials    | 4     | 1500  | KES 45,000 |
      | Antidiabetics    | 6     | 800   | KES 35,000 |

  @stock-summary @schedule
  Scenario: View stock by schedule breakdown
    When I view stock summary by drug schedule
    Then I should see breakdown:
      | schedule           | drugs | units |
      | OTC                | 15    | 5000  |
      | Prescription Only  | 45    | 8000  |
      | Pharmacy Only      | 8     | 1500  |
      | Controlled         | 5     | 200   |

  # ============================================
  # EXPIRY REPORT
  # ============================================

  @expiry @report
  Scenario: Generate expiry report
    When I generate an expiry report
    Then I should see batches grouped by expiry status:
      | status             | description               |
      | Expired            | Already expired           |
      | Critical (0-30d)   | Expiring within 30 days   |
      | Warning (31-60d)   | Expiring within 31-60 days|
      | Notice (61-90d)    | Expiring within 61-90 days|

  @expiry @value
  Scenario: Show value at risk from expiry
    When I view the expiry report
    Then I should see:
      | period      | units | value at risk |
      | Expired     | 50    | KES 2,500     |
      | 0-30 days   | 200   | KES 8,000     |
      | 31-60 days  | 350   | KES 12,000    |
      | 61-90 days  | 500   | KES 18,000    |
      | Total       | 1100  | KES 40,500    |

  @expiry @action
  Scenario: Export expiry report for action
    Given expiry report is generated
    When I click "Export for Action"
    Then I should receive a report with:
      | field          |
      | Drug Name      |
      | Batch Number   |
      | Quantity       |
      | Expiry Date    |
      | Days Remaining |
      | Value          |
      | Suggested Action|

  # ============================================
  # DISPENSING REPORTS
  # ============================================

  @smoke @dispensing
  Scenario: Generate daily dispensing report
    When I generate a dispensing report for today
    Then I should see:
      | metric              | description              |
      | Total Dispensings   | Count of dispensing acts |
      | Total Items         | Sum of items dispensed   |
      | Total Value         | Sum of dispensing value  |
      | Prescriptions Filled| Count of Rx dispensed    |
      | OTC Sales           | Count of OTC dispensings |

  @dispensing @period
  Scenario Outline: Generate dispensing report by period
    When I select report period "<period>"
    And I generate the dispensing report
    Then the report should cover "<period>" timeframe
    And data should be aggregated appropriately

    Examples:
      | period     |
      | Today      |
      | This Week  |
      | This Month |
      | Last Month |
      | Custom     |

  @dispensing @by-drug
  Scenario: View dispensing report by drug
    When I view dispensing by drug
    Then I should see top dispensed drugs:
      | rank | drug              | quantity | value      |
      | 1    | Paracetamol 500mg | 2500     | KES 20,000 |
      | 2    | Amoxicillin 500mg | 1800     | KES 36,000 |
      | 3    | Artemether-Lumef. | 1200     | KES 72,000 |

  @dispensing @by-pharmacist
  Scenario: View dispensing report by pharmacist
    When I view dispensing by pharmacist
    Then I should see:
      | pharmacist       | dispensings | items | value      |
      | John Pharmacist  | 45          | 120   | KES 25,000 |
      | Mary Pharmacist  | 38          | 95    | KES 21,000 |

  @dispensing @trends
  Scenario: View dispensing trends over time
    When I view dispensing trends for the last 30 days
    Then I should see a graph showing:
      | data point        |
      | Daily dispensings |
      | Moving average    |
      | Peak days         |
      | Low days          |

  # ============================================
  # STOCK MOVEMENT REPORT
  # ============================================

  @movement
  Scenario: Generate stock movement report
    Given I select a date range
    When I generate a stock movement report
    Then I should see movements categorized by:
      | movement_type    | description                |
      | RECEIVED         | Stock received             |
      | DISPENSED        | Dispensed to patients      |
      | DAMAGED          | Recorded as damaged        |
      | EXPIRED          | Marked as expired          |
      | ADJUSTED         | Count corrections          |
      | RETURNED         | Returns from patients      |
      | TRANSFER         | Inter-facility transfers   |

  @movement @drug
  Scenario: View movement for specific drug
    Given I select drug "Paracetamol 500mg"
    When I view stock movements
    Then I should see all movements for that drug:
      | date       | type      | quantity | balance |
      | 2026-01-01 | RECEIVED  | +500     | 500     |
      | 2026-01-03 | DISPENSED | -50      | 450     |
      | 2026-01-05 | DISPENSED | -30      | 420     |
      | 2026-01-06 | DAMAGED   | -10      | 410     |

  @movement @variance
  Scenario: Identify stock variances
    When I run stock variance analysis
    Then I should see:
      | drug           | expected | actual | variance | status |
      | Paracetamol    | 500      | 485    | -15      | Review |
      | Amoxicillin    | 300      | 300    | 0        | OK     |

  # ============================================
  # PRESCRIPTION REPORTS
  # ============================================

  @prescription @report
  Scenario: Generate prescription report
    When I generate a prescription report for the month
    Then I should see:
      | metric                  | value |
      | Total Prescriptions     | 450   |
      | Fully Dispensed         | 380   |
      | Partially Dispensed     | 45    |
      | Pending                 | 15    |
      | Cancelled               | 10    |
      | Expired                 | 0     |

  @prescription @turnaround
  Scenario: View prescription turnaround time
    When I view prescription turnaround metrics
    Then I should see:
      | metric                     | value     |
      | Average wait time          | 12 min    |
      | Median wait time           | 8 min     |
      | 90th percentile            | 25 min    |
      | Prescriptions > 30 min     | 12        |

  @prescription @prescriber
  Scenario: View prescriptions by prescriber
    When I view prescriptions grouped by prescriber
    Then I should see:
      | prescriber    | prescriptions | items | avg_items |
      | Dr. Ochieng   | 85            | 210   | 2.5       |
      | Dr. Wanjiku   | 72            | 165   | 2.3       |

  # ============================================
  # CONTROLLED DRUGS REPORT
  # ============================================

  @controlled @register
  Scenario: Generate controlled drugs register report
    When I generate the controlled drugs report
    Then I should see detailed register with:
      | field              |
      | Date/Time          |
      | Drug Name          |
      | Batch Number       |
      | Patient Name       |
      | Patient ID         |
      | Quantity           |
      | Dispensing Pharm   |
      | Verifying Pharm    |
      | Running Balance    |

  @controlled @balance
  Scenario: View controlled drug balances
    When I view controlled drug balances
    Then I should see:
      | drug              | opening | received | dispensed | closing | variance |
      | Morphine 10mg     | 100     | 50       | 35        | 115     | 0        |
      | Tramadol 50mg     | 200     | 0        | 45        | 155     | 0        |
      | Codeine 30mg      | 80      | 100      | 60        | 120     | 0        |

  @controlled @audit
  Scenario: Export controlled drugs audit report
    When I export controlled drugs audit
    Then the report should include:
      | section                |
      | Opening balances       |
      | All transactions       |
      | Closing balances       |
      | Variance explanation   |
      | Verification signatures|

  # ============================================
  # SUPPLIER REPORTS
  # ============================================

  @supplier
  Scenario: Generate supplier performance report
    When I generate supplier report
    Then I should see:
      | supplier         | orders | value      | on_time | quality_issues |
      | Kenya Pharma     | 12     | KES 500,000| 95%     | 1              |
      | Med Supplies Ltd | 8      | KES 320,000| 88%     | 2              |

  @supplier @stock-by
  Scenario: View stock value by supplier
    When I view stock by supplier
    Then I should see:
      | supplier         | items | units | value      | % of total |
      | Kenya Pharma     | 45    | 5000  | KES 250,000| 45%        |
      | Med Supplies Ltd | 30    | 3000  | KES 180,000| 32%        |
      | Generic Imports  | 25    | 2500  | KES 130,000| 23%        |

  # ============================================
  # FINANCIAL REPORTS
  # ============================================

  @financial @revenue
  Scenario: Generate pharmacy revenue report
    When I generate pharmacy revenue report
    Then I should see:
      | period     | dispensing_value | cost   | gross_margin |
      | January    | KES 500,000      | 350,000| KES 150,000  |
      | February   | KES 480,000      | 336,000| KES 144,000  |

  @financial @cost
  Scenario: View cost of goods sold report
    When I view COGS report
    Then I should see:
      | category      | opening    | purchases | dispensed  | closing    |
      | Analgesics    | KES 50,000 | 30,000    | 45,000     | KES 35,000 |
      | Antibiotics   | KES 80,000 | 60,000    | 70,000     | KES 70,000 |

  @financial @waste
  Scenario: View waste and loss report
    When I generate waste report
    Then I should see:
      | waste_type | quantity | value      | % of stock |
      | Expired    | 150      | KES 5,000  | 0.5%       |
      | Damaged    | 50       | KES 2,000  | 0.2%       |
      | Lost       | 20       | KES 800    | 0.08%      |
      | Total      | 220      | KES 7,800  | 0.78%      |

  # ============================================
  # KEML COMPLIANCE REPORT
  # ============================================

  @keml @availability
  Scenario: Generate KEML availability report
    When I generate KEML availability report
    Then I should see:
      | metric                          | value |
      | Total KEML drugs in catalog     | 85    |
      | KEML drugs in stock             | 78    |
      | KEML drugs out of stock         | 7     |
      | KEML availability rate          | 91.8% |

  @keml @gap
  Scenario: Identify KEML gaps
    When I view KEML gaps
    Then I should see drugs on KEML but out of stock:
      | keml_code | drug              | category    | days_out |
      | 06.02.05  | Ciprofloxacin     | Antibiotic  | 5        |
      | 02.03.01  | Ibuprofen         | Analgesic   | 3        |

  # ============================================
  # EXPORT & PRINTING
  # ============================================

  @export @csv
  Scenario: Export report to CSV
    Given a report is generated
    When I click "Export to CSV"
    Then a CSV file should be downloaded
    And it should contain all report data
    And column headers should be included

  @export @pdf
  Scenario: Export report to PDF
    Given a report is generated
    When I click "Export to PDF"
    Then a PDF file should be generated
    And it should include facility header
    And it should include generation date
    And it should be formatted for printing

  @export @excel
  Scenario: Export report to Excel
    Given a report is generated
    When I click "Export to Excel"
    Then an Excel file should be downloaded
    And formulas should be preserved where applicable

  @print
  Scenario: Print report
    Given a report is displayed
    When I click "Print"
    Then print-friendly version should be prepared
    And unnecessary navigation should be hidden
    And print dialog should open

  # ============================================
  # SCHEDULED REPORTS
  # ============================================

  @schedule
  Scenario: Schedule automatic report generation
    When I configure scheduled reports:
      | report        | frequency | recipients           |
      | Stock Summary | Daily     | pharmacy@facility    |
      | Expiry Report | Weekly    | manager@facility     |
      | Controlled    | Monthly   | compliance@facility  |
    Then reports should be generated automatically
    And emailed to specified recipients

  @schedule @custom
  Scenario: Create custom scheduled report
    When I create a custom scheduled report:
      | field       | value                    |
      | Name        | Weekly Antimalarials     |
      | Content     | Stock and dispensing     |
      | Filter      | Category = Antimalarial  |
      | Schedule    | Every Monday 8:00 AM     |
    Then the custom report should run as scheduled

  # ============================================
  # PERMISSIONS
  # ============================================

  @permissions
  Scenario: Report access based on role
    Given different user roles exist
    Then report access should be:
      | role              | stock | dispensing | controlled | financial |
      | Pharmacist        | Yes   | Yes        | Yes        | No        |
      | Pharmacy Manager  | Yes   | Yes        | Yes        | Yes       |
      | Administrator     | Yes   | Yes        | Yes        | Yes       |
      | Stock Controller  | Yes   | No         | No         | No        |
