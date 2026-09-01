import { test, expect, Page } from '@playwright/test';

const UUID = '2d6f0d5e-b038-4d75-9fc6-9e3ee1e54f31';

const TEST_USER = {
  id: 1,
  username: 'testuser',
  password: 'testpassword123',
  email: 'test@vitora.health',
  first_name: 'Test',
  last_name: 'User',
};

const ROUTES_TO_CHECK = [
  `/patients/${UUID}`,
  `/patients/${UUID}/history`,
  `/encounters/${UUID}`,
  `/encounters/${UUID}/edit/vitals`,
  `/encounters/${UUID}/edit/notes`,
  `/admissions/${UUID}`,
  `/admissions/${UUID}/kardex`,
  `/pharmacy/prescriptions/${UUID}`,
  `/transactions/invoices/${UUID}`,
];

async function setupAuthMocks(page: Page) {
  await page.route(/.*\/api\/auth\/login\/?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: TEST_USER.id,
          username: TEST_USER.username,
          email: TEST_USER.email,
          first_name: TEST_USER.first_name,
          last_name: TEST_USER.last_name,
          is_staff: true,
          is_superuser: true,
          permissions: ['*'],
          facility: 1,
        },
      }),
    });
  });

  await page.route(/.*\/api\/staff\/me\/?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: TEST_USER.id,
        username: TEST_USER.username,
        email: TEST_USER.email,
        first_name: TEST_USER.first_name,
        last_name: TEST_USER.last_name,
        is_staff: true,
        is_superuser: true,
        role: 'ADMIN',
        role_display: 'Administrator',
        role_category: 'admin',
        permissions: ['*'],
        facility: 1,
      }),
    });
  });

  await page.route(/.*\/api\/auth\/refresh\/?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="username"]').fill(TEST_USER.username);
  await page.locator('input[name="password"]').fill(TEST_USER.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard/);
}

test.describe('UUID Route Smoke (Authenticated)', () => {
  test.setTimeout(90_000);

  test('loads critical UUID routes post-login without invalid-id guards or crashes', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err);
    });

    await setupAuthMocks(page);
    await login(page);

    for (const route of ROUTES_TO_CHECK) {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 20_000 });

      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByText(/Invalid patient ID|Invalid encounter ID/i)).toHaveCount(0);
      await expect(page.locator('body')).toBeVisible();
    }

    expect(
      pageErrors,
      `Unexpected page errors: ${pageErrors.map((e) => e.message).join(' | ')}`
    ).toHaveLength(0);
  });
});
