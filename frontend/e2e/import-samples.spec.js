import { expect, test } from "@playwright/test";
import { adminLogin, DEMO, otpLogin } from "./helpers";

/** Downloads the sample from the dialog and uploads that same file back. */
async function importSample(page, dialog, sampleButton = "Excel sample") {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: sampleButton }).click(),
  ]);
  const path = await download.path();
  await dialog
    .locator("input[type=file]")
    .setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/octet-stream",
      buffer: await (await import("node:fs/promises")).readFile(path),
    });
  await expect(dialog.getByText(download.suggestedFilename())).toBeVisible();
  return download.suggestedFilename();
}

test("admin candidate import shows the format guide and the sample imports cleanly", async ({
  page,
}) => {
  await adminLogin(page);
  await page.goto("/admin/candidates");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import candidates" });
  await expect(dialog.getByText("Column guide")).toBeVisible();
  await expect(
    dialog.getByRole("cell", { name: "Full Name", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("cell", { name: "Total Experience (Months)" }),
  ).toBeVisible();

  const name = await importSample(page, dialog);
  expect(name).toBe("freejobwala-candidates-sample.xlsx");
  await dialog.getByRole("button", { name: "Check duplicates" }).click();
  await expect(
    dialog.getByText(/rows · .* repeated inside the file/),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog.getByText(/Import finished/)).toBeVisible();
  await expect(dialog.getByText("Rows in file")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
});

test("admin master data import offers a sample for the chosen list", async ({
  page,
}) => {
  await adminLogin(page);
  await page.goto("/admin/taxonomy");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^Import / });
  await expect(
    dialog.getByRole("cell", { name: "Name", exact: true }),
  ).toBeVisible();
  await importSample(page, dialog, "CSV sample");
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(
    dialog.getByText("Import finished with no errors."),
  ).toBeVisible();
});

test("employer bulk job import shows the guide and a sample to download", async ({
  page,
}) => {
  await otpLogin(page, "/employer/login", DEMO.employerMobile);
  await page.goto("/employer/jobs");
  await page.getByRole("button", { name: "Bulk import" }).click();
  const dialog = page.getByRole("dialog", { name: "Bulk import jobs" });
  await expect(
    dialog.getByRole("cell", { name: "Job Title", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("cell", { name: "Full Time, Permanent", exact: true })).toBeVisible();
  const name = await importSample(page, dialog);
  expect(name).toBe("freejobwala-jobs-sample.xlsx");
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  // Either imported, or the plan does not include bulk posting: both must be explained in the dialog.
  await expect(dialog.getByText(/Import finished|paid plans/)).toBeVisible();
});
