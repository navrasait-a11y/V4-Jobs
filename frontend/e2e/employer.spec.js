import { expect, test } from '@playwright/test';
import { DEMO, next, otpLogin } from './helpers';

test.describe('Employer', () => {
  test.beforeEach(async ({ page }) => {
    await otpLogin(page, '/employer/login', DEMO.employerMobile);
  });

  test('stepped post job reaches review without publishing, then publishes', async ({ page }) => {
    await page.goto('/employer/jobs/post');
    await page.getByRole('combobox', { name: /prefill from previous/i }).click();
    await page.getByRole('option').nth(1).click();
    await expect(page.getByText(/Form filled from the previous post/)).toBeVisible();

    for (let i = 0; i < 4; i += 1) await next(page);

    // Regression: arriving on the last step must not submit the form by itself.
    await expect(page).toHaveURL(/\/employer\/jobs\/post$/);
    await expect(page.getByText('Post strength')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Post job' })).toBeVisible();

    await page.getByRole('button', { name: 'Post job' }).click();
    await expect(page).toHaveURL(/\/employer\/jobs$/);
  });

  test('applications can be sorted by best match', async ({ page }) => {
    await page.goto('/employer/applications');
    await page.getByRole('combobox', { name: 'Sort by' }).click();
    await page.getByRole('option', { name: 'Best match first' }).click();
    await expect(page).toHaveURL(/sort=-matchScore/);
  });

  test('a live job can be boosted once', async ({ page }) => {
    await page.goto('/employer/jobs?status=active');
    const boost = page.getByRole('button', { name: 'Boost job' }).first();
    await boost.click();
    await page.getByRole('button', { name: 'Boost for 15 days' }).click();
    await expect(page.getByText(/Job boosted/)).toBeVisible();
    await expect(page.getByText('Boosted').first()).toBeVisible();
  });
});
