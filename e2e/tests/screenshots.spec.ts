// @shots: refresh docs/screenshots (make screenshots). Not part of make test-ui.
// Plays enough of each chapter that each page has something to show.
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { ROOT } from '../helpers/env';

const OUT = path.join(ROOT, 'docs/screenshots');
test.describe.configure({ mode: 'serial' });
// Full-page captures paint sticky elements mid-page; unstick them (docs only).
test.use({ bypassCSP: true });

const shoot = async (page: Page, id: string) => {
  for (const vp of [{ n: 'desktop', width: 1440, height: 900 }, { n: 'phone', width: 390, height: 844 }]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(700);
    await page.addStyleTag({ content: '.topbar-wrap{position:static!important}.vg-sidebar{position:static!important;height:auto!important;min-height:100%!important}.skip-link{display:none!important}' });
    await page.screenshot({ path: path.join(OUT, `${id}${vp.n === 'phone' ? '-phone' : ''}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
};
const click = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).click();

test('@shots the night', async ({ page }) => {
  await page.goto('/#/overview');
  await page.waitForLoadState('networkidle');
  await shoot(page, 'overview');
  await page.goto('/#/rule');
  await expect(page.locator('.policy-src').first()).toBeVisible();
  await shoot(page, 'rule');
  await page.goto('/#/second-key');
  await click(page, 'Ask without a ticket');
  await click(page, 'Ask with the ticket');
  await click(page, /Approve as Ines/);
  await click(page, /Approve as Jonas/);
  await expect(page.getByText('not in governor-keyholders')).toBeVisible();
  await shoot(page, 'second-key');
  await click(page, /Approve as Kofi/);
  await click(page, /^Open it$/);
  await expect(page.locator('.gov-hero .riddle')).toBeVisible();
  await shoot(page, 'second-key-released');
  await page.goto('/#/algorithm');
  await click(page, 'Verify the v1 baseline');
  await click(page, 'Ask for ECDSA P-384');
  await click(page, 'Ask for ML-DSA-65');
  await click(page, 'Approve as ines');
  await click(page, 'Approve as kofi');
  await click(page, 'Complete the change');
  await click(page, 'Sign the manifest again');
  await click(page, 'Verify every signature');
  await expect(page.getByText('ml-dsa-65: valid')).toBeVisible();
  await shoot(page, 'algorithm');
  await page.goto('/#/left');
  await click(page, 'Read the roster');
  await click(page, 'Rowan asks');
  await click(page, 'Ines approves');
  await click(page, /Mara signs in/);
  await click(page, 'Offboard Mara');
  await click(page, 'What can she still do?');
  await expect(page.getByText('Vault does not count it').first()).toBeVisible();
  await shoot(page, 'left');
  await click(page, 'HR reconciles the roster');
  await page.goto('/#/ledger');
  await expect(page.locator('.ledger__event').first()).toBeVisible();
  await shoot(page, 'ledger');
  await page.goto('/#/layers');
  await expect(page.locator('.phase').first()).toBeVisible();
  await shoot(page, 'layers');
});
