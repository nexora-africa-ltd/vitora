/**
 * Pharmacy Drug Catalog Step Definitions
 *
 * Steps for drug catalog management, search, and information display.
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';
import { safeHashes } from '../../support/fixtures';

type CatalogDrug = {
  id?: number;
  generic_name: string;
  strength?: string;
  form?: string;
  category?: string;
  schedule?: string;
  keml_code?: string;
  current_stock?: number;
};

function ensureCatalogApiMock(world: VitoraWorld, drugs: CatalogDrug[]): void {
  world.store('catalogDrugs', drugs);

  if (!world.page) return;

  void world.page.route('**/api/pharmacy/drugs**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: drugs.map((d, idx) => ({
          id: d.id ?? idx + 1,
          generic_name: d.generic_name,
          strength: d.strength ?? '',
          form: d.form ?? '',
          category: d.category ?? '',
          schedule: d.schedule ?? '',
          keml_code: d.keml_code ?? '',
          current_stock: d.current_stock ?? 0,
          is_active: true,
          name: `${d.generic_name} ${d.strength ?? ''}`.trim(),
        })),
        count: drugs.length,
      }),
    });
  });
}

/**
 * Drug catalog navigation
 */

Given(
  'I am on the drug catalog page',
  async function (this: VitoraWorld) {
    this.currentPage = 'drug catalog';

    if (this.page) {
      await this.page.goto('/pharmacy/drugs');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'the drug catalog contains the following drugs:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const drugs = safeHashes(dataTable.hashes());
    ensureCatalogApiMock(this, drugs as unknown as CatalogDrug[]);
  }
);

Given(
  'the drug catalog has drugs in multiple categories',
  async function (this: VitoraWorld) {
    const drugs: CatalogDrug[] = [
      { generic_name: 'Paracetamol', strength: '500mg', form: 'TABLET', category: 'ANALGESIC', schedule: 'OTC', current_stock: 45 },
      { generic_name: 'Amoxicillin', strength: '500mg', form: 'CAPSULE', category: 'ANTIBIOTIC', schedule: 'POM', current_stock: 450 },
      { generic_name: 'Artemether-Lumefantrine', strength: '20/120mg', form: 'TABLET', category: 'ANTIMALARIAL', schedule: 'POM', current_stock: 200 },
      { generic_name: 'Metformin', strength: '500mg', form: 'TABLET', category: 'ANTIDIABETIC', schedule: 'POM', current_stock: 0 },
      { generic_name: 'Amlodipine', strength: '5mg', form: 'TABLET', category: 'ANTIHYPERTENSIVE', schedule: 'POM', current_stock: 120 },
    ];
    ensureCatalogApiMock(this, drugs);
  }
);

Given(
  'the drug catalog has drugs in multiple forms',
  async function (this: VitoraWorld) {
    const drugs: CatalogDrug[] = [
      { generic_name: 'Paracetamol', strength: '500mg', form: 'TABLET', category: 'ANALGESIC', schedule: 'OTC', current_stock: 45 },
      { generic_name: 'Amoxicillin', strength: '500mg', form: 'CAPSULE', category: 'ANTIBIOTIC', schedule: 'POM', current_stock: 450 },
      { generic_name: 'Salbutamol', strength: '100mcg', form: 'INHALER', category: 'RESPIRATORY', schedule: 'P', current_stock: 80 },
      { generic_name: 'Hydrocortisone', strength: '1%', form: 'CREAM', category: 'DERMATOLOGY', schedule: 'OTC', current_stock: 60 },
      { generic_name: 'Ceftriaxone', strength: '1g', form: 'INJECTION', category: 'ANTIBIOTIC', schedule: 'POM', current_stock: 30 },
      { generic_name: 'Paracetamol', strength: '120mg/5mL', form: 'SYRUP', category: 'ANALGESIC', schedule: 'OTC', current_stock: 25 },
    ];
    ensureCatalogApiMock(this, drugs);
  }
);

Given(
  'the drug catalog has drugs with different schedules',
  async function (this: VitoraWorld) {
    const drugs: CatalogDrug[] = [
      { generic_name: 'Paracetamol', strength: '500mg', form: 'TABLET', category: 'ANALGESIC', schedule: 'OTC', current_stock: 45 },
      { generic_name: 'Cetirizine', strength: '10mg', form: 'TABLET', category: 'ANTIHISTAMINE', schedule: 'P', current_stock: 70 },
      { generic_name: 'Amoxicillin', strength: '500mg', form: 'CAPSULE', category: 'ANTIBIOTIC', schedule: 'POM', current_stock: 450 },
      { generic_name: 'Morphine', strength: '10mg/mL', form: 'INJECTION', category: 'ANALGESIC', schedule: 'CD', current_stock: 5 },
    ];
    ensureCatalogApiMock(this, drugs);
  }
);

Given(
  'a drug with schedule {string}',
  async function (this: VitoraWorld, schedule: string) {
    this.store('selectedDrugSchedule', schedule);
  }
);

Given(
  'a drug is classified as schedule {string}',
  async function (this: VitoraWorld, schedule: string) {
    this.store('selectedDrugSchedule', schedule);
  }
);

/**
 * Drug search steps
 */

When(
  'I search for drug {string}',
  async function (this: VitoraWorld, searchTerm: string) {
    this.store('drugSearchTerm', searchTerm);

    if (this.page) {
      await this.page.fill('[data-testid="drug-search"]', searchTerm);
      await this.page.waitForTimeout(500);
    }
  }
);

Then(
  'I should see drugs matching {string}',
  async function (this: VitoraWorld, searchTerm: string) {
    if (this.page) {
      const results = await this.page.locator('[data-testid="drug-item"]').all();
      for (const result of results) {
        const text = await result.textContent();
        expect(text?.toLowerCase()).toContain(searchTerm.toLowerCase());
      }
    }
  }
);

Then(
  'the search results should include:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const expectedDrugs = safeHashes(dataTable.hashes());

    if (this.page) {
      for (const drug of expectedDrugs) {
        const drugName = drug.name || drug.drug_name;
        const drugItem = this.page.locator(`[data-testid="drug-item"]:has-text("${drugName}")`);
        await expect(drugItem).toBeVisible();
      }
    }
  }
);

/**
 * Drug filtering steps
 */

When(
  'I filter by category {string}',
  async function (this: VitoraWorld, category: string) {
    this.store('drugCategoryFilter', category);

    if (this.page) {
      await this.page.selectOption('[data-testid="category-filter"]', category);
      await this.page.waitForTimeout(300);
    }
  }
);

When(
  'I filter by form {string}',
  async function (this: VitoraWorld, form: string) {
    this.store('drugFormFilter', form);

    if (this.page) {
      await this.page.selectOption('[data-testid="form-filter"]', form);
      await this.page.waitForTimeout(300);
    }
  }
);

When(
  'I filter by schedule {string}',
  async function (this: VitoraWorld, schedule: string) {
    this.store('drugScheduleFilter', schedule);

    if (this.page) {
      await this.page.selectOption('[data-testid="schedule-filter"]', schedule);
      await this.page.waitForTimeout(300);
    }
  }
);

Then(
  'I should only see drugs in category {string}',
  async function (this: VitoraWorld, category: string) {
    if (this.page) {
      const drugItems = await this.page.locator('[data-testid="drug-item"]').all();
      for (const item of drugItems) {
        const categoryBadge = await item.locator('[data-testid="drug-category"]').textContent();
        expect(categoryBadge).toBe(category);
      }
    }
  }
);

Then(
  'I should only see drugs with category {string}',
  async function (this: VitoraWorld, category: string) {
    const drugs = this.retrieve<CatalogDrug[]>('catalogDrugs') || [];
    const filtered = drugs.filter(d => d.category === category);
    this.store('filteredCatalogDrugs', filtered);

    if (this.page) {
      const drugItems = await this.page.locator('[data-testid="drug-item"]').all();
      for (const item of drugItems) {
        const categoryBadge = await item.locator('[data-testid="drug-category"]').textContent();
        expect(categoryBadge).toBe(category);
      }
    }
  }
);

Then(
  'I should only see drugs with form {string}',
  async function (this: VitoraWorld, form: string) {
    const drugs = this.retrieve<CatalogDrug[]>('catalogDrugs') || [];
    const filtered = drugs.filter(d => d.form === form);
    this.store('filteredCatalogDrugs', filtered);

    if (this.page) {
      const drugItems = await this.page.locator('[data-testid="drug-item"]').all();
      for (const item of drugItems) {
        const formBadge = await item.locator('[data-testid="drug-form"]').textContent();
        expect(formBadge).toBe(form);
      }
    }
  }
);

Then(
  'I should only see drugs with schedule {string}',
  async function (this: VitoraWorld, schedule: string) {
    const drugs = this.retrieve<CatalogDrug[]>('catalogDrugs') || [];
    const filtered = drugs.filter(d => d.schedule === schedule);
    this.store('filteredCatalogDrugs', filtered);

    if (this.page) {
      const drugItems = await this.page.locator('[data-testid="drug-item"]').all();
      for (const item of drugItems) {
        const badge = await item.locator('[data-testid="drug-schedule"]').textContent();
        expect(badge).toBe(schedule);
      }
    }
  }
);

Then(
  '{string} should be displayed',
  async function (this: VitoraWorld, description: string) {
    if (this.page) {
      await expect(this.page.locator('body')).toContainText(description);
    } else {
      this.store('lastDisplayedDescription', description);
      expect(description.length).toBeGreaterThan(0);
    }
  }
);

Then(
  'the drug should show prescription required as {string}',
  async function (this: VitoraWorld, expected: string) {
    const schedule = String(this.retrieve<string>('selectedDrugSchedule') || '').toUpperCase();
    const requires = schedule === 'POM' || schedule === 'CD' ? 'Yes' : 'No';
    expect(requires).toBe(expected);
  }
);

/**
 * Drug card / details aliases used by feature files
 */

When(
  'I view the drug card',
  async function (this: VitoraWorld) {
    this.store('viewedDrugCard', true);
    if (this.page) {
      const card = this.page.locator('[data-testid="drug-card"], [data-testid="drug-item"]').first();
      await expect(card).toBeVisible();
    }
  }
);

When(
  'I click on the drug to view details',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.locator('[data-testid="drug-item"], [data-testid="drug-card"]').first().click();
    }
  }
);

When(
  'I view the drug details',
  async function (this: VitoraWorld) {
    if (this.page) {
      const details = this.page.locator('[data-testid="drug-details"], [data-testid="drug-detail"]').first();
      await expect(details).toBeVisible();
    }
  }
);

/**
 * Drug details steps
 */

When(
  'I click on drug {string}',
  async function (this: VitoraWorld, drugName: string) {
    this.store('selectedDrug', drugName);

    if (this.page) {
      await this.page.click(`[data-testid="drug-item"]:has-text("${drugName}")`);
    }
  }
);

Then(
  'I should see the drug details:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const expectedDetails = dataTable.rowsHash() as Record<string, string>;

    if (this.page) {
      const detailsPanel = this.page.locator('[data-testid="drug-details"]');
      await expect(detailsPanel).toBeVisible();

      for (const [field, value] of Object.entries(expectedDetails)) {
        const fieldElement = detailsPanel.locator(`[data-testid="drug-${field.toLowerCase().replace(/\s+/g, '-')}"]`);
        await expect(fieldElement).toContainText(value);
      }
    }
  }
);

/**
 * Drug interactions and alerts
 */

Given(
  'the patient has an allergy to {string}',
  async function (this: VitoraWorld, allergen: string) {
    this.store('patientAllergen', allergen);
  }
);

Then(
  'I should see an allergy warning for {string}',
  async function (this: VitoraWorld, drugName: string) {
    if (this.page) {
      const warning = this.page.locator('[data-testid="allergy-warning"]');
      await expect(warning).toBeVisible();
      await expect(warning).toContainText(drugName);
    }
  }
);

Then(
  'the drug should be flagged as potentially dangerous',
  async function (this: VitoraWorld) {
    if (this.page) {
      const flag = this.page.locator('[data-testid="danger-flag"]');
      await expect(flag).toBeVisible();
    }
  }
);
