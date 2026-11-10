import { expect, test } from '@playwright/test';
import { DEMO, adminLogin, otpLogin } from './helpers';

test('job search box: grouped suggestions, keyboard pick, old city names', async ({ page }) => {
  await page.goto('/jobs');
  const what = page.getByRole('combobox', { name: 'Job titles, skills, roles, companies' });
  await what.click();
  await what.fill('rea');
  await expect(page.getByRole('heading', { name: 'Job titles' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Remove / }).first()).toBeVisible();

  const where = page.getByRole('combobox', { name: 'City, district or state' });
  await where.click();
  await expect(page.getByRole('button', { name: 'Use my current location' })).toBeVisible();
  await where.fill('bang');
  await expect(page.getByRole('option', { name: /Bengaluru, Karnataka/ })).toBeVisible();
});

test('header search suggests companies and opens the company page', async ({ page }) => {
  await otpLogin(page, '/login', DEMO.candidateMobile);
  const box = page.getByRole('combobox', { name: 'Search jobs: title, skill, company' });
  await box.fill('nim');
  await page.getByRole('option', { name: /Nimbus Softworks/ }).click();
  await expect(page).toHaveURL(/\/companies\//);
});

test('companies page: suggestion opens the company', async ({ page }) => {
  await page.goto('/companies');
  const box = page.getByRole('combobox', { name: /Search companies/ });
  await box.fill('or');
  await expect(page.getByRole('option', { name: /Orbitra Logistics/ })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/companies\/orbitra/);
});

test('location field on phones opens a search sheet @mobile', async ({ page }) => {
  test.skip(!page.viewportSize() || page.viewportSize().width > 640, 'phone layout only');
  await page.goto('/post-job');
  await page.getByRole('textbox', { name: 'Your company name' }).fill('Sheet Test Co');
  await page.getByRole('button', { name: /save & continue/i }).click();
  await page.getByRole('combobox', { name: 'Job locations' }).click();
  const sheet = page.getByRole('dialog', { name: 'Job locations' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Popular cities')).toBeVisible();
  await sheet.getByRole('textbox').fill('jaipru');
  await expect(sheet.getByText(/Showing places for/)).toBeVisible();
  await sheet.getByRole('option', { name: /^Jaipur/ }).first().click();
  await sheet.getByRole('button', { name: /^Done/ }).click();
  await expect(page.getByText('Jaipur, Rajasthan').first()).toBeVisible();
});

test('short forms and trending: "sde" finds software jobs, admin sees search insights', async ({ page }) => {
  await page.goto('/jobs');
  const what = page.getByRole('combobox', { name: 'Job titles, skills, roles, companies' });
  await what.fill('sde');
  await expect(page.getByRole('heading', { name: /“SDE” means/ })).toBeVisible();
  await page.getByRole('option', { name: 'Software Developer' }).click();
  await page.getByRole('button', { name: 'Search jobs' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/[1-9]\d* jobs? found/);

  await adminLogin(page);
  await page.goto('/admin/search-insights');
  await expect(page.getByRole('heading', { name: 'Search insights' })).toBeVisible();
  await expect(page.getByText('Top searches')).toBeVisible();
  await expect(page.getByRole('cell', { name: /software developer/i }).first()).toBeVisible();
  await page.getByRole('tab', { name: /Employers/ }).click();
  await expect(page).toHaveURL(/scope=candidates/);
});
