// The show, through the console, against the live stack. Each journey checks
// what Vault answered, never what the page assumed.
import { test, expect, type Page } from '@playwright/test';
import { story } from '../helpers/env';

test.describe.configure({ mode: 'serial' });

const click = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).click();
const settled = (page: Page) => page.waitForLoadState('networkidle');

test('the rule: every person asked with their own token', async ({ page }) => {
  await page.goto('/#/rule');
  await expect(page.getByRole('heading', { name: 'Who may do what' })).toBeVisible();
  const rows = page.locator('table tbody tr');
  await expect(rows).toHaveCount(story.people.length);
  await expect(page.locator('.policy-src').first()).toContainText('control_group');
  await expect(page.getByText('hard-mandatory').first()).toBeVisible();
});

test('chapter I: refused, held, one key, an outsider, two keys, released once', async ({ page }) => {
  await page.goto('/#/second-key');
  await click(page, 'Ask without a ticket');
  await expect(page.getByText('refused, HTTP 403').first()).toBeVisible();
  await expect(page.getByText(/egp standard policy/).first()).toBeVisible();
  await click(page, 'Ask with the ticket');
  await expect(page.getByText('held: Vault waits for two keyholders')).toBeVisible();
  await click(page, /Approve as Ines/);
  await expect(page.getByText('held: not enough eligible approvals')).toBeVisible();
  await click(page, /Open it/);
  await expect(page.getByText('Request needs further authorization').first()).toBeVisible();
  await click(page, /Approve as Jonas/);
  await expect(page.getByText('not in governor-keyholders')).toBeVisible();
  await expect(page.getByText('held: not enough eligible approvals')).toBeVisible();
  await click(page, /Approve as Kofi/);
  await expect(page.getByText('approved: Vault releases it')).toBeVisible();
  await click(page, /^Open it$/);
  await expect(page.locator('.gov-hero')).toContainText(story.breakglass.fields.recovery_code);
  await click(page, 'Try to open it again');
  await expect(page.getByText('wrapping token is not valid or does not exist').first()).toBeVisible();
});

test("chapter II: the EGP refuses P-384; ML-DSA-65 after two keys; both signatures verify", async ({ page }) => {
  await page.goto('/#/algorithm');
  await settled(page);
  await click(page, 'Verify the v1 baseline');
  await expect(page.getByText('valid', { exact: true }).first()).toBeVisible();
  await click(page, 'Ask for ECDSA P-384');
  await expect(page.getByText(/gov-algorithm-target/).first()).toBeVisible();
  await click(page, 'Ask for ML-DSA-65');
  await expect(page.getByText('held: the key stays at its version')).toBeVisible();
  await click(page, 'Approve as ines');
  await expect(page.locator('.gov-hero')).toContainText('v1');
  await click(page, 'Approve as kofi');
  await expect(page.getByText('approved: Vault releases it')).toBeVisible();
  await click(page, 'Complete the change');
  await expect(page.getByText('Vault changed the key')).toBeVisible();
  await expect(page.locator('.gov-hero')).toContainText('v2 (ml-dsa)');
  await click(page, 'Sign the manifest again');
  await expect(page.getByText('signed with v2')).toBeVisible();
  await click(page, 'Verify every signature');
  await expect(page.getByText('ec: valid')).toBeVisible();
  await expect(page.getByText('ml-dsa-65: valid')).toBeVisible();
});

test('chapter III: Mara leaves the group; nothing she does counts; Kofi completes; HR reconciles', async ({ page }) => {
  await page.goto('/#/left');
  await settled(page);
  await click(page, 'Read the roster');
  await expect(page.locator('table tbody tr')).toHaveCount(3);
  await click(page, 'Rowan asks');
  await expect(page.getByText('held', { exact: true }).first()).toBeVisible();
  await click(page, 'Ines approves');
  await click(page, /Mara signs in/);
  await expect(page.getByText('Mara holds a token')).toBeVisible();
  await page.locator('#leave-mode').selectOption('group');
  await click(page, 'Offboard Mara');
  await expect(page.getByText('not a member').first()).toBeVisible();
  await click(page, 'What can she still do?');
  await expect(page.getByText('Vault does not count it').first()).toBeVisible();
  await click(page, 'Kofi approves');
  await expect(page.getByText('approved: Vault releases it')).toBeVisible();
  await click(page, 'Rowan opens it');
  await expect(page.getByText('released').first()).toBeVisible();
  await click(page, 'HR reconciles the roster');
  await expect(page.getByText(/add mara to governor-keyholders/)).toBeVisible();
});

test('the ledger tells the night', async ({ page }) => {
  await page.goto('/#/ledger');
  await expect(page.locator('.ledger__event').first()).toBeVisible();
  await expect(page.getByText('break-glass read held for two keyholders').first()).toBeVisible();
  await expect(page.getByText('refused by the EGP: no valid ticket').first()).toBeVisible();
  await expect(page.getByText('HR changed the keyholder group').first()).toBeVisible();
});
