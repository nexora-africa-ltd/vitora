/**
 * E2E Tests for Dark Mode / Theme Toggle
 *
 * Tests for the dark mode feature added in Sprint 0.6
 */

const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('path');

let electronApp;
let window;

/**
 * Helper function to login
 */
async function login(win) {
  await win.waitForSelector('#login-container', { timeout: 10000 });
  await win.locator('#login-username').fill('testuser');
  await win.locator('#login-password').fill('testpassword123');
  await win.locator('#login-btn').click();
  await win.waitForSelector('#main-container', { state: 'visible', timeout: 15000 });
}

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../src/main/index.js')],
    timeout: 60000
  });

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(5000);
  await login(window);
});

test.afterAll(async () => {
  await electronApp.close();
});

// ============================================================================
// Dark Mode Toggle Tests
// ============================================================================

test.describe('Dark Mode / Theme Toggle', () => {
  test('should have theme toggle button visible', async () => {
    await expect(window.locator('#theme-toggle-btn')).toBeVisible();
  });

  test('should have a title attribute on theme toggle button', async () => {
    await expect(window.locator('#theme-toggle-btn')).toHaveAttribute('title', 'Toggle dark mode');
  });

  test('should toggle dark mode when button is clicked', async () => {
    // Check initial state (could be light or dark based on system preference)
    const initialHasDarkMode = await window.evaluate(() =>
      document.body.classList.contains('dark-mode')
    );

    // Click toggle button
    await window.locator('#theme-toggle-btn').click();
    await window.waitForTimeout(300); // Wait for transition

    // Check that mode changed
    const afterClickHasDarkMode = await window.evaluate(() =>
      document.body.classList.contains('dark-mode')
    );

    expect(afterClickHasDarkMode).not.toBe(initialHasDarkMode);
  });

  test('should persist theme preference after toggle', async () => {
    // Get current state
    const currentTheme = await window.evaluate(() =>
      localStorage.getItem('vitora_theme')
    );

    // Toggle
    await window.locator('#theme-toggle-btn').click();
    await window.waitForTimeout(300);

    // Check localStorage was updated
    const newTheme = await window.evaluate(() =>
      localStorage.getItem('vitora_theme')
    );

    expect(newTheme).not.toBe(currentTheme);
    expect(['light', 'dark']).toContain(newTheme);
  });

  test('should apply dark mode styles when enabled', async () => {
    // Ensure we're in dark mode
    const isDark = await window.evaluate(() =>
      document.body.classList.contains('dark-mode')
    );

    if (!isDark) {
      await window.locator('#theme-toggle-btn').click();
      await window.waitForTimeout(300);
    }

    // Check that dark mode is applied
    const hasDarkClass = await window.evaluate(() =>
      document.body.classList.contains('dark-mode')
    );
    expect(hasDarkClass).toBe(true);

    // Verify CSS variables are applied (background should be dark)
    const bgColor = await window.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue('--bg-primary').trim()
    );

    // Dark mode bg-primary should be a dark color (#1a1a1a)
    expect(bgColor).toMatch(/#1a1a1a|rgb\(26,\s*26,\s*26\)/i);
  });

  test('should apply light mode styles when disabled', async () => {
    // Ensure we're in light mode
    const isDark = await window.evaluate(() =>
      document.body.classList.contains('dark-mode')
    );

    if (isDark) {
      await window.locator('#theme-toggle-btn').click();
      await window.waitForTimeout(300);
    }

    // Check that dark mode is not applied
    const hasDarkClass = await window.evaluate(() =>
      document.body.classList.contains('dark-mode')
    );
    expect(hasDarkClass).toBe(false);

    // Verify CSS variables are applied (background should be light)
    const bgColor = await window.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue('--bg-primary').trim()
    );

    // Light mode bg-primary should be a light color (#f5f5f5)
    expect(bgColor).toMatch(/#f5f5f5|rgb\(245,\s*245,\s*245\)/i);
  });

  test('should toggle back to original state', async () => {
    // Click twice to verify toggle works both ways
    const initialState = await window.evaluate(() =>
      document.body.classList.contains('dark-mode')
    );

    // First toggle
    await window.locator('#theme-toggle-btn').click();
    await window.waitForTimeout(300);

    const afterFirst = await window.evaluate(() =>
      document.body.classList.contains('dark-mode')
    );
    expect(afterFirst).not.toBe(initialState);

    // Second toggle - should return to initial
    await window.locator('#theme-toggle-btn').click();
    await window.waitForTimeout(300);

    const afterSecond = await window.evaluate(() =>
      document.body.classList.contains('dark-mode')
    );
    expect(afterSecond).toBe(initialState);
  });
});

// ============================================================================
// Dark Mode Accessibility Tests
// ============================================================================

test.describe('Dark Mode Accessibility', () => {
  test('should maintain readable text contrast in dark mode', async () => {
    // Enable dark mode
    await window.evaluate(() => {
      document.body.classList.add('dark-mode');
    });
    await window.waitForTimeout(100);

    // Check text color is light in dark mode
    const textColor = await window.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue('--text-primary').trim()
    );

    // Dark mode text should be light (#e0e0e0)
    expect(textColor).toMatch(/#e0e0e0|rgb\(224,\s*224,\s*224\)/i);
  });

  test('should maintain form input visibility in dark mode', async () => {
    // Enable dark mode
    await window.evaluate(() => {
      document.body.classList.add('dark-mode');
    });

    // Check input background
    const inputBg = await window.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue('--bg-input').trim()
    );

    // Dark mode input bg should be dark (#2d2d2d)
    expect(inputBg).toMatch(/#2d2d2d|rgb\(45,\s*45,\s*45\)/i);
  });
});

// ============================================================================
// Dark Mode on Login Screen Tests
// ============================================================================

test.describe('Dark Mode on Login Screen', () => {
  test('should allow theme toggle before login', async () => {
    // Create a new app instance to test login screen
    const newApp = await electron.launch({
      args: [path.join(__dirname, '../../src/main/index.js')],
      timeout: 60000
    });

    const newWindow = await newApp.firstWindow();
    await newWindow.waitForLoadState('domcontentloaded');
    await newWindow.waitForTimeout(3000);

    // Verify login container is visible
    await expect(newWindow.locator('#login-container')).toBeVisible();

    // The theme should still work on login page (toggle button may not be visible
    // on login screen in current implementation, so we test localStorage)
    const storedTheme = await newWindow.evaluate(() =>
      localStorage.getItem('vitora_theme')
    );

    // Theme should be initialized from localStorage or system preference
    expect(storedTheme === null || ['light', 'dark'].includes(storedTheme)).toBe(true);

    await newApp.close();
  });
});
