# User Stories and Acceptance Criteria for Vitora HMIS Roles

This document outlines user stories and acceptance criteria for key end-user roles in the Vitora HMIS system. Stories are derived from the system's core capabilities (e.g., patient management, clinical tools, pharmacy, billing, reporting, offline access, interoperability, security, and future AI tools) as described in the provided documents. Roles are grouped logically where overlaps exist, but each has tailored stories. Additional relevant end users added based on system context include: Radiologist, IT Administrator, Claims Officer, Regulator, and Patient (as a passive end user benefiting from the system).

Stories are prioritized for Phase 1-4 alignment: Phase 1 (core clinical/billing), Phase 2 (claims/theatre), Phase 3 (MCH/immunizations), Phase 4 (AI). Acceptance criteria ensure compliance with Kenya Data Protection Act (2019), KHIS integration, SHA claims, FHIR interoperability, and offline functionality for rural settings. As engineering lead, I've incorporated forward-looking elements like AI-driven reminders and predictive analytics for immunization coverage, while grounding in Kenya's KEPI (Kenya Expanded Programme on Immunization) standards and global WHO guidelines for scalability.

## Doctor / Consultant / Clinical Officer
These roles focus on clinical encounters, diagnostics, and decision-making.

- **User Story 1:** As a doctor/consultant/clinical officer, I want to search and view patient records quickly using identifiers like national ID or MRN so that I can access full medical history before consultations.
  - Acceptance Criteria:
    - System supports search by national ID, phone, MRN, or name with results in <2 seconds.
    - Displays demographics, consent status, sensitive flags (e.g., HIV/GBV) only if user has permission.
    - Offline mode caches recent patients; syncs when online.
    - FHIR-compliant export for sharing with external systems.

- **User Story 2:** As a doctor/consultant/clinical officer, I want to record clinical encounters including vitals, diagnoses, and orders so that patient data is standardized and interoperable.
  - Acceptance Criteria:
    - Supports LOINC coding for vitals (e.g., blood pressure, temperature).
    - Mobile app allows offline entry; auto-syncs with audit logs.
    - Integrates with lab/radiology for real-time results notification.
    - Generates billing items automatically for services rendered.

- **User Story 3:** As a doctor/consultant/clinical officer, I want AI-powered alerts for clinical risks (Phase 4) so that I can intervene early in cases like sepsis.
  - Acceptance Criteria:
    - Flags risks based on vitals trends with >90% accuracy in testing.
    - Alerts appear in dashboard; user can override with reason logged.
    - Compliant with data privacy; no external data sharing without consent.
    - Forward-looking: Integrates with national AI health initiatives in Kenya.

- **User Story 4:** As a clinical officer, I want to assess patients and initiate treatment so that care can continue even when doctors are unavailable.
  - Acceptance Criteria:
    - Can create encounters and clinical notes
    - Can order labs and prescribe medications within scope
    - Can escalate cases to a doctor
    - Actions are clearly attributed to “Clinical Officer” role
    - Scope-based restrictions are enforced

- **User Story 5:** As a consultant, I want to review referred cases and provide specialist input so that patients receive expert care.
  - Acceptance Criteria:
    - Consultant can view referral notes and attachments
    - Can add specialist opinions without altering original notes
    - Can recommend procedures, medications, or follow-ups
    - Notes are clearly marked as “Consultant Opinion”
    - Access may be time-limited or case-specific

## Surgeon / Theatre Nurse / Perioperative Theatre Technician
These roles emphasize surgical scheduling, theatre management, and perioperative care (Phase 2 focus).

- **User Story 1:** As a surgeon/theatre nurse/perioperative theatre technician, I want to schedule and view theatre procedures so that operations are coordinated efficiently.
  - Acceptance Criteria:
    - Calendar view shows availability, patient details, and required equipment.
    - Integrates with patient records for pre-op vitals and consents.
    - Notifications for conflicts or delays; supports rescheduling.
    - Offline access for logging intra-op notes; syncs post-procedure.

- **User Story 2:** As a surgeon/theatre nurse/perioperative theatre technician, I want to record perioperative observations and outcomes so that post-op care is informed.
  - Acceptance Criteria:
    - Captures vitals, anesthesia details, and complications with standardized codes.
    - Auto-generates reports for KHIS (e.g., surgical volumes).
    - Role-based access: Surgeons view/edit all; technicians limited to observations.
    - FHIR export for continuity of care to other facilities.

- **User Story 3:** As a surgeon/theatre nurse/perioperative theatre technician, I want stock alerts for surgical supplies so that procedures are not delayed.
  - Acceptance Criteria:
    - Real-time alerts for low/expiring inventory linked to theatre schedules.
    - Integration with pharmacy module for quick reorders.
    - Audit logs track usage; reports on consumption trends.

- **User Story 4:** As a perioperative theatre technician, I want to track equipment and consumables so that theatre operations run smoothly.
  - Acceptance Criteria:
    - Can log equipment readiness and sterilization status
    - Can record consumables usage per procedure
    - Stock deductions are automatic
    - Faults or shortages can be flagged
    - Records are tied to theatre session and timestamped


## Pharmacist
Focus on medication management and inventory.

- **User Story 1:** As a pharmacist, I want to manage medication stock and dispensing so that I can avoid stockouts and ensure accurate fulfillment.
  - Acceptance Criteria:
    - Tracks stock levels, batches, expirations with alerts for low thresholds.
    - Dispensing links to prescriptions; updates inventory in real-time.
    - Supports barcode scanning for efficiency.
    - Offline mode queues dispenses; syncs when connected.

- **User Story 2:** As a pharmacist, I want to view and fulfill prescriptions from clinicians so that medications are dispensed securely.
  - Acceptance Criteria:
    - Displays patient allergies/consents before dispensing.
    - Integrates with billing for invoice generation.
    - Audit logs all actions; restricts access to authorized users.

- **User Story 3:** As a pharmacist, I want predictive analytics for stockouts (Phase 4) so that I can plan procurements proactively.
  - Acceptance Criteria:
    - Forecasts based on historical dispense data; accuracy >85%.
    - Dashboard shows trends; exports to CSV for procurement teams.
    - Data anonymized for privacy compliance.

## Cashier / Claims Officer
Handle payments and insurance claims.

- **User Story 1:** As a cashier/claims officer, I want to generate and process invoices/payments so that transactions are seamless.
  - Acceptance Criteria:
    - Supports M-Pesa, cash, card; auto-reconciles receipts.
    - Links to services rendered (e.g., consultations, labs).
    - Real-time eligibility checks for SHA-insured patients.
    - Offline queuing for payments; syncs with audit trails.

- **User Story 2:** As a claims officer, I want to submit SHA claims with attachments so that reimbursements are timely.
  - Acceptance Criteria:
    - Packages claims with lab reports, invoices via FHIR/zip format.
    - Tracks status (submitted, approved, denied); notifications for updates.
    - Compliance with SHA tariffs; error validation before submission.

- **User Story 3:** As a cashier/claims officer, I want reports on financial performance so that I can monitor revenue.
  - Acceptance Criteria:
    - Dashboards show daily collections, outstanding claims.
    - Exports to KHIS for financial indicators.
    - Role-restricted: Cashiers view daily; officers view aggregates.

## Nurse / Nurse Aide
Focus on vitals, encounters, and patient care.

- **User Story 1:** As a nurse/nurse aide, I want to log vitals and encounters offline so that I can work in rural areas without internet.
  - Acceptance Criteria:
    - Mobile app stores data locally; syncs automatically when online.
    - Supports quick entry for blood pressure, temperature, etc.
    - Integrates with clinician views for review.

- **User Story 2:** As a nurse/nurse aide, I want to track maternal/child health (Phase 3) so that immunizations and checkups are compliant.
  - Acceptance Criteria:
    - Specialized modules for MCH tracking, reminders for visits.
    - Auto-compiles data for KHIS immunization reports.
    - Privacy flags for sensitive cases.

- **User Story 3:** As a nurse/nurse aide, I want collaboration tools so that I can share updates with doctors.
  - Acceptance Criteria:
    - In-app notifications for vitals alerts.
    - Secure sharing via FHIR; audit logs access.

## Receptionist / Front Desk Staff
Manage registrations and queues.

- **User Story 1:** As a receptionist, I want to register patients quickly so that wait times are reduced.
  - Acceptance Criteria:
    - Generates MRN in seconds using ID/phone.
    - Captures consent for data sharing.
    - Integrates with queue management; notifies clinicians.

- **User Story 2:** As a receptionist, I want to search and update patient details so that records are accurate.
  - Acceptance Criteria:
    - Search returns results with demographics; edits audited.
    - Offline registration queues for sync.

## Management / Administrator
Oversee operations and compliance.

- **User Story 1:** As management/administrator, I want dashboards for performance monitoring so that I can ensure regulatory compliance.
  - Acceptance Criteria:
    - Real-time views of OPD visits, revenue, stock levels.
    - Auto-generates KHIS reports; exports compliant data.

- **User Story 2:** As management/administrator, I want audit logs and monitoring so that I can resolve privacy queries.
  - Acceptance Criteria:
    - Tracks all user actions; searchable by date/user.
    - Alerts for anomalies (e.g., unauthorized access).

- **User Story 3:** As management/administrator, I want AI insights (Phase 4) so that I can optimize resources.
  - Acceptance Criteria:
    - Predicts no-shows, stockouts; dashboards with actionable recommendations.

## Part-time / Locum Staff
Flexible access for temporary users.

- **User Story 1:** As part-time/locum staff, I want temporary role-based access so that I can perform duties without full admin rights.
  - Acceptance Criteria:
    - Time-limited accounts; auto-expire after shift.
    - Permissions mirror primary roles (e.g., clinician subset).

- **User Story 2:** As part-time/locum staff, I want quick onboarding so that I can start work immediately.
  - Acceptance Criteria:
    - Self-service login with OTP; mobile app support.

## Laboratory Tech / Radiologist
Handle tests and imaging.

- **User Story 1:** As a laboratory tech/radiologist, I want to receive and process orders so that results are delivered promptly.
  - Acceptance Criteria:
    - Notifications for new orders; status tracking.
    - Upload results with attachments; auto-notifies clinicians.

- **User Story 2:** As a laboratory tech/radiologist, I want integration with billing so that tests are invoiced accurately.
  - Acceptance Criteria:
    - Auto-generates line items; links to SHA claims.

## IT Administrator
Maintain system reliability.

- **User Story 1:** As an IT administrator, I want to monitor system performance so that downtime is minimized.
  - Acceptance Criteria:
    - Access to observability tools (Prometheus/Grafana).
    - Manage backups, updates via Docker/Kubernetes.

- **User Story 2:** As an IT administrator, I want to enforce security policies so that data is protected.
  - Acceptance Criteria:
    - Configure RBAC, encryption; run DPIA reports.

## Regulator
Access national-level data.

- **User Story 1:** As a regulator, I want aggregated reports so that I can oversee national health metrics.
  - Acceptance Criteria:
    - KHIS-compliant exports; anonymized data only.
    - Secure access via FHIR; audited downloads.

## Patient
Benefit from improved care (passive role).

- **User Story 1:** As a patient, I want secure data privacy so that my information is protected.
  - Acceptance Criteria:
    - Consent prompts at registration; right to revoke.
    - No unauthorized access; breach notifications if applicable.

## Maternal and Child Health (MCH) Roles
These roles (e.g., MCH Nurse/Midwife, Pediatrician/Obstetrician, Community Health Promoter) focus on Phase 3 features for maternal and child health, including antenatal care (ANC), postnatal care, immunizations, HIV-exposed infant follow-up, and growth monitoring. Stories align with Kenyan RMNCAH (Reproductive, Maternal, Newborn, Child, and Adolescent Health) indicators, such as skilled deliveries, 4+ ANC visits, and immunization coverage, while incorporating forward-looking AI for risk prediction and global standards like FHIR for interoperability with programs like Linda Jamii (expanded free maternity services).

- **User Story 1:** As an MCH nurse/midwife, I want to enroll pregnant women and children in the MCH module so that I can track their care journey from registration to follow-up.
  - Acceptance Criteria:
    - Captures key details like expected delivery date, HIV status, and child enrollment data (e.g., birth weight, HIV exposure).
    - Offline mobile app support for rural/community enrollment; auto-syncs to central system.
    - Integrates with patient management for unique MRN linkage and consent for data sharing.
    - Auto-flags for high-risk cases (e.g., HIV-exposed infants) with privacy restrictions.

- **User Story 2:** As an MCH nurse/midwife or pediatrician, I want to track antenatal and postnatal visits so that I can ensure compliance with national guidelines like 4+ ANC visits.
  - Acceptance Criteria:
    - Schedules and reminds for visits via mobile notifications; tracks attendance and outcomes (e.g., ultrasounds, supplements).
    - Records standardized data (e.g., fundal height, fetal heart rate) with LOINC coding.
    - Links to SHA for free maternity claims under Linda Jamii; auto-generates billing exemptions.
    - FHIR export for sharing with other facilities or community health promoters.

- **User Story 3:** As an MCH nurse/midwife or pediatrician, I want to manage immunization schedules and records so that children receive timely vaccinations.
  - Acceptance Criteria:
    - Displays personalized schedules based on the KEPI national immunization program, including vaccines like BCG at birth, OPV0/HepB-Birth, Penta1/RV1/PCV1 at 6 weeks, Penta2/RV2/PCV2 at 10 weeks, Penta3/IPV/RV3/PCV3/OPV3 at 14 weeks, MR1 at 9 months, MR2 at 18 months, and Vitamin A supplements at 6/18 months.
    - Offline logging in mobile app; syncs to KHIS for national coverage reporting (e.g., Penta3 indicators) and WHO/UNICEF estimates.
    - Integrates with pharmacy/inventory for vaccine stock checks, batch/lot number tracking, and expiration alerts; prevents dispensing if expired/low.
    - Supports adverse event following immunization (AEFI) reporting with standardized forms, notifications to national authorities, and linkage to patient records for follow-up.
    - Audit logs for accountability; anonymized aggregates for RMNCAH scorecard and predictive analytics (Phase 4) to forecast coverage gaps or defaulter risks.
    - FHIR-compliant resource for Immunization; interoperable with global systems for cross-border care.

- **User Story 4:** As an MCH nurse/midwife or pediatrician, I want to monitor child growth and HIV-exposed infant follow-up so that early interventions can be made.
  - Acceptance Criteria:
    - Tracks metrics like weight-for-age, height, and head circumference with growth charts.
    - Specialized follow-up for HIV-exposed infants (e.g., PCR tests, ARV prophylaxis).
    - Mobile app supports community outreach; links to lab for test orders/results.
    - Compliant with Kenya Data Protection Act; sensitive data (e.g., HIV) restricted to authorized users.

- **User Story 5:** As an MCH nurse/midwife or pediatrician, I want AI-powered risk predictions (Phase 4) so that I can identify high-risk pregnancies or child health issues early.
  - Acceptance Criteria:
    - Analyzes trends (e.g., ANC data, vitals) to flag risks like preeclampsia or malnutrition with >85% accuracy.
    - Dashboards show predictions; integrates with alerts for proactive referrals.
    - Data processing adheres to global privacy standards; no external sharing without consent.
    - Forward-looking: Scalable for integration with national AI health initiatives in Kenya.

- **User Story 6:** As a community health promoter linked to MCH, I want to refer and track patients from community to facility so that continuity of care is maintained.
  - Acceptance Criteria:
    - Mobile app for referrals with geolocation (if consented); syncs to facility records.
    - Tracks linkage outcomes (e.g., ANC attendance post-referral).
    - Integrates with KHIS for community-level indicators; supports offline in rural areas.

## Community Health Workers (CHW) / Community Health Promoters (CHP) Roles
In Kenya, CHWs (now often referred to as CHPs) are frontline volunteers or workers who bridge communities and health facilities, playing a pivotal role in immunization by educating, mobilizing, tracing defaulters, and sometimes administering vaccines if trained. These stories emphasize Phase 3 MCH/immunization features with forward-looking mobile-first design for low-resource settings, integrating with national strategies like the Kenya Community Health Strategy for equity and coverage.

- **User Story 1:** As a CHW/CHP, I want to educate and mobilize communities for immunizations so that vaccine hesitancy is reduced and coverage improves.
  - Acceptance Criteria:
    - Mobile app provides educational resources (e.g., multilingual materials on KEPI vaccines) for sharing during household visits.
    - Tracks community engagement events; syncs outcomes to KHIS for indicators like immunization awareness.
    - Integrates with SMS reminders for due dates; anonymized data for privacy.
    - Forward-looking: AI-suggested tailored messages based on local hesitancy trends.

- **User Story 2:** As a CHW/CHP, I want to trace and refer immunization defaulters so that children complete their schedules.
  - Acceptance Criteria:
    - Dashboard flags defaulters based on KEPI timelines (e.g., missed Penta3 at 14 weeks); generates household visit lists.
    - Offline mobile logging of follow-ups; syncs referrals to facilities via FHIR.
    - Tracks success rates (e.g., linkage to clinic); contributes to national coverage metrics.
    - Role-based access: Limited to community-level data; sensitive info redacted.

- **User Story 3:** As a CHW/CHP, I want to record basic immunizations or observations in the field so that data is captured at the point of service.
  - Acceptance Criteria:
    - Supports logging select vaccines (e.g., OPV during campaigns) if CHW is authorized; integrates with inventory for batch tracking.
    - Offline mode with photo verification (if consented); auto-syncs to central HMIS.
    - Links to AEFI reporting; notifies facilities for follow-up.
    - Compliant with global standards; scalable for CHW vaccine administration pilots in Kenya.

- **User Story 4:** As a CHW/CHP, I want integrated reporting tools so that community-level data informs facility planning.
  - Acceptance Criteria:
    - Generates simple reports on coverage, defaulters, and barriers; exports to KHIS.
    - Mobile dashboards for real-time insights; anonymized aggregates for national dashboards.
    - Forward-looking: Predictive analytics (Phase 4) to forecast outbreak risks based on coverage gaps.