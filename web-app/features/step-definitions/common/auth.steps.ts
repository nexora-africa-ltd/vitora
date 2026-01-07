/**
 * Common Step Definitions - Authentication
 * 
 * Shared steps for authentication and authorization scenarios.
 * These steps are reused across all feature files.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';
import { createUser, PERMISSIONS } from '../../support/fixtures';

/**
 * Authentication Given Steps
 */

Given(
  'I am logged in as a user with {string} permission',
  async function (this: VitoraWorld, permission: string) {
    // Find a role that has this permission
    const roleWithPermission = (Object.entries(PERMISSIONS) as [keyof typeof PERMISSIONS, readonly string[]][])
      .find(([, perms]) => perms.includes(permission));
    
    if (!roleWithPermission) {
      throw new Error(`No role found with permission: ${permission}`);
    }
    
    const user = createUser(roleWithPermission[0]);
    this.setUser(user);
    
    // In E2E tests, actually log in
    if (this.page) {
      await this.page.goto('/login');
      await this.page.fill('[name="username"]', user.username);
      await this.page.fill('[name="password"]', 'testpassword');
      await this.page.click('button[type="submit"]');
      await this.page.waitForURL(/dashboard|home/);
    }
  }
);

Given(
  'I am logged in as a {word}',
  async function (this: VitoraWorld, role: string) {
    const normalizedRole = role.toLowerCase().replace(/\s+/g, '') as keyof typeof PERMISSIONS;
    
    if (!(normalizedRole in PERMISSIONS)) {
      throw new Error(`Unknown role: ${role}. Valid roles: ${Object.keys(PERMISSIONS).join(', ')}`);
    }
    
    const user = createUser(normalizedRole);
    this.setUser(user);
    
    // In E2E tests, actually log in
    if (this.page) {
      await this.page.goto('/login');
      await this.page.fill('[name="username"]', user.username);
      await this.page.fill('[name="password"]', 'testpassword');
      await this.page.click('button[type="submit"]');
      await this.page.waitForURL(/dashboard|home/);
    }
  }
);

Given(
  'I am logged in as a clinical officer',
  async function (this: VitoraWorld) {
    // Clinical officers have doctor-like permissions but with some restrictions
    const user = createUser('doctor', {
      username: 'clinical_officer',
      email: 'co@vitora.health',
    });
    this.setUser(user);
    
    if (this.page) {
      await this.page.goto('/login');
      await this.page.fill('[name="username"]', user.username);
      await this.page.fill('[name="password"]', 'testpassword');
      await this.page.click('button[type="submit"]');
      await this.page.waitForURL(/dashboard|home/);
    }
  }
);

Given(
  'I do NOT have {string} permission',
  async function (this: VitoraWorld, permission: string) {
    if (this.currentUser) {
      this.currentUser.permissions = this.currentUser.permissions.filter(p => p !== permission);
    }
  }
);

Given(
  'I have {string} permission',
  async function (this: VitoraWorld, permission: string) {
    if (this.currentUser && !this.currentUser.permissions.includes(permission)) {
      this.currentUser.permissions.push(permission);
    }
  }
);

Given(
  'I am not authenticated',
  async function (this: VitoraWorld) {
    this.currentUser = undefined;
    this.authToken = undefined;
    
    // Clear any stored auth in browser
    if (this.context) {
      await this.context.clearCookies();
    }
  }
);

/**
 * Authentication When Steps
 */

When(
  'I log in with username {string} and password {string}',
  async function (this: VitoraWorld, username: string, password: string) {
    if (this.page) {
      await this.page.goto('/login');
      await this.page.fill('[name="username"]', username);
      await this.page.fill('[name="password"]', password);
      await this.page.click('button[type="submit"]');
    }
  }
);

When(
  'I log out',
  async function (this: VitoraWorld) {
    this.currentUser = undefined;
    this.authToken = undefined;
    
    if (this.page) {
      await this.page.click('[data-testid="user-menu"]');
      await this.page.click('[data-testid="logout-button"]');
    }
  }
);

/**
 * Authentication Then Steps
 */

Then(
  'I should be logged in as {string}',
  async function (this: VitoraWorld, username: string) {
    expect(this.currentUser?.username).toBe(username);
    
    if (this.page) {
      const userDisplay = await this.page.textContent('[data-testid="user-display"]');
      expect(userDisplay).toContain(username);
    }
  }
);

Then(
  'I should see a login error {string}',
  async function (this: VitoraWorld, errorMessage: string) {
    if (this.page) {
      const error = await this.page.textContent('[data-testid="login-error"]');
      expect(error).toContain(errorMessage);
    }
  }
);

Then(
  'I should be redirected to the login page',
  async function (this: VitoraWorld) {
    if (this.page) {
      await expect(this.page).toHaveURL(/login/);
    }
  }
);

Then(
  'I should see {string} in the navigation',
  async function (this: VitoraWorld, menuItem: string) {
    if (this.page) {
      const nav = this.page.locator('nav');
      await expect(nav.getByText(menuItem)).toBeVisible();
    }
  }
);

Then(
  'I should NOT see {string} in the navigation',
  async function (this: VitoraWorld, menuItem: string) {
    if (this.page) {
      const nav = this.page.locator('nav');
      await expect(nav.getByText(menuItem)).not.toBeVisible();
    }
  }
);
