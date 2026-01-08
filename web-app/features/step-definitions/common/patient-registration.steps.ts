/**
 * Common Step Definitions - Patient Registration
 */

import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';

Then(
  'the referral source should be recorded',
  async function (this: VitoraWorld) {
    const source = this.retrieve<string>('referralSource');
    expect(source).toBeTruthy();

    if (this.page) {
      const el = this.page.locator('[data-testid="referral-source"], select[name="referral_source"]');
      if (await el.count()) {
        const v = await el.inputValue();
        expect(v).toBeTruthy();
      }
    }
  }
);
