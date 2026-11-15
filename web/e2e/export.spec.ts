import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, follow, test } from "./fixtures";
import { COMPANIES } from "./settings";

const { transport } = COMPANIES;

async function download(page: Page, name: string) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name }).click(),
  ]);
  return {
    filename: file.suggestedFilename(),
    content: await readFile((await file.path())!, "utf8"),
  };
}

test("a company report to print or save as PDF, without the private note", async ({
  page,
  user,
}) => {
  await follow(page, transport.orgNumber);
  await page.getByLabel("Your note").fill("Private: ask about the price");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Report (PDF)" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/companies/${transport.orgNumber}/report$`),
  );
  await expect(page).toHaveTitle(
    new RegExp(`^${transport.name} – Supplier check`),
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    transport.name,
  );
  for (const section of [
    "Risk",
    "Company details",
    "Roles",
    "Annual accounts",
    "Recent changes",
  ]) {
    await expect(
      page.getByRole("heading", { level: 2, name: section, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByText(`by ${user.firstName} ${user.lastName}`),
  ).toBeVisible();
  await expect(page.getByText("Private: ask about the price")).toHaveCount(0);

  // On paper: no menu, no buttons, the report itself
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("banner")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Print or save as PDF" }),
  ).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const pdf = await page.pdf({ format: "A4" });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");

  await page.emulateMedia({ media: "screen" });
  await page.getByRole("link", { name: "Back to the company" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/companies/${transport.orgNumber}$`),
  );
});

test("the watchlist and its changes download as CSV files", async ({
  page,
  user,
}) => {
  void user;
  await follow(page, transport.orgNumber);
  await page.goto("/watchlist");

  const companies = await download(page, "Companies (CSV)");
  expect(companies.filename).toMatch(
    /^leverandorvakt-companies-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const [header, row] = companies.content.split("\r\n");
  expect(header).toMatch(/^﻿Organization number,Name,Status,/);
  expect(row).toContain(`${transport.orgNumber},${transport.name},Active,`);

  const changes = await download(page, "Changes (CSV)");
  expect(changes.filename).toMatch(/^leverandorvakt-changes-/);
  expect(changes.content).toMatch(/^﻿Detected,Organization number,/);
});
