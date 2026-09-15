// Isolated authenticated browser verification. Never connects to the project database.
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import User from "../src/models/User.js";
import { businessDate } from "../src/lib/dates.js";

const base = "http://localhost:3107";
const password = randomBytes(6).toString("hex");
let repl, server, browser;
try {
  repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: `${process.cwd()}/.cache/mongodb` },
    replSet: { count: 1 },
  });
  const uri = repl.getUri("expense_ui_test");
  await mongoose.connect(uri);
  await User.create({
    name: "Expense Test Admin",
    username: "expensetest",
    passwordHash: await bcrypt.hash(password, 10),
    role: "ADMIN",
  });
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", "3107"],
    {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        NEXT_DIST_DIR: ".cache/expenses-build",
        MONGODB_URI: uri,
        MONGODB_DB_NAME: "expense_ui_test",
        JWT_SECRET: randomBytes(48).toString("hex"),
        NODE_ENV: "production",
      },
    },
  );
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null)
      throw new Error("Isolated test server exited");
    try {
      if ((await fetch(`${base}/login`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Isolated test server did not start");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/expenses`);
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("Username", { exact: true }).fill("expensetest");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  async function call(path, body) {
    const response = await page.request.post(`${base}/api${path}`, {
      headers: { Origin: base },
      data: body,
    });
    const json = await response.json();
    if (!response.ok()) throw new Error(`${path}: ${json.message}`);
    return json.data;
  }
  await call("/day-sessions", { action: "open", openingCash: 5000 });
  const category = await call("/expense-categories", {
    name: "Purchase",
    active: true,
  });
  await page.goto(`${base}/expenses`);
  await expect(
    page.getByRole("heading", { name: "No expenses recorded" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "This Month", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Add First Expense", exact: true })
    .click();
  await page.getByRole("button", { name: "Save Expense", exact: true }).click();
  await expect(page.getByText("Amount must be greater than 0.")).toBeVisible();
  await page.locator('[name="amount"]').fill("1250");
  await page.locator('[name="categoryId"]').selectOption(category._id);
  await page
    .locator('input[name="description"]')
    .fill("Fruit supplier delivery");
  await page.getByRole("button", { name: "Cash", exact: true }).click();
  await page.getByRole("button", { name: "Save Expense", exact: true }).click();
  await expect(page.getByText("Expense added successfully.")).toBeVisible();
  for (let i = 0; i < 11; i++)
    await call("/expenses", {
      categoryId: category._id,
      description: `Packaging test ${i + 1}`,
      amount: 50,
      paymentMethod: i % 2 ? "Card" : "UPI",
      expenseDate: businessDate(),
      note: "Disposable browser test",
    });
  await page.reload();
  await expect(page.locator(".expense-table tbody tr")).toHaveCount(10);
  await expect(page.locator(".expense-summary-card").first()).toContainText(
    "1,800.00",
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".expense-table tbody tr")).toHaveCount(2);
  await page.getByLabel("Rows per page").selectOption("25");
  await expect(page.locator(".expense-table tbody tr")).toHaveCount(12);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/expenses-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("Search description, category, amount or user")
    .fill("1250");
  await expect(page.locator(".expense-table tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Open actions for Fruit supplier delivery" })
    .click();
  await page.getByRole("menuitem", { name: "View Details" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Fruit supplier delivery",
  );
  await page.getByRole("button", { name: "Edit Expense", exact: true }).click();
  await page.locator('[name="amount"]').fill("1300");
  await page
    .getByRole("button", { name: "Update Expense", exact: true })
    .click();
  await expect(page.getByText("Expense updated successfully.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No matching expenses" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear Filters", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open actions for Fruit supplier delivery" })
    .click();
  await page.getByRole("menuitem", { name: "Delete Expense" }).click();
  await expect(page.getByRole("dialog")).toContainText("1,300.00");
  await page
    .getByRole("button", { name: "Delete Expense", exact: true })
    .click();
  await expect(page.getByText("Expense deleted successfully.")).toBeVisible();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("From Date", { exact: true }).fill(businessDate());
  await page.getByLabel("To Date", { exact: true }).fill(businessDate());
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".expense-table tbody tr")).toHaveCount(11);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".expense-table-scroll")).toBeHidden();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Expense payment")
    .selectOption("Card");
  await page.getByRole("button", { name: "Show Expenses" }).click();
  await expect(page.locator(".expense-mobile-card")).toHaveCount(5);
  await page.screenshot({
    path: "test-results/expenses-mobile.png",
    fullPage: true,
  });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Mobile page overflows horizontally");
  // Exceed the API's 100-row maximum to catch partial-page analytics regressions.
  for (let i = 0; i < 101; i++)
    await call("/expenses", {
      categoryId: category._id,
      description: `API pagination check ${i}`,
      amount: 1,
      paymentMethod: "Cash",
      expenseDate: businessDate(),
      note: "",
    });
  await page.goto(`${base}/expenses`);
  await expect(page.locator(".expense-summary-card").first()).toContainText(
    "651.00",
  );
  await expect(page.locator(".expense-summary-card").nth(1)).toContainText(
    "112",
  );
  if (errors.length) throw new Error(errors.join("; "));
  console.log(
    "PASS: authenticated expense create/edit/delete, validation, totals, search, pagination, custom dates, mobile filters and layout; no browser runtime errors.",
  );
} finally {
  await browser?.close();
  server?.kill();
  await mongoose.disconnect();
  await repl?.stop();
}
