import { expect, test } from '@playwright/test';

test.describe('Job search', () => {
  test('corrects a misspelt search and can search the original instead', async ({ page }) => {
    await page.goto('/jobs?keywords=backnd%20develper');
    await expect(page.getByText(/Showing results for/)).toContainText('backend developer');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/[1-9]\d* jobs? found/);

    await page.getByRole('button', { name: /Search instead for/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('0 jobs found');
    await expect(page.getByText('No jobs match your search')).toBeVisible();
  });

  test('filters keep other options of the same group (disjunctive facets)', async ({ page }) => {
    await page.goto('/jobs');
    const department = page.locator('aside').getByRole('button', { name: /Department/ });
    if ((await department.getAttribute('aria-expanded')) === 'false') await department.click();
    const first = page.locator('aside label').filter({ has: page.locator('input[type=checkbox]') }).first();
    const name = (await first.innerText()).replace(/\(\d+\)/, '').trim();
    await first.click();
    await expect(page).toHaveURL(/department=/);
    // Other departments are still listed so a second one can be added.
    await expect(page.locator('aside label').filter({ has: page.locator('input[type=checkbox]') })).not.toHaveCount(1);
    await expect(page.getByText('1 filter applied')).toBeVisible();
    await expect(page.locator('aside')).toContainText(name);
  });
});

test.describe('SEO landing pages', () => {
  test('city + role page lists jobs and related links', async ({ page }) => {
    await page.goto('/backend-developer-jobs-in-delhi');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Backend Developer jobs in Delhi');
    await expect(page).toHaveTitle(/Backend Developer jobs in Delhi/);
    await expect(page.getByRole('link', { name: 'Refine with filters' })).toHaveAttribute('href', /keywords=Backend\+Developer&location=Delhi/);
    await expect(page.getByText(/other cities/)).toBeVisible();
  });

  test('unknown single-segment URL shows the 404 page', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByText('Page not found')).toBeVisible();
  });
});
