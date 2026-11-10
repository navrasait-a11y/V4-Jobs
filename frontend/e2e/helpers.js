import { expect } from '@playwright/test';

/** The test stack runs with OTP_DEV_BYPASS, so every OTP is this code. */
export const OTP = '123456';

/** Seeded demo accounts (backend/scripts/demo-data.js). */
export const DEMO = { employerMobile: '9000010001', candidateMobile: '9000020001' };

/** A fresh Indian mobile number per run, so guest flows never collide with earlier runs. */
export const freshMobile = () => `98${String(Date.now()).slice(-8)}`;
export const freshEmail = (tag) => `${tag}.${Date.now()}@example.test`;

/** Mobile-OTP login on /login or /employer/login. */
export async function otpLogin(page, path, mobile) {
  await page.goto(path);
  await page.getByRole('tab', { name: 'Mobile OTP' }).click();
  await page.getByRole('textbox', { name: 'Mobile Number' }).fill(mobile);
  await page.getByRole('button', { name: 'Send OTP' }).click();
  await page.getByRole('textbox', { name: 'OTP' }).fill(OTP);
  await page.getByRole('button', { name: /log ?in/i }).click();
  await expect(page).toHaveURL(/dashboard/);
}

/** Clicks the stepper's primary "next" button (Save & continue / Continue). */
export const next = (page) => page.getByRole('button', { name: /save & continue|^continue$/i }).click();

/**
 * Picks a place in a LocationField: desktop types into the field and picks from the dropdown, phones
 * get the full-screen search sheet.
 */
export async function pickLocation(page, label, typed, optionName) {
  await page.getByRole('combobox', { name: label }).click();
  const sheet = page.getByRole('dialog', { name: label });
  const input = (await sheet.isVisible().catch(() => false)) ? sheet.getByRole('textbox').first() : page.getByRole('combobox', { name: label });
  await input.fill(typed);
  await page.getByRole('option', { name: optionName }).first().click();
  if (await sheet.isVisible().catch(() => false)) {
    const done = sheet.getByRole('button', { name: /^Done/ });
    if (await done.isVisible().catch(() => false)) await done.click();
    else await sheet.getByRole('button', { name: 'Close' }).click();
  }
}

/** Throwaway admin created by backend/scripts/e2e-stack.js (in-memory test database only). */
export const E2E_ADMIN = { email: process.env.E2E_ADMIN_EMAIL || 'e2e.admin@example.test', password: process.env.E2E_ADMIN_PASSWORD || 'E2e-Admin-Local-1' };

export async function adminLogin(page) {
  await page.goto('/admin/login');
  await page.getByRole('textbox', { name: 'Admin email' }).fill(E2E_ADMIN.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: /log ?in/i }).click();
  await expect(page).toHaveURL(/\/admin\/(?!login)/);
}
