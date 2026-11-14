import { expect, test } from '@playwright/test';
import { adminLogin } from './helpers';

test('admin "login as" opens the user in a new tab and leaves the admin signed in', async ({ page, context }) => {
  await adminLogin(page);
  await page.goto('/admin/candidates');
  const row = page.locator('tbody tr').first();
  const name = (await row.locator('td').nth(1).innerText()).split('\n')[0].trim();

  const [tab] = await Promise.all([context.waitForEvent('page'), row.getByRole('button', { name: 'Login as' }).click()]);
  await tab.waitForURL(/\/candidate\/dashboard/);
  await expect(tab.getByText(`you are signed in as ${name}`)).toBeVisible();
  expect(tab.url()).not.toContain('#'); // the session token is removed from the address bar

  // A reload keeps the user's session in that tab.
  await tab.reload();
  await expect(tab).toHaveURL(/\/candidate\/dashboard/);
  await expect(tab.getByText(`you are signed in as ${name}`)).toBeVisible();

  // The admin tab is still the admin.
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/candidates/);
  await expect(page.getByRole('heading', { name: 'Candidates' })).toBeVisible();

  // Ending the session closes the user's tab; the admin stays signed in.
  await Promise.all([tab.waitForEvent('close'), tab.getByRole('button', { name: /End session/ }).click()]);
  await page.goto('/admin/overview');
  await expect(page).toHaveURL(/\/admin\/overview/);
});
