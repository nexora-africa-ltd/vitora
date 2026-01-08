/**
 * Common Step Definitions - Navigation
 * 
 * Shared steps for page navigation.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';

/**
 * Page URL mappings
 */
const PAGE_URLS: Record<string, string> = {
  // Patients
  'patient registration': '/patients/register',
  'patient search': '/patients/search',
  'patient list': '/patients',
  'patient detail': '/patients/:id',
  
  // OPD
  'outpatient department': '/opd',
  'opd queue': '/opd/queue',
  'encounter form': '/encounters/new',
  
  // IPD
  'inpatient department': '/ipd',
  'ward dashboard': '/ipd/wards',
  'admission form': '/ipd/admissions/new',
  
  // Pharmacy
  'pharmacy': '/pharmacy',
  'drug catalog': '/pharmacy/drugs',
  'stock inventory': '/pharmacy/stock',
  'dispensing': '/pharmacy/dispensing',
  'prescription queue': '/pharmacy/prescriptions',
  'pharmacy alerts dashboard': '/pharmacy/alerts',
  
  // Triage
  'triage': '/triage',
  'triage queue': '/triage/queue',
  'triage assessment': '/triage/assess',
  
  // Queue
  'queue management': '/queue',
  'queue dashboard': '/queue/dashboard',
  
  // Reports
  'reports': '/reports',
  'pharmacy reports': '/reports/pharmacy',
  'triage reports dashboard': '/reports/triage',
  
  // Dashboard
  'dashboard': '/dashboard',
  'home': '/',
  'login': '/login',
};

/**
 * Navigation Given Steps
 */

Given(
  'I am on the {string} page',
  async function (this: VitoraWorld, pageName: string) {
    const normalizedPage = pageName.toLowerCase();
    const url = PAGE_URLS[normalizedPage];
    
    if (!url) {
      throw new Error(`Unknown page: ${pageName}. Valid pages: ${Object.keys(PAGE_URLS).join(', ')}`);
    }
    
    this.currentPage = normalizedPage;
    
    if (this.page) {
      await this.page.goto(url);
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'I am on the patient registration page',
  async function (this: VitoraWorld) {
    this.currentPage = 'patient registration';
    if (this.page) {
      await this.page.goto('/patients/register');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'I am on the outpatient department page',
  async function (this: VitoraWorld) {
    this.currentPage = 'outpatient department';
    if (this.page) {
      await this.page.goto(PAGE_URLS['outpatient department']);
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'I am on the inpatient department page',
  async function (this: VitoraWorld) {
    this.currentPage = 'inpatient department';
    if (this.page) {
      await this.page.goto(PAGE_URLS['inpatient department']);
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'I am on the pharmacy alerts dashboard',
  async function (this: VitoraWorld) {
    this.currentPage = 'pharmacy alerts dashboard';
    if (this.page) {
      await this.page.goto(PAGE_URLS['pharmacy alerts dashboard']);
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'I am on the pharmacy reports page',
  async function (this: VitoraWorld) {
    this.currentPage = 'pharmacy reports';
    if (this.page) {
      await this.page.goto(PAGE_URLS['pharmacy reports']);
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'I am on the triage reports dashboard',
  async function (this: VitoraWorld) {
    this.currentPage = 'triage reports dashboard';
    if (this.page) {
      await this.page.goto(PAGE_URLS['triage reports dashboard']);
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'I am on the pharmacy dispensing screen',
  async function (this: VitoraWorld) {
    this.currentPage = 'dispensing';
    if (this.page) {
      await this.page.goto('/pharmacy/dispensing');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'I am on the queue management page',
  async function (this: VitoraWorld) {
    this.currentPage = 'queue management';
    if (this.page) {
      await this.page.goto('/queue');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

/**
 * Navigation When Steps
 */

When(
  'I navigate to the {string} page',
  async function (this: VitoraWorld, pageName: string) {
    const normalizedPage = pageName.toLowerCase();
    const url = PAGE_URLS[normalizedPage];
    
    if (!url) {
      throw new Error(`Unknown page: ${pageName}`);
    }
    
    this.currentPage = normalizedPage;
    
    if (this.page) {
      await this.page.goto(url);
      await this.page.waitForLoadState('networkidle');
    }
  }
);

When(
  'I click on {string} in the sidebar',
  async function (this: VitoraWorld, menuItem: string) {
    if (this.page) {
      await this.page.click(`[data-testid="sidebar"] >> text=${menuItem}`);
      await this.page.waitForLoadState('networkidle');
    }
  }
);

When(
  'I go back',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.goBack();
    }
  }
);

When(
  'I refresh the page',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.reload();
    }
  }
);

/**
 * Navigation Then Steps
 */

Then(
  'I should be on the {string} page',
  async function (this: VitoraWorld, pageName: string) {
    const normalizedPage = pageName.toLowerCase();
    const expectedUrl = PAGE_URLS[normalizedPage];
    
    if (this.page && expectedUrl) {
      // Handle URLs with parameters
      const urlPattern = expectedUrl.replace(/:id/g, '\\d+');
      await expect(this.page).toHaveURL(new RegExp(urlPattern));
    }
    
    this.currentPage = normalizedPage;
  }
);

Then(
  'I should see the page title {string}',
  async function (this: VitoraWorld, title: string) {
    if (this.page) {
      await expect(this.page).toHaveTitle(new RegExp(title, 'i'));
    }
  }
);

Then(
  'I should see heading {string}',
  async function (this: VitoraWorld, heading: string) {
    if (this.page) {
      const h1 = this.page.locator('h1, h2, h3').filter({ hasText: heading });
      await expect(h1.first()).toBeVisible();
    }
  }
);

Then(
  'the URL should contain {string}',
  async function (this: VitoraWorld, urlPart: string) {
    if (this.page) {
      await expect(this.page).toHaveURL(new RegExp(urlPart));
    }
  }
);

Then(
  'I should see a loading indicator',
  async function (this: VitoraWorld) {
    if (this.page) {
      const loader = this.page.locator('[data-testid="loading"], .loading, [role="progressbar"]');
      await expect(loader.first()).toBeVisible();
    }
  }
);

Then(
  'the page should load within {int} seconds',
  async function (this: VitoraWorld, seconds: number) {
    if (this.page) {
      const startTime = Date.now();
      await this.page.waitForLoadState('networkidle');
      const loadTime = (Date.now() - startTime) / 1000;
      expect(loadTime).toBeLessThan(seconds);
    }
  }
);
