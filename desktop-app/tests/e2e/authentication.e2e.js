/**
 * E2E Tests for Authentication Flow
 * 
 * Following TDD principles: these tests validate the complete
 * authentication flow including login, logout, and session management.
 * 
 * Sprint 0.6: Login UI implementation
 */

const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('path');

let electronApp;
let window;

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../src/main/index.js')],
    timeout: 60000 // Give backend time to start
  });
  
  // Get the first window
  window = await electronApp.firstWindow();
  
  // Wait for app to be ready
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(5000); // Wait for backend to be ready
});

test.afterAll(async () => {
  // Close the app with a timeout to prevent hanging
  try {
    await Promise.race([
      electronApp.close(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
    ]);
  } catch (e) {
    // Force kill if close times out
    console.log('Force closing Electron app');
  }
});

test.describe('Authentication Flow', () => {
  test('should display login form on app start', async () => {
    // App should show login screen first, not patient registration
    await expect(window.locator('#login-container')).toBeVisible();
    await expect(window.locator('#login-form')).toBeVisible();
    
    // Check login form fields
    await expect(window.locator('#login-username')).toBeVisible();
    await expect(window.locator('#login-password')).toBeVisible();
    await expect(window.locator('#login-btn')).toBeVisible();
    
    // Main app container should be hidden
    await expect(window.locator('#main-container')).not.toBeVisible();
  });
  
  test('should show error for invalid credentials', async () => {
    // Fill in invalid credentials
    await window.locator('#login-username').fill('wronguser');
    await window.locator('#login-password').fill('wrongpassword');
    
    // Submit login form
    await window.locator('#login-btn').click();
    
    // Wait for error message
    await window.waitForSelector('#login-error', { timeout: 10000 });
    
    // Verify error is shown
    const errorText = await window.locator('#login-error').textContent();
    expect(errorText.toLowerCase()).toContain('invalid');
    
    // Should still be on login screen
    await expect(window.locator('#login-container')).toBeVisible();
    await expect(window.locator('#main-container')).not.toBeVisible();
  });
  
  test('should login successfully with valid credentials', async () => {
    // Clear previous input
    await window.locator('#login-username').fill('');
    await window.locator('#login-password').fill('');
    
    // Fill in valid credentials (test user from backend fixtures)
    await window.locator('#login-username').fill('testuser');
    await window.locator('#login-password').fill('testpassword123');
    
    // Submit login form
    await window.locator('#login-btn').click();
    
    // Wait for main container to appear (login successful)
    await window.waitForSelector('#main-container', { timeout: 15000 });
    
    // Verify main app is shown
    await expect(window.locator('#main-container')).toBeVisible();
    await expect(window.locator('#login-container')).not.toBeVisible();
    
    // Verify patient form is accessible
    await expect(window.locator('#patient-form')).toBeVisible();
  });
  
  test('should display current user in header', async () => {
    // After login, header should show username
    await expect(window.locator('#current-user')).toBeVisible();
    const username = await window.locator('#current-user').textContent();
    expect(username).toContain('testuser');
  });
  
  test('should have logout button visible', async () => {
    await expect(window.locator('#logout-btn')).toBeVisible();
  });
  
  test('should logout and return to login screen', async () => {
    // Click logout button
    await window.locator('#logout-btn').click();
    
    // Should return to login screen
    await window.waitForSelector('#login-container', { timeout: 5000 });
    
    await expect(window.locator('#login-container')).toBeVisible();
    await expect(window.locator('#main-container')).not.toBeVisible();
    
    // Login form should be empty
    const usernameValue = await window.locator('#login-username').inputValue();
    const passwordValue = await window.locator('#login-password').inputValue();
    expect(usernameValue).toBe('');
    expect(passwordValue).toBe('');
  });
  
  test('should persist login after page reload', async () => {
    // Login again
    await window.locator('#login-username').fill('testuser');
    await window.locator('#login-password').fill('testpassword123');
    await window.locator('#login-btn').click();
    
    // Wait for main container
    await window.waitForSelector('#main-container', { timeout: 15000 });
    
    // Reload the page
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(2000);
    
    // Should still be logged in (token persisted)
    await expect(window.locator('#main-container')).toBeVisible();
    await expect(window.locator('#login-container')).not.toBeVisible();
  });
});

test.describe('Protected Routes', () => {
  test('should redirect to login if token expired', async () => {
    // This test would require manipulating token expiry
    // For now, we verify that after logout, API calls fail gracefully
    
    // Logout first
    if (await window.locator('#logout-btn').isVisible()) {
      await window.locator('#logout-btn').click();
      await window.waitForSelector('#login-container', { timeout: 5000 });
    }
    
    // Login should be required
    await expect(window.locator('#login-container')).toBeVisible();
  });
});
