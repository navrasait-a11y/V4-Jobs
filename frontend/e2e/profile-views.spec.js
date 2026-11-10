import { expect, test } from '@playwright/test';
import { DEMO, otpLogin } from './helpers';

test('candidate sees who viewed the profile, with free-tier locking @mobile', async ({ page }) => {
  await otpLogin(page, '/login', DEMO.candidateMobile);

  // Dashboard widget links to the full page.
  await expect(page.getByText('Who viewed your profile').first()).toBeVisible();
  await page.goto('/candidate/profile-views');
  await expect(page.getByRole('heading', { name: 'Who viewed your profile' })).toBeVisible();
  await expect(page.getByText('Profile views').first()).toBeVisible();
  await expect(page.getByText(/Unlock for ₹|See plans/)).toBeVisible();

  const rows = page.locator('section li');
  await expect(rows.first()).toBeVisible();
  // Locked rows show an Unlock link and never a company page link.
  const locked = page.locator('section li').filter({ has: page.getByRole('link', { name: 'Unlock' }) });
  for (const row of await locked.all()) await expect(row.locator('a[href^="/companies/"], a[href^="/recruiters/"]')).toHaveCount(0);

  // Longer history is a paid option.
  await page.getByRole('combobox', { name: 'Time range' }).click();
  await page.getByRole('option', { name: /Last 12 months/ }).click();
  await expect(page.getByText(/12 months of history comes with Profile Booster/)).toBeVisible();

  // Filter tabs work.
  await page.getByRole('tab', { name: 'Companies' }).click();
  await expect(page).toHaveURL(/type=company/);
});

test('recruiter can switch private profile viewing on and off', async ({ page }) => {
  await otpLogin(page, '/employer/login', DEMO.employerMobile);
  await page.goto('/employer/settings?tab=hiring');
  const privateMode = page.getByRole('radio', { name: /Private mode/ });
  await privateMode.click();
  await expect(page.getByText('Private mode on')).toBeVisible();
  await expect(privateMode).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: /Your name and company/ }).click();
  await expect(page.getByRole('radio', { name: /Your name and company/ })).toHaveAttribute('aria-checked', 'true');
});
