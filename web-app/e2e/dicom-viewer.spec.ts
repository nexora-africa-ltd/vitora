/**
 * DICOM Viewer E2E Tests
 * Phase C Sprint C.3: DICOM Viewer
 *
 * Tests the DICOM studies list and viewer pages.
 *
 * Prerequisites:
 * - Backend must be running on port 9088
 * - Test user must exist (testuser/testpassword123)
 *
 * @see web-app/app/(dashboard)/imaging/studies/page.tsx
 * @see web-app/app/(dashboard)/imaging/studies/[studyUid]/page.tsx
 */
import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { API_BASE, TEST_USER, login } from './fixtures';

// ============================================================================
// API Response Types
// ============================================================================

interface DICOMStudy {
  study_instance_uid: string;
  patient_name: string | null;
  accession_number: string | null;
  study_date: string;
  study_description: string | null;
  modality: string;
  number_of_series: number;
  number_of_instances: number;
  total_file_size: number | null;
  thumbnail_path: string | null;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ============================================================================
// Authentication Helper
// ============================================================================

async function getAuthToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API_BASE}/api/token/`, {
    data: {
      username: TEST_USER.username,
      password: TEST_USER.password,
    },
  });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  return data.access;
}

// ============================================================================
// DICOM Studies API Tests
// ============================================================================

test.describe('DICOM Studies API', () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    try {
      authToken = await getAuthToken(request);
    } catch {
      test.skip(true, 'Could not authenticate - backend may not be running');
    }
  });

  test('should list DICOM studies', async ({ request }) => {
    test.skip(!authToken, 'Requires authentication');

    const response = await request.get(`${API_BASE}/api/imaging/studies/`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(response.ok()).toBeTruthy();
    const data: PaginatedResponse<DICOMStudy> = await response.json();

    // Validate response structure
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('results');
    expect(Array.isArray(data.results)).toBeTruthy();

    // If there are studies, validate structure
    if (data.results.length > 0) {
      const study = data.results[0];
      expect(study).toHaveProperty('study_instance_uid');
      expect(study).toHaveProperty('modality');
      expect(study).toHaveProperty('study_date');
      expect(study).toHaveProperty('number_of_series');
      expect(study).toHaveProperty('number_of_instances');
    }
  });

  test('should filter studies by modality', async ({ request }) => {
    test.skip(!authToken, 'Requires authentication');

    const response = await request.get(`${API_BASE}/api/imaging/studies/`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { modality: 'XR' },
    });

    expect(response.ok()).toBeTruthy();
    const data: PaginatedResponse<DICOMStudy> = await response.json();

    // All returned studies should be XR modality
    for (const study of data.results) {
      expect(study.modality).toBe('XR');
    }
  });

  test('should return 401 without auth', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/imaging/studies/`);
    expect(response.status()).toBe(401);
  });
});

// ============================================================================
// DICOM Frame Rendering API Tests
// ============================================================================

test.describe('DICOM Frame Rendering API', () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    try {
      authToken = await getAuthToken(request);
    } catch {
      test.skip(true, 'Could not authenticate - backend may not be running');
    }
  });

  test('should return 404 for nonexistent SOP UID', async ({ request }) => {
    test.skip(!authToken, 'Requires authentication');

    const response = await request.get(
      `${API_BASE}/api/imaging/dicom/1.2.3.4.5.nonexistent/frame/`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    expect(response.status()).toBe(404);
  });

  test('should return 401 without auth', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/imaging/dicom/1.2.3.4.5/frame/`
    );
    expect(response.status()).toBe(401);
  });
});

// ============================================================================
// DICOM Studies Page UI Tests
// ============================================================================

test.describe('DICOM Studies Page', () => {
  test('should display studies list page', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging/studies');

    // Should show page header
    await expect(page.getByRole('heading', { name: /DICOM Studies/i })).toBeVisible();

    // Should show filter controls
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test('should have upload button', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging/studies');

    // Should show upload button
    await expect(page.getByRole('button', { name: /upload/i })).toBeVisible();
  });

  test('should have refresh button', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging/studies');

    // Should show refresh button
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible();
  });

  test('should filter by modality', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging/studies');

    // Click modality filter
    await page.getByRole('combobox').click();

    // Should show modality options
    await expect(page.getByRole('option', { name: /all modalities/i })).toBeVisible();
  });
});

// ============================================================================
// DICOM Viewer Page UI Tests
// ============================================================================

test.describe('DICOM Study Detail Page', () => {
  test('should show 404 for nonexistent study', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging/studies/1.2.3.4.5.nonexistent');

    // Should show error or 404 message
    await expect(
      page.getByText(/not found|failed to load|error/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should have viewer and details tabs', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);

    // Mock a study response
    await page.route(`${API_BASE}/api/imaging/studies/*/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          study_instance_uid: '1.2.3.4.5.mock',
          patient_name: 'Test Patient',
          study_date: '2026-02-14',
          study_description: 'Mock Study',
          modality: 'XR',
          number_of_series: 1,
          number_of_instances: 2,
          series: [
            {
              series_instance_uid: '1.2.3.4.5.mock.1',
              series_number: 1,
              series_description: 'Mock Series',
              modality: 'XR',
              body_part_examined: 'CHEST',
              number_of_instances: 2,
              thumbnail_path: null,
            },
          ],
        }),
      });
    });

    await page.goto('/imaging/studies/1.2.3.4.5.mock');
    await page.waitForLoadState('networkidle');

    // Should show tabs
    const viewerTab = page.getByRole('tab', { name: /viewer/i });
    const detailsTab = page.getByRole('tab', { name: /details/i });

    await expect(viewerTab).toBeVisible();
    await expect(detailsTab).toBeVisible();
  });
});
