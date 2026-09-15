// Isolated authenticated browser verification. Never connects to the project database.
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import Sale from "../src/models/Sale.js";
import User from "../src/models/User.js";
import { businessDate } from "../src/lib/dates.js";

const base = "http://localhost:3108";
const password = randomBytes(6).toString("hex");
let repl, server, browser;
try {
  repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: `${process.cwd()}/.cache/mongodb` },
    replSet: { count: 1 },
  });
  const uri = repl.getUri("reports_ui_test");
  await mongoose.connect(uri);
  await User.create({
    name: "Reports Test Admin",
    username: "reportstest",
    passwordHash: await bcrypt.hash(password, 10),
    role: "ADMIN",
  });
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", "3108"],
    {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        NEXT_DIST_DIR: ".cache/reports-build",
        MONGODB_URI: uri,
        MONGODB_DB_NAME: "reports_ui_test",
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
  await page.goto(`${base}/reports`);
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("Username", { exact: true }).fill("reportstest");
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
  const day = await call("/day-sessions", {
    action: "open",
    openingCash: 5000,
  });
  await page.goto(`${base}/reports`);
  await expect(
    page.getByText("No sales or expenses were recorded for this period."),
  ).toBeVisible();
  const admin = await User.findOne({ username: "reportstest" });
  const categoryId = new mongoose.Types.ObjectId();
  const today = businessDate();
  const items = Array.from({ length: 12 }, (_, i) => ({
    productId: new mongoose.Types.ObjectId(),
    productName: i === 11 ? "Z Best Juice" : `Juice ${i + 1}`,
    categoryId,
    categoryName: "Fresh Juice",
    quantity: 1,
    unitPrice: i === 11 ? 390 : 10,
    lineTotal: i === 11 ? 390 : 10,
  }));
  await Sale.create({
    invoiceNumber: "TEST-REPORT-1",
    requestId: "report-test-1",
    daySessionId: day._id,
    cashier: { userId: admin._id, name: admin.name },
    items,
    subtotal: 500,
    total: 500,
    discount: { amount: 0 },
    tax: { amount: 0 },
    paymentMethod: "Split",
    payments: [
      { method: "Cash", amount: 200 },
      { method: "UPI", amount: 300 },
    ],
    createdAt: new Date(`${today}T23:00:00+05:30`),
  });
  await Sale.create({
    invoiceNumber: "TEST-REPORT-VOID",
    requestId: "report-test-void",
    daySessionId: day._id,
    cashier: { userId: admin._id, name: admin.name },
    items: [],
    subtotal: 9999,
    total: 9999,
    status: "CANCELLED",
    paymentMethod: "Cash",
  });
  const expenseCategory = await call("/expense-categories", {
    name: "Ingredients",
    active: true,
  });
  await call("/expenses", {
    categoryId: expenseCategory._id,
    description: "Test fruit purchase",
    amount: 100,
    paymentMethod: "Cash",
    expenseDate: today,
    note: "",
  });
  await page.reload();
  await expect(page.locator(".report-kpi").first()).toContainText("500.00");
  await expect(page.locator(".report-kpi").nth(2)).toContainText("400.00");
  await expect(page.locator(".report-kpi").nth(3)).toContainText("1");
  await expect(page.locator(".payment-list")).toContainText("40.0%");
  await expect(page.locator(".payment-list")).toContainText("60.0%");
  await expect(page.locator(".business-summary")).toContainText("11 PM");
  await page.getByLabel("Sort products").selectOption("name");
  await expect(page.locator(".top-products > div").first()).toContainText(
    "Z Best Juice",
  );
  await expect(page.locator("#report-products tbody tr:visible")).toHaveCount(
    10,
  );
  await page.getByRole("button", { name: "View All 12 Products" }).click();
  await expect(page.locator("#report-products tbody tr:visible")).toHaveCount(
    12,
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Report" }).click();
  const download = await downloadPromise;
  await mkdir("test-results", { recursive: true });
  await download.saveAs("test-results/reports-export.csv");
  await page.screenshot({
    path: "test-results/reports-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Show First 10" }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#report-products tbody tr:visible")).toHaveCount(
    12,
  );
  await page.pdf({
    path: "test-results/reports-print.pdf",
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.getByLabel("Period", { exact: true }).selectOption("custom");
  await page.getByLabel("From date", { exact: true }).fill("2020-01-01");
  await page.getByRole("button", { name: "Apply Range" }).click();
  await expect(
    page.locator(".reports-workspace").getByRole("alert"),
  ).toContainText("366 days");
  await page.getByLabel("From date", { exact: true }).fill(today);
  await page.getByRole("button", { name: "Apply Range" }).click();
  await expect(
    page.locator(".reports-workspace").getByRole("alert"),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400); // Allow the existing sidebar resize transition to settle.
  await page.screenshot({
    path: "test-results/reports-mobile.png",
    fullPage: true,
  });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Reports page overflows on mobile");
  if (errors.length) throw new Error(errors.join("; "));
  console.log(
    "PASS: Reports real API totals, split allocations, cancelled exclusion, all 24 hours, stable rankings, table expansion, CSV, print, custom dates and mobile layout.",
  );
} finally {
  await browser?.close();
  server?.kill();
  await mongoose.disconnect();
  await repl?.stop();
}
