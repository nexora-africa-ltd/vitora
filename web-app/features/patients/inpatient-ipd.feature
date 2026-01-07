@patients @ipd @inpatient
Feature: Inpatient (IPD) Admission and Ward Management
  As a healthcare worker (receptionist, nurse, or doctor)
  I want to manage inpatient admissions, ward care, and discharges
  So that patients receive continuous inpatient care with proper documentation

  Background:
    Given I am logged in as a user with inpatient permissions
    And I am on the inpatient department page

  # ============================================
  # ADMISSION PROCESSING
  # ============================================

  @smoke @admission
  Scenario: Process inpatient admission from OPD recommendation
    Given patient "Jane Wanjiku" has admission recommendation from Dr. Ochieng
    And the patient agrees to inpatient admission
    When I process the admission:
      | field            | value                               |
      | Ward             | Medical Ward                        |
      | Bed              | M-15                                |
      | Admission Reason | Severe malaria requiring IV treatment|
    And I click "Complete Admission"
    Then an inpatient admission should be created
    And bed M-15 status should change to "OCCUPIED"
    And an IPD encounter should be created
    And all OPD data should be preserved and linked
    And audit log should record "patient_admitted"

  @admission @bed-selection
  Scenario: Select bed during admission
    Given Medical Ward has available beds
    When I view bed selection
    Then I should see:
      | bed  | status    |
      | M-12 | Available |
      | M-13 | Occupied  |
      | M-14 | Maintenance|
      | M-15 | Available |
    When I select bed "M-15"
    Then the bed should be reserved for this patient

  @admission @no-beds
  Scenario: Handle no available beds
    Given all beds in Medical Ward are occupied
    When I try to admit patient
    Then I should see "No beds available in Medical Ward"
    And I should see options:
      | option                     |
      | View other wards           |
      | Add to admission waitlist  |
      | Request bed transfer       |

  @admission @waitlist
  Scenario: Add patient to admission waitlist
    Given no beds are available
    When I add patient to admission waitlist
    And I set priority "Urgent"
    Then patient should be added to waitlist
    And waitlist position should be shown
    And I should be notified when bed becomes available

  @admission @decline
  Scenario: Patient declines admission
    Given patient has admission recommendation
    When patient declines admission
    And I select reason "Financial constraints"
    Then the encounter should remain as OPD
    And decline reason should be documented
    And audit log should record "admission_declined"

  @admission @insurance
  Scenario: Verify insurance during admission
    Given patient has SHA insurance
    When I process admission
    Then insurance eligibility should be verified
    And coverage details should be displayed
    And pre-authorization should be requested if required

  # ============================================
  # WARD MANAGEMENT
  # ============================================

  @smoke @ward
  Scenario: View ward occupancy dashboard
    When I view the ward dashboard
    Then I should see all wards with:
      | metric         | example      |
      | Ward Name      | Medical Ward |
      | Total Beds     | 20           |
      | Occupied       | 18           |
      | Available      | 2            |
      | Maintenance    | 0            |
      | Occupancy Rate | 90%          |

  @ward @types
  Scenario Outline: Different ward types available
    When I view ward "<ward>"
    Then the ward should be of type "<type>"
    And daily bed charge should be "<rate>"

    Examples:
      | ward           | type       | rate       |
      | Medical Ward   | Medical    | KES 2,000  |
      | Surgical Ward  | Surgical   | KES 2,500  |
      | Pediatric Ward | Pediatric  | KES 1,800  |
      | Maternity Ward | Maternity  | KES 2,000  |
      | ICU            | Intensive  | KES 10,000 |
      | Isolation Ward | Isolation  | KES 3,000  |

  @ward @bed-management
  Scenario: Manage bed status
    Given I have ward management permission
    When I change bed M-16 status to "Maintenance"
    And I add reason "Mattress replacement"
    Then bed status should update to "MAINTENANCE"
    And bed should not be available for admission
    And maintenance record should be created

  @ward @real-time
  Scenario: Real-time bed status updates
    Given I am viewing the ward dashboard
    When a patient is discharged from bed M-15
    Then the dashboard should update automatically
    And bed M-15 should show as "Available"
    And occupancy count should decrease

  # ============================================
  # PATIENT CHART (IPD)
  # ============================================

  @chart @view
  Scenario: View inpatient chart
    Given patient "Jane Wanjiku" is admitted
    When I open the patient chart
    Then I should see:
      | section            | content                    |
      | Patient Info       | Name, MRN, Age, Gender     |
      | Admission Info     | Date, Ward, Bed, Diagnosis |
      | Vital Signs        | Latest vitals with trends  |
      | OPD History        | Pre-admission encounter    |
      | Current Orders     | Medications, Labs, Diet    |
      | Nursing Kardex     | Care plan and tasks        |
      | Ward Rounds        | Daily progress notes       |

  @chart @continuity
  Scenario: OPD to IPD documentation continuity
    Given patient was recommended for admission from OPD
    When I view the inpatient chart
    Then I should see pre-admission data:
      | data              |
      | OPD vitals        |
      | Chief complaint   |
      | OPD diagnosis     |
      | Lab results       |
      | Prescriptions     |
    And data should flow seamlessly without re-entry

  # ============================================
  # WARD ROUNDS
  # ============================================

  @smoke @rounds
  Scenario: Document daily ward round
    Given patient is admitted
    When I create a ward round note:
      | field           | value                          |
      | Clinical Findings| Patient improved, fever resolved|
      | Assessment      | Responding well to treatment   |
      | Plan            | Continue IV antimalarials      |
      | Condition Status| Improving                      |
    Then the ward round should be recorded
    And it should appear in patient timeline
    And timestamp and clinician should be recorded

  @rounds @condition
  Scenario Outline: Document patient condition status
    When I record condition status as "<status>"
    Then the status should be displayed in patient header
    And status color should be "<color>"

    Examples:
      | status        | color  |
      | Stable        | green  |
      | Improving     | blue   |
      | Deteriorating | orange |
      | Critical      | red    |

  @rounds @consultant
  Scenario: Flag patient for consultant review
    Given patient condition is deteriorating
    When I flag for consultant review
    And I select specialty "Internal Medicine"
    And I add reason "Not responding to treatment"
    Then consultant should be notified
    And flag should appear on patient chart

  @rounds @orders
  Scenario: Update orders during ward round
    When I update treatment during ward round:
      | action    | item                    |
      | Continue  | IV Quinine              |
      | Add       | IV Fluids Normal Saline |
      | Stop      | Oral Paracetamol        |
    Then orders should be updated
    And pharmacy should be notified of changes
    And nursing kardex should update

  # ============================================
  # NURSING KARDEX
  # ============================================

  @smoke @kardex
  Scenario: View nursing kardex
    Given patient is admitted
    When I view the nursing kardex
    Then I should see sections:
      | section          | content                          |
      | Patient Snapshot | Name, age, diagnosis, allergies  |
      | Medical Orders   | Active medications, IV fluids    |
      | Nursing Care Plan| Problems, interventions          |
      | Observations     | Latest vitals, alerts            |
      | Shift Notes      | Nursing narrative                |
      | Handover Notes   | Items for next shift             |

  @kardex @orders-display
  Scenario: Medical orders displayed in kardex
    Given doctor has ordered medications
    When nurse views the kardex
    Then current orders should be visible:
      | order type   | details                    |
      | Medications  | IV Artesunate 120mg BD     |
      | IV Fluids    | Normal Saline 1L over 8hrs |
      | Diet         | Light diet as tolerated    |
      | Activity     | Bed rest                   |
    And orders should be read-only for nurses

  @kardex @care-plan
  Scenario: Document nursing care plan
    When I add to nursing care plan:
      | problem        | intervention              | frequency |
      | Fever          | Monitor temperature       | 4 hourly  |
      | Risk of falls  | Bed rails up              | Continuous|
      | IV site care   | Check for phlebitis       | Every shift|
    Then care plan should be saved
    And tasks should appear in shift tasks

  @kardex @shift-notes
  Scenario: Add shift nursing notes
    When I add shift note:
      """
      Patient rested well overnight. Temperature 37.2°C, 
      down from 38.5°C yesterday. IV site clean, no signs 
      of infection. Patient took oral fluids well.
      """
    And I select shift "Night"
    Then shift note should be recorded
    And my name and timestamp should be recorded

  @kardex @alerts
  Scenario: Display alerts in kardex
    Given patient has critical values
    Then kardex should display alerts:
      | alert type      | message                |
      | Allergy         | Penicillin - Rash      |
      | Fall Risk       | High risk - age 75+    |
      | Isolation       | Contact precautions    |

  # ============================================
  # SHIFT HANDOVER
  # ============================================

  @smoke @handover
  Scenario: Complete shift handover
    Given I am ending my shift
    When I create handover notes for patient:
      | field          | value                              |
      | Current Status | Stable, fever resolving            |
      | Pending Items  | 6AM vitals, IV change at 8AM       |
      | Concerns       | Monitor for allergic reaction      |
    And I complete handover
    Then handover should be recorded
    And incoming nurse should see the notes

  @handover @acknowledge
  Scenario: Incoming nurse acknowledges handover
    Given previous shift documented handover
    When I start my shift
    And I acknowledge handover receipt
    Then acknowledgment should be recorded
    And I become responsible for patient care

  @handover @report
  Scenario: Generate shift handover report
    When I generate ward handover report
    Then report should include all patients:
      | info per patient       |
      | Name, Bed, Diagnosis   |
      | Current condition      |
      | Active orders          |
      | Pending tasks          |
      | Special concerns       |
    And report should be printable

  # ============================================
  # PATIENT TRANSFER
  # ============================================

  @transfer @ward
  Scenario: Transfer patient between wards
    Given patient is in Medical Ward bed M-15
    When I initiate transfer:
      | field         | value               |
      | Target Ward   | ICU                 |
      | Target Bed    | ICU-3               |
      | Reason        | Condition worsened  |
    And I add transfer summary
    Then patient should be transferred
    And bed M-15 should become available
    And bed ICU-3 should become occupied
    And billing should update for new ward rate
    And audit log should record "patient_transferred"

  @transfer @step-down
  Scenario: Step-down transfer from ICU
    Given patient is in ICU
    When condition improves
    And I transfer to Medical Ward
    Then transfer should be documented as "Step-down"
    And ICU bed should be freed
    And billing rate should adjust

  @transfer @validation
  Scenario: Validate bed availability before transfer
    When I try to transfer to a bed that is occupied
    Then transfer should be blocked
    And I should see "Target bed is not available"

  # ============================================
  # DISCHARGE PLANNING
  # ============================================

  @smoke @discharge
  Scenario: Initiate discharge planning
    Given patient is ready for discharge
    When I initiate discharge:
      | field               | value                        |
      | Final Diagnosis     | B50.0 - Severe malaria       |
      | Treatment Provided  | IV Artesunate, supportive    |
      | Outcome            | Recovered                     |
    Then discharge planning should begin
    And discharge checklist should be activated

  @discharge @checklist
  Scenario: Complete discharge checklist
    When I complete discharge checklist:
      | item                    | status    |
      | Outstanding pharmacy    | Cleared   |
      | Pending lab results     | Reviewed  |
      | Billing finalized       | Complete  |
      | Follow-up scheduled     | Booked    |
    Then all items should be checked
    And discharge can proceed

  @discharge @summary
  Scenario: Generate discharge summary
    Given discharge is approved
    When I generate discharge summary
    Then summary should include:
      | section              |
      | Admission diagnosis  |
      | Final diagnosis      |
      | Procedures performed |
      | Treatment provided   |
      | Discharge medications|
      | Follow-up plan       |
      | Instructions         |
    And summary should be printable for patient

  @discharge @medications
  Scenario: Prescribe discharge medications
    When I add discharge medications:
      | medication    | dosage    | duration |
      | AL 20/120mg   | 4 tabs BD | 3 days   |
      | Folic Acid    | 1 tab OD  | 14 days  |
    Then prescription should be created
    And linked to discharge
    And patient should collect from pharmacy

  @discharge @execute
  Scenario: Execute patient discharge
    Given all discharge requirements met
    When I click "Complete Discharge"
    Then bed status should change to "AVAILABLE"
    And admission status should be "DISCHARGED"
    And length of stay should be calculated
    And audit log should record "patient_discharged"

  @discharge @los
  Scenario: Calculate length of stay
    Given patient was admitted on "2026-01-03 10:00"
    And discharged on "2026-01-07 14:00"
    Then length of stay should be "4 days, 4 hours"
    And LOS should be stored for reporting

  # ============================================
  # BILLING INTEGRATION
  # ============================================

  @billing @daily
  Scenario: Daily bed charges auto-generated
    Given patient is admitted to Medical Ward
    When midnight passes
    Then daily bed charge should be auto-added to bill
    And charge should match ward rate

  @billing @itemized
  Scenario: View itemized inpatient bill
    When I view patient's bill
    Then I should see itemized charges:
      | category       | items                    |
      | Bed Charges    | Per day based on ward    |
      | Consultations  | Doctor rounds            |
      | Nursing Care   | Special care charges     |
      | Medications    | Drugs administered       |
      | Lab Tests      | Investigations done      |
      | Procedures     | Any procedures performed |

  @billing @clearance
  Scenario: Financial clearance required for discharge
    Given patient has outstanding balance
    When I try to discharge
    Then I should see "Financial clearance required"
    And I should see options:
      | option            |
      | Process payment   |
      | Apply insurance   |
      | Request waiver    |
      | Setup payment plan|

  # ============================================
  # REFERRAL & CONSULTATION
  # ============================================

  @referral @consultant
  Scenario: Request consultant review
    When I request consultant review:
      | field      | value                  |
      | Specialty  | Cardiology             |
      | Urgency    | Urgent                 |
      | Reason     | Suspected cardiac issue|
    Then consultant should be notified
    And referral status should be "Pending"

  @referral @respond
  Scenario: Consultant responds to referral
    Given I am a consultant
    And I have a pending referral
    When I document my review
    And I add recommendations
    Then referring doctor should be notified
    And recommendations should appear in chart

  @referral @external
  Scenario: External referral for higher care
    When patient needs higher level care
    And I create external referral:
      | field     | value                      |
      | Facility  | Kenyatta National Hospital |
      | Reason    | Need for specialized care  |
    Then referral letter should be generated
    And transfer arrangements should be documented

  # ============================================
  # OFFLINE SUPPORT
  # ============================================

  @offline @admission
  Scenario: Process admission offline
    Given I am offline
    When I complete admission process
    Then admission should be saved locally
    And bed status should update locally
    And data should sync when online

  @offline @rounds
  Scenario: Document ward rounds offline
    Given I am offline
    When I document ward rounds
    Then notes should be saved locally
    And should sync when connectivity restored

  # ============================================
  # PERMISSIONS
  # ============================================

  @permissions
  Scenario: Role-based access to IPD functions
    Then access should be controlled:
      | role         | can_admit | can_discharge | can_transfer |
      | Receptionist | Yes       | No            | No           |
      | Nurse        | No        | No            | No           |
      | Doctor       | Yes       | Yes           | Yes          |
      | Ward Manager | Yes       | Yes           | Yes          |

  @permissions @kardex
  Scenario: Nurses can edit kardex but not orders
    Given I am logged in as a nurse
    When I view the kardex
    Then I can add nursing notes
    And I can update care plan
    But I cannot modify doctor's orders
