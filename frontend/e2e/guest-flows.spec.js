import { expect, test } from '@playwright/test';
import { OTP, freshEmail, freshMobile, next, pickLocation } from './helpers';

test('guest posts a job in steps with OTP @mobile', async ({ page }) => {
  await page.goto('/post-job');

  // Step 1 is checked before moving on.
  await next(page);
  await expect(page.getByText('Enter your company name')).toBeVisible();
  await page.getByRole('textbox', { name: 'Your company name' }).fill('E2E Test Traders');
  await expect(page.getByText('Enter your company name')).toBeHidden(); // error clears while typing
  await next(page);

  // Basics: title + one location.
  await expect(page.getByRole('combobox', { name: /Job title/ })).toBeVisible();
  await page.getByRole('combobox', { name: /Job title/ }).fill('Field Sales Executive');
  await page.keyboard.press('Escape');
  await pickLocation(page, 'Job locations', 'jaip', /^Jaipur/);
  await expect(page.getByText('Jaipur, Rajasthan').first()).toBeVisible();
  await next(page);

  // Description.
  await page.getByRole('textbox', { name: /Job description/ }).fill('We are hiring a field sales executive to grow retail accounts in Jaipur and nearby towns.');

  // Industry picker: desktop opens a side panel, phones an accordion; both pick a sub industry the same way.
  await page.getByRole('button', { name: 'Industry', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Industry and sub industry' });
  await picker.getByRole('button', { name: /^Banking, Financial Services/ }).click();
  await picker.getByRole('checkbox', { name: 'Banking', exact: true }).click();
  await expect(picker.getByText('1/5 industries · 1/20 sub industries')).toBeVisible();
  await picker.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(/Banking, Financial Services.*\+1/)).toBeVisible();
  await next(page);
  await next(page); // criteria (optional)
  await next(page); // interview (optional)

  // Verify: employer details, declarations, OTP.
  await page.getByRole('textbox', { name: 'User full name' }).fill('E2E Recruiter');
  await page.getByRole('textbox', { name: 'Mobile Number' }).fill(freshMobile());
  await page.getByRole('textbox', { name: 'Official email ID' }).fill(freshEmail('recruiter'));
  for (const box of await page.locator('form input[type=checkbox]').all()) if (!(await box.isChecked())) await box.check();
  await page.getByRole('button', { name: /Send OTP/ }).click();
  await page.getByRole('textbox', { name: 'OTP' }).fill(OTP);
  await page.getByRole('button', { name: 'Verify & post' }).click();
  await expect(page.getByText(/is received and goes live after review/)).toBeVisible();

  // The saved draft is cleared after success.
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => localStorage.getItem('fjw.guestJobDraft'))).toBeNull();
});

test('guest applies to a job in three steps', async ({ page }) => {
  await page.goto('/jobs');
  await page.locator('a[href^="/jobs/"]').first().click();
  await page.getByRole('button', { name: /Apply now/i }).first().click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByText('Pick your experience level')).toBeVisible();

  await dialog.getByRole('button', { name: 'I am Fresher' }).click();
  await dialog.getByRole('textbox', { name: 'Full name' }).fill('E2E Candidate');
  await dialog.getByRole('textbox', { name: 'Email ID' }).fill(freshEmail('candidate'));
  await dialog.getByRole('textbox', { name: 'Mobile Number' }).fill(freshMobile());
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByText('Preferred job criteria')).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue' }).click();

  for (const box of await dialog.locator('input[type=checkbox]').all()) if (!(await box.isChecked())) await box.check();
  await dialog.getByRole('button', { name: /Send OTP & apply/ }).click();
  await dialog.getByRole('textbox', { name: 'OTP' }).fill(OTP);
  await dialog.getByRole('button', { name: 'Verify & apply' }).click();

  // The success step stays visible even though the page now has a signed-in user.
  await expect(page.getByRole('dialog').getByText('Application submitted')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Setup profile and job preference' })).toBeVisible();
});
