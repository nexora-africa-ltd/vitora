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

  test('should return 401 or 404 without auth', async ({ request }) => {
    // Backend may return 404 (route not matched) or 401 (unauthorized)
    // depending on URL parsing order
    const response = await request.get(
      `${API_BASE}/api/imaging/dicom/1.2.3.4.5/frame/`
    );
    expect([401, 404]).toContain(response.status());
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

    // Should show the DICOM studies-specific search filter
    await expect(page.getByPlaceholder(/search patient, accession/i)).toBeVisible();
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

    // Should show refresh button (use exact match to avoid matching header refresh)
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();
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

    // Should show error heading (use specific heading to avoid matching multiple elements)
    await expect(
      page.getByRole('heading', { name: /not found/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should have viewer and details tabs', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);

    // Mock a study response - use regex for flexible URL matching
    // Must include ALL required fields from DICOMStudyDetailSchema and DICOMSeriesListSchema
    await page.route(/\/api\/imaging\/studies\/[^/]+\/?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          study_instance_uid: '1.2.3.4.5.mock',
          patient: 1,
          patient_name: 'Test Patient',
          imaging_order: null,
          study_date: '2026-02-14',
          study_time: null,
          study_description: 'Mock Study',
          accession_number: null,
          referring_physician_name: null,
          modality: 'XR',
          institution_name: null,
          number_of_series: 1,
          number_of_instances: 2,
          total_file_size: null,
          thumbnail_path: null,
          uploaded_by: null,
          uploaded_by_name: null,
          created_at: '2026-02-14T10:00:00Z',
          updated_at: '2026-02-14T10:00:00Z',
          series: [
            {
              id: 1,
              series_instance_uid: '1.2.3.4.5.mock.1',
              series_number: 1,
              series_description: 'Mock Series',
              modality: 'XR',
              body_part_examined: 'CHEST',
              number_of_instances: 2,
              total_file_size: null,
              thumbnail_path: null,
              created_at: '2026-02-14T10:00:00Z',
            },
          ],
        }),
      });
    });

    await page.goto('/imaging/studies/1.2.3.4.5.mock');

    // Tabs only render when the study loads successfully; assert on the tabs directly.
    await expect(page.getByRole('tab', { name: /viewer/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('tab', { name: /details/i })).toBeVisible();
  });
});
