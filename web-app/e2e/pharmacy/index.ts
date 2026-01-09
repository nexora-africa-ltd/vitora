/**
 * Pharmacy Module E2E Tests Index
 * 
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * This directory contains end-to-end tests for the pharmacy module,
 * organized by feature area to avoid length limits and improve maintainability.
 * 
 * Test Files:
 * -----------
 * - fixtures.ts    - Shared mock data and helper functions
 * - drugs.spec.ts  - Drug catalog management (CRUD, search, filters)
 * - inventory.spec.ts - Stock batch management (FEFO, receive, adjust)
 * - alerts.spec.ts - Stock alerts (low stock, expiring, acknowledge, resolve)
 * - prescriptions.spec.ts - Prescription management (create, cancel, dispense)
 * - dispensing.spec.ts - Drug dispensing (FEFO, controlled drugs, returns)
 * - reports.spec.ts - Pharmacy reports (stock, expiry, dispensing, movement)
 * 
 * Running Tests:
 * --------------
 * # Run all pharmacy tests
 * npx playwright test e2e/pharmacy/
 * 
 * # Run specific test file
 * npx playwright test e2e/pharmacy/drugs.spec.ts
 * npx playwright test e2e/pharmacy/inventory.spec.ts
 * npx playwright test e2e/pharmacy/alerts.spec.ts
 * npx playwright test e2e/pharmacy/prescriptions.spec.ts
 * npx playwright test e2e/pharmacy/dispensing.spec.ts
 * npx playwright test e2e/pharmacy/reports.spec.ts
 * 
 * # Run with UI mode
 * npx playwright test e2e/pharmacy/ --ui
 * 
 * # Run specific test by name pattern
 * npx playwright test e2e/pharmacy/ -g "should display drugs"
 * 
 * Backend API Endpoints Tested:
 * -----------------------------
 * Drugs:
 *   - GET    /api/pharmacy/drugs/
 *   - GET    /api/pharmacy/drugs/{id}/
 *   - POST   /api/pharmacy/drugs/
 *   - PATCH  /api/pharmacy/drugs/{id}/
 *   - DELETE /api/pharmacy/drugs/{id}/
 * 
 * Stock Batches:
 *   - GET    /api/pharmacy/stock/
 *   - GET    /api/pharmacy/stock/{id}/
 *   - POST   /api/pharmacy/stock/
 *   - PATCH  /api/pharmacy/stock/{id}/
 *   - GET    /api/pharmacy/stock/by_drug/?drug_id={id}
 * 
 * Stock Alerts:
 *   - GET    /api/pharmacy/alerts/
 *   - GET    /api/pharmacy/alerts/{id}/
 *   - POST   /api/pharmacy/alerts/{id}/acknowledge/
 *   - POST   /api/pharmacy/alerts/{id}/resolve/
 *   - GET    /api/pharmacy/alerts/low_stock/
 *   - GET    /api/pharmacy/alerts/expiring/
 * 
 * Prescriptions:
 *   - GET    /api/pharmacy/prescriptions/
 *   - GET    /api/pharmacy/prescriptions/{id}/
 *   - POST   /api/pharmacy/prescriptions/
 *   - PATCH  /api/pharmacy/prescriptions/{id}/
 *   - POST   /api/pharmacy/prescriptions/{id}/cancel/
 *   - GET    /api/pharmacy/prescriptions/by_patient/?patient_id={id}
 * 
 * Dispensing:
 *   - GET    /api/pharmacy/dispensings/
 *   - GET    /api/pharmacy/dispensings/{id}/
 *   - POST   /api/pharmacy/dispensings/
 *   - POST   /api/pharmacy/dispensings/dispense/
 *   - POST   /api/pharmacy/dispensings/{id}/return_stock/
 *   - POST   /api/pharmacy/dispensings/{id}/verify/
 * 
 * Stock Adjustments:
 *   - GET    /api/pharmacy/adjustments/
 *   - GET    /api/pharmacy/adjustments/{id}/
 *   - POST   /api/pharmacy/adjustments/
 *   - POST   /api/pharmacy/adjustments/{id}/approve/
 * 
 * Reports:
 *   - GET    /api/pharmacy/reports/stock-summary/
 *   - GET    /api/pharmacy/reports/expiry-report/?days=90
 *   - GET    /api/pharmacy/reports/dispensing/?start_date=&end_date=
 *   - GET    /api/pharmacy/reports/movement/?start_date=&end_date=
 * 
 * Test Coverage Summary:
 * ----------------------
 * | Module         | Test Count | Key Features                              |
 * |----------------|------------|-------------------------------------------|
 * | Drugs          | 35+        | CRUD, Search, Filter, Kenya compliance    |
 * | Inventory      | 40+        | FEFO, Receive stock, Status tracking      |
 * | Alerts         | 35+        | Acknowledge, Resolve, Severity filtering  |
 * | Prescriptions  | 45+        | Create, Items, Cancel, Status workflow    |
 * | Dispensing     | 50+        | FEFO, Controlled drugs, Returns, Labels   |
 * | Reports        | 40+        | Stock summary, Expiry, Movement, Export   |
 * |----------------|------------|-------------------------------------------|
 * | TOTAL          | 245+       |                                           |
 * 
 * These tests are written in RED-PHASE TDD style - they define expected behavior
 * and will FAIL until the corresponding UI components are implemented.
 */

export * from './fixtures';
