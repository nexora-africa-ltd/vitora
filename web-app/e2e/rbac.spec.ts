/**
 * RBAC (Role-Based Access Control) E2E Tests
 *
 * End-to-end tests for role management, permissions, and access control.
 *
 * Sprint 1.1-1.2 Track C: RBAC Foundation
 *
 * Features Covered:
 * - Department Management
 * - Role Management
 * - Staff Profile Management
 * - Role-Based Permission Checking
 * - Role Assignment via Admin
 */
import { test, expect, Page } from '@playwright/test';
import { TEST_USER, API_BASE, login } from './fixtures';

// =============================================================================
// MOCK DATA
// =============================================================================

const mockDepartment = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Outpatient Department',
  code: 'OPD',
  description: 'Handles outpatient consultations and treatments',
  department_type: 'CLINICAL',
  department_type_display: 'Clinical',
  parent: null,
  parent_name: null,
  head: 1,
  head_name: 'Dr. James Mwangi',
  is_active: true,
  staff_count: 15,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-03T00:00:00Z',
  ...overrides,
});

const mockRole = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Doctor',
  code: 'DOCTOR',
  description: 'Medical doctor with clinical privileges',
  role_type: 'CLINICAL',
  role_type_display: 'Clinical',
  permissions: [
    'patients.view_patient',
    'patients.add_patient',
    'patients.change_patient',
    'encounters.view_encounter',
    'encounters.add_encounter',
    'encounters.change_encounter',
    'laboratory.add_laborder',
    'pharmacy.add_prescription',
  ],
  is_default: false,
  is_system: true,
  staff_count: 10,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-03T00:00:00Z',
  ...overrides,
});

const mockStaffProfile = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  user: 1,
  username: 'dr.mwangi',
  email: 'james.mwangi@vitora.health',
  first_name: 'James',
  last_name: 'Mwangi',
  full_name: 'Dr. James Mwangi',
  employee_id: 'EMP-001',
  department: 1,
  department_name: 'Outpatient Department',
  role: 1,
  role_name: 'Doctor',
  phone_number: '+254712345678',
  license_number: 'MED-12345',
  license_expiry: '2027-12-31',
  specialization: 'Internal Medicine',
  is_active: true,
  hire_date: '2024-01-15',
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2026-01-03T00:00:00Z',
  ...overrides,
});

const mockPermissions = [
  { codename: 'view_patient', name: 'Can view patient', app_label: 'patients' },
  { codename: 'add_patient', name: 'Can add patient', app_label: 'patients' },
  { codename: 'change_patient', name: 'Can change patient', app_label: 'patients' },
  { codename: 'delete_patient', name: 'Can delete patient', app_label: 'patients' },
  { codename: 'view_encounter', name: 'Can view encounter', app_label: 'encounters' },
  { codename: 'add_encounter', name: 'Can add encounter', app_label: 'encounters' },
  { codename: 'change_encounter', name: 'Can change encounter', app_label: 'encounters' },
  { codename: 'view_laborder', name: 'Can view lab order', app_label: 'laboratory' },
  { codename: 'add_laborder', name: 'Can add lab order', app_label: 'laboratory' },
  { codename: 'add_prescription', name: 'Can add prescription', app_label: 'pharmacy' },
  { codename: 'view_invoice', name: 'Can view invoice', app_label: 'billing' },
  { codename: 'add_invoice', name: 'Can add invoice', app_label: 'billing' },
];

// =============================================================================
// SETUP HELPERS
// =============================================================================

async function setupRBACMocks(page: Page) {
  // Auth mock
  await page.route('**/api/token/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access: 'mock-access-token',
        refresh: 'mock-refresh-token',
        user: {
          id: 1,
          username: TEST_USER.username,
          is_staff: true,
          is_superuser: true,
        },
      }),
    });
  });

  // Departments
  await page.route('**/api/departments/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'GET') {
      if (url.includes('/1/') || url.includes('/1?')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockDepartment()),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            count: 4,
            results: [
              mockDepartment(),
              mockDepartment({ id: 2, name: 'Laboratory', code: 'LAB', department_type: 'ANCILLARY' }),
              mockDepartment({ id: 3, name: 'Pharmacy', code: 'PHARM', department_type: 'ANCILLARY' }),
              mockDepartment({ id: 4, name: 'Administration', code: 'ADMIN', department_type: 'ADMINISTRATIVE' }),
            ],
          }),
        });
      }
    } else if (method === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockDepartment(), ...body, id: 5 }),
      });
    } else if (method === 'PUT' || method === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockDepartment()),
      });
    } else {
      await route.continue();
    }
  });

  // Roles
  await page.route('**/api/roles/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'GET') {
      if (url.includes('/1/') || url.includes('/1?')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockRole()),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            count: 5,
            results: [
              mockRole(),
              mockRole({ id: 2, name: 'Nurse', code: 'NURSE' }),
              mockRole({ id: 3, name: 'Lab Technician', code: 'LAB_TECH', role_type: 'ANCILLARY' }),
              mockRole({ id: 4, name: 'Pharmacist', code: 'PHARMACIST', role_type: 'ANCILLARY' }),
              mockRole({ id: 5, name: 'Receptionist', code: 'RECEPTIONIST', role_type: 'ADMINISTRATIVE' }),
            ],
          }),
        });
      }
    } else if (method === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockRole(), ...body, id: 6 }),
      });
    } else if (method === 'PUT' || method === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockRole()),
      });
    } else {
      await route.continue();
    }
  });

  // Staff profiles
  await page.route('**/api/staff/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'GET') {
      if (url.includes('/1/') || url.includes('/1?')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockStaffProfile()),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            count: 3,
            results: [
              mockStaffProfile(),
              mockStaffProfile({ id: 2, username: 'nurse.mary', first_name: 'Mary', role: 2, role_name: 'Nurse' }),
              mockStaffProfile({ id: 3, username: 'lab.john', first_name: 'John', role: 3, role_name: 'Lab Technician' }),
            ],
          }),
        });
      }
    } else if (method === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockStaffProfile(), ...body, id: 4 }),
      });
    } else if (method === 'PUT' || method === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockStaffProfile()),
      });
    } else {
      await route.continue();
    }
  });

  // Permissions list
  await page.route('**/api/permissions/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        count: mockPermissions.length,
        results: mockPermissions,
      }),
    });
  });

  // Current user permissions (for UI rendering)
  await page.route('**/api/me/permissions/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        permissions: [
          'patients.view_patient',
          'patients.add_patient',
          'encounters.view_encounter',
          'encounters.add_encounter',
        ],
      }),
    });
  });
}

async function setupRestrictedUserMocks(page: Page) {
  // Auth mock for restricted user (nurse)
  await page.route('**/api/token/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access: 'mock-access-token',
        refresh: 'mock-refresh-token',
        user: {
          id: 2,
          username: 'nurse.mary',
          is_staff: false,
          is_superuser: false,
        },
      }),
    });
  });

  // Limited permissions
  await page.route('**/api/me/permissions/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        permissions: [
          'patients.view_patient',
          'encounters.view_encounter',
          // No add/change permissions
        ],
      }),
    });
  });
}

// =============================================================================
// DEPARTMENT MANAGEMENT TESTS
// =============================================================================

test.describe('Department Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupRBACMocks(page);
  });

  test('should display department list', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/departments');

    // Verify departments display
    await expect(page.getByText('Outpatient Department')).toBeVisible();
    await expect(page.getByText('Laboratory')).toBeVisible();
    await expect(page.getByText('Pharmacy')).toBeVisible();
    await expect(page.getByText('Administration')).toBeVisible();
  });

  test('should create new department', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/departments/new');

    // Fill department form
    await page.getByLabel(/name/i).fill('Radiology');
    await page.getByLabel(/code/i).fill('RAD');
    await page.getByLabel(/description/i).fill('Imaging and radiology services');

    // Select department type
    await page.getByRole('combobox', { name: /type/i }).click();
    await page.getByRole('option', { name: /ancillary/i }).click();

    // Submit
    await page.getByRole('button', { name: /save|create/i }).click();

    // Verify success
    await expect(page.getByText(/department.*created|success/i)).toBeVisible();
  });

  test('should edit department', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/departments/1');

    // Edit name
    await page.getByLabel(/name/i).clear();
    await page.getByLabel(/name/i).fill('OPD - Main');

    // Save
    await page.getByRole('button', { name: /save|update/i }).click();

    // Verify success
    await expect(page.getByText(/updated|success/i)).toBeVisible();
  });

  test('should display department hierarchy', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/departments');

    // Verify type badges displayed
    await expect(page.getByText(/clinical/i)).toBeVisible();
    await expect(page.getByText(/ancillary/i)).toBeVisible();
    await expect(page.getByText(/administrative/i)).toBeVisible();
  });

  test('should show department staff count', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/departments');

    // Verify staff count displayed
    await expect(page.getByText(/15.*staff/i)).toBeVisible();
  });
});

// =============================================================================
// ROLE MANAGEMENT TESTS
// =============================================================================

test.describe('Role Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupRBACMocks(page);
  });

  test('should display role list', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/roles');

    // Verify roles display
    await expect(page.getByText('Doctor')).toBeVisible();
    await expect(page.getByText('Nurse')).toBeVisible();
    await expect(page.getByText('Lab Technician')).toBeVisible();
    await expect(page.getByText('Pharmacist')).toBeVisible();
    await expect(page.getByText('Receptionist')).toBeVisible();
  });

  test('should create new role with permissions', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/roles/new');

    // Fill role form
    await page.getByLabel(/name/i).fill('Triage Nurse');
    await page.getByLabel(/code/i).fill('TRIAGE_NURSE');
    await page.getByLabel(/description/i).fill('Nurse specialized in triage assessments');

    // Select role type
    await page.getByRole('combobox', { name: /type/i }).click();
    await page.getByRole('option', { name: /clinical/i }).click();

    // Select permissions
    await page.getByLabel(/view.*patient/i).check();
    await page.getByLabel(/view.*encounter/i).check();
    await page.getByLabel(/add.*encounter/i).check();

    // Submit
    await page.getByRole('button', { name: /save|create/i }).click();

    // Verify success
    await expect(page.getByText(/role.*created|success/i)).toBeVisible();
  });

  test('should edit role permissions', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/roles/1');

    // Add new permission
    await page.getByLabel(/delete.*patient/i).check();

    // Save
    await page.getByRole('button', { name: /save|update/i }).click();

    // Verify success
    await expect(page.getByText(/updated|success/i)).toBeVisible();
  });

  test('should display role permissions list', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/roles/1');

    // Verify permissions displayed
    await expect(page.getByText(/view.*patient/i)).toBeVisible();
    await expect(page.getByText(/add.*patient/i)).toBeVisible();
    await expect(page.getByText(/add.*encounter/i)).toBeVisible();
  });

  test('should show staff count per role', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/roles');

    // Verify staff count displayed
    await expect(page.getByText(/10.*staff/i)).toBeVisible();
  });

  test('should prevent deletion of system roles', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/roles/1');

    // System role should have delete disabled
    const deleteButton = page.getByRole('button', { name: /delete/i });
    await expect(deleteButton).toBeDisabled();
  });
});

// =============================================================================
// STAFF PROFILE MANAGEMENT TESTS
// =============================================================================

test.describe('Staff Profile Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupRBACMocks(page);
  });

  test('should display staff list', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/staff');

    // Verify staff display
    await expect(page.getByText('Dr. James Mwangi')).toBeVisible();
    await expect(page.getByText('Mary')).toBeVisible();
    await expect(page.getByText('John')).toBeVisible();
  });

  test('should create new staff profile', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/staff/new');

    // Fill staff form
    await page.getByLabel(/employee.*id/i).fill('EMP-004');
    await page.getByLabel(/first.*name/i).fill('Sarah');
    await page.getByLabel(/last.*name/i).fill('Otieno');
    await page.getByLabel(/email/i).fill('sarah.otieno@vitora.health');
    await page.getByLabel(/phone/i).fill('+254712345679');

    // Select department
    await page.getByRole('combobox', { name: /department/i }).click();
    await page.getByRole('option', { name: /outpatient/i }).click();

    // Select role
    await page.getByRole('combobox', { name: /role/i }).click();
    await page.getByRole('option', { name: /nurse/i }).click();

    // Submit
    await page.getByRole('button', { name: /save|create/i }).click();

    // Verify success
    await expect(page.getByText(/staff.*created|success/i)).toBeVisible();
  });

  test('should edit staff role assignment', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/staff/2');

    // Change role
    await page.getByRole('combobox', { name: /role/i }).click();
    await page.getByRole('option', { name: /doctor/i }).click();

    // Save
    await page.getByRole('button', { name: /save|update/i }).click();

    // Verify success
    await expect(page.getByText(/updated|success/i)).toBeVisible();
  });

  test('should filter staff by department', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/staff');

    // Filter by department
    await page.getByRole('combobox', { name: /department/i }).click();
    await page.getByRole('option', { name: /laboratory/i }).click();

    // Verify filter applied
    await expect(page.getByText(/lab.*technician/i)).toBeVisible();
  });

  test('should filter staff by role', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/staff');

    // Filter by role
    await page.getByRole('combobox', { name: /role/i }).click();
    await page.getByRole('option', { name: /doctor/i }).click();

    // Verify filter applied
    await expect(page.getByText('Dr. James Mwangi')).toBeVisible();
  });

  test('should search staff by name', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/staff');

    // Search by name
    await page.getByLabel(/search/i).fill('James');

    // Verify filtered results
    await expect(page.getByText('Dr. James Mwangi')).toBeVisible();
  });

  test('should display license information', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/staff/1');

    // Verify license info displayed
    await expect(page.getByText('MED-12345')).toBeVisible();
    await expect(page.getByText(/2027-12-31/)).toBeVisible();
  });

  test('should deactivate staff member', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/staff/1');

    // Click deactivate
    await page.getByRole('button', { name: /deactivate/i }).click();

    // Confirm
    await page.getByRole('button', { name: /confirm/i }).click();

    // Verify deactivated
    await expect(page.getByText(/deactivated|inactive/i)).toBeVisible();
  });
});

// =============================================================================
// ROLE-BASED PERMISSION ENFORCEMENT TESTS
// =============================================================================

test.describe('Role-Based Permission Enforcement', () => {
  test('should hide restricted actions for non-admin users', async ({ page }) => {
    await setupRestrictedUserMocks(page);

    await login(page, 'nurse.mary', TEST_USER.password);
    await page.goto('/patients');

    // Add patient button should be hidden/disabled
    const addButton = page.getByRole('button', { name: /add.*patient|new.*patient/i });
    await expect(addButton).toHaveCount(0).catch(() => expect(addButton).toBeDisabled());
  });

  test('should deny access to admin pages for non-admin users', async ({ page }) => {
    await setupRestrictedUserMocks(page);

    await login(page, 'nurse.mary', TEST_USER.password);
    await page.goto('/admin/roles');

    // Should redirect or show access denied
    await expect(page.getByText(/access.*denied|unauthorized|forbidden/i)).toBeVisible()
      .catch(() => expect(page).toHaveURL(/login|dashboard/));
  });

  test('should show role-appropriate navigation menu', async ({ page }) => {
    await setupRestrictedUserMocks(page);

    await login(page, 'nurse.mary', TEST_USER.password);
    await page.goto('/dashboard');

    // Admin menu should not be visible
    await expect(page.getByRole('link', { name: /admin/i })).toHaveCount(0);
  });

  test('should allow permitted actions for authorized users', async ({ page }) => {
    await setupRBACMocks(page);

    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/patients');

    // Add patient button should be visible for doctors
    await expect(page.getByRole('button', { name: /add.*patient|new.*patient/i })).toBeVisible();
  });
});

// =============================================================================
// AUDIT LOG FOR ROLE CHANGES TESTS
// =============================================================================

test.describe('Role Change Audit Log', () => {
  test.beforeEach(async ({ page }) => {
    await setupRBACMocks(page);

    // Mock audit logs
    await page.route('**/api/auditlogs/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 2,
          results: [
            {
              id: 1,
              action: 'role_change',
              user: 1,
              user_name: 'admin',
              resource_type: 'StaffProfile',
              resource_id: 2,
              details: {
                old_role: 'Nurse',
                new_role: 'Senior Nurse',
                staff_name: 'Mary Otieno',
              },
              timestamp: '2026-01-03T10:00:00Z',
            },
            {
              id: 2,
              action: 'permission_change',
              user: 1,
              user_name: 'admin',
              resource_type: 'Role',
              resource_id: 2,
              details: {
                role_name: 'Nurse',
                added_permissions: ['pharmacy.view_prescription'],
                removed_permissions: [],
              },
              timestamp: '2026-01-03T09:00:00Z',
            },
          ],
        }),
      });
    });
  });

  test('should log role assignment changes', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/audit-logs?action=role_change');

    // Verify role change logged
    await expect(page.getByText(/role.*change/i)).toBeVisible();
    await expect(page.getByText('Mary Otieno')).toBeVisible();
    await expect(page.getByText(/nurse.*senior nurse/i)).toBeVisible();
  });

  test('should log permission changes', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/audit-logs?action=permission_change');

    // Verify permission change logged
    await expect(page.getByText(/permission.*change/i)).toBeVisible();
    await expect(page.getByText(/pharmacy.*prescription/i)).toBeVisible();
  });

  test('should filter audit logs by action type', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admin/audit-logs');

    // Filter by role change
    await page.getByRole('combobox', { name: /action/i }).click();
    await page.getByRole('option', { name: /role.*change/i }).click();

    // Verify filter applied
    await expect(page.getByText(/role.*change/i)).toBeVisible();
  });
});
