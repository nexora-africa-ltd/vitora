
---

# 1. 30-DAY PILOT PLAN (DAY-BY-DAY)

## Phase 0 — Pre-Pilot Lock (Day −7 to 0)

**Objective:** Eliminate ambiguity before anyone touches the system.

* Sign Pilot MoU
* Appoint:

  * Facility Clinical Champion
  * Facility Operations Lead
  * Your Product Owner
* Freeze pilot scope (documented)
* Finalize workflows (OPD returning patients only)
* Provision infrastructure (devices, network, power fallback)

**Exit condition:** Go/No-Go decision signed.

---

## Phase 1 — Setup & Baseline (Days 1–5)

### Day 1–2: Workflow Shadowing

* Observe real patient journeys (5–10 cases)
* Capture:

  * Time per step
  * Hand-offs
  * Failure points
* No configuration changes yet

### Day 3–4: System Configuration

* User accounts & roles
* Services & price lists
* Visit types
* Minimal master data (drugs, labs)

### Day 5: Baseline Metrics

* Paper-based timings
* Error rates
* Daily patient volume

**Deliverable:** Baseline report

---

## Phase 2 — Training & Dry Runs (Days 6–10)

### Training (Role-Based)

* Front desk (30 min)
* Nurses (30 min)
* Clinicians (45 min)
* Pharmacy (30 min)
* Billing (30 min)

### Dry Runs

* 10 simulated returning patients
* Full flow end-to-end
* No live patients yet

**Exit condition:** Staff can complete flow without assistance.

---

## Phase 3 — Parallel Run (Days 11–20)

### Week 1 (Days 11–15)

* HMIS + paper
* HMIS considered “primary”
* Daily debriefs (15 min)

### Week 2 (Days 16–20)

* HMIS primary
* Paper fallback only
* On-site or on-call support

**Metrics tracked daily**

* % encounters completed in HMIS
* Time per encounter
* Safety issues

---

## Phase 4 — HMIS-Only Go-Live (Days 21–30)

* Paper retired (except downtime protocol)
* Real billing through HMIS
* Reporting validation (OPD counts)

### Final Review (Day 30)

* KPI evaluation
* Staff feedback
* Decision: Rollout / Fix & Extend / Stop

---

# 2. PILOT MoU / AGREEMENT (DRAFT)

## Memorandum of Understanding (Pilot Deployment)

### Parties

This MoU is entered into between:

* **[Facility Name]** (“Facility”)
* **[Your Company / Product Name]** (“Provider”)

### Purpose

To conduct a time-bound pilot of the Provider’s HMIS to evaluate operational suitability for clinical use.

### Scope

* Returning patients only
* OPD workflows
* Vitals, consultation, pharmacy, billing
* Single facility, single site

Out of scope: IPD, theatre, referrals, analytics beyond pilot dashboards.

### Duration

30 calendar days from go-live date.

### Responsibilities

**Provider**

* Deploy and maintain pilot system
* Provide training and support
* Ensure data integrity and backups

**Facility**

* Provide access to staff and workflows
* Use system as primary tool during pilot
* Provide timely feedback

### Data Ownership & Confidentiality

* All patient data remains property of the Facility
* Provider acts as data processor
* No data shared without written consent

### Clinical Responsibility

The HMIS is a support tool. Clinical decisions remain the responsibility of licensed practitioners.

### Termination

Either party may terminate with 7 days’ notice if pilot objectives cannot be met.

### Post-Pilot Options

* Proceed to commercial agreement
* Extend pilot
* Discontinue with data export

### Governing Law

Republic of Kenya.

(Signatures)

---

# 3. GO-LIVE CHECKLIST (HARD GATE)

## Clinical Readiness

* [ ] Returning patient identification tested
* [ ] Allergy visibility confirmed
* [ ] Medication history visible
* [ ] Encounter closure enforced

## Operational Readiness

* [ ] All users trained
* [ ] Roles & permissions verified
* [ ] Price lists validated
* [ ] Receipts printing / issuing works

## Technical Readiness

* [ ] Backup strategy tested
* [ ] Downtime protocol documented
* [ ] Internet fallback available
* [ ] Power backup available

## Governance

* [ ] Change freeze in effect
* [ ] Escalation contacts posted
* [ ] Daily review schedule agreed

**No unchecked box = no go-live**

---

# 4. PILOT DASHBOARDS (WHAT TO BUILD)

## 4.1 Operations Dashboard (Daily)

**KPIs**

* Returning patients per day
* Avg check-in time
* Avg encounter duration
* % encounters closed same day
* Paper fallback incidents

---

## 4.2 Clinical Safety Dashboard

**Signals**

* Duplicate patient matches flagged
* Allergy overrides
* Duplicate medication warnings
* Unreviewed lab results >24h

---

## 4.3 Adoption Dashboard

**Metrics**

* Active users per role
* Encounters per clinician
* % staff logging in daily
* Incomplete encounters

---

## 4.4 Financial Dashboard

* Visits billed vs visits seen
* Revenue per day
* Cash vs insurance split
* Billing exceptions

---

# 5. POST-PILOT SCALE-OUT STRATEGY

## 5.1 Decision Gate

Scale only if:

* ≥90% encounters fully digital
* No unresolved safety issues
* Staff independently operational
* Facility commits commercially

---

## 5.2 Scale Dimensions (One at a Time)

### Axis 1 — Volume

* More OPD patients
* Longer hours

### Axis 2 — Scope

* Add IPD
* Add labs / imaging depth

### Axis 3 — Sites

* Second facility
* Same workflows, same configuration

**Never scale all three at once.**

---

## 5.3 Replication Playbook

From the pilot, extract:

* Standard workflows
* Default configurations
* Training scripts
* Support SOPs

This becomes your **deployment kit**.

---

## 5.4 Commercial Transition

* Convert pilot MoU → Service Agreement
* Define SLA
* Lock pricing
* Define support tiers

---

## 5.5 Strategic Outcome

A successful pilot yields:

* Reference site
* Defensible workflow model
* Real performance benchmarks
* MoH-ready narrative
* Scalable implementation pattern

---
