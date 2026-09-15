import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import User from "../src/models/User.js";
import Setting from "../src/models/Setting.js";
const base = "http://localhost:3102";
let repl, server, browser, cookie;
async function call(path, method = "GET", body) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, response, ...await response.json() };
}
try {
  repl = await MongoMemoryReplSet.create({ binary: { downloadDir: ".cache/mongodb" }, replSet: { count: 1 } });
  const uri = repl.getUri("product_receipt_test");
  await mongoose.connect(uri);
  const password = randomUUID();
  await User.create({ name: "Test Admin", username: "focusedadmin", passwordHash: await bcrypt.hash(password, 10), role: "ADMIN", active: true });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "3102"], { windowsHide: true, stdio: "ignore", env: { ...process.env, MONGODB_URI: uri, MONGODB_DB_NAME: "product_receipt_test", JWT_SECRET: randomUUID().repeat(2), NODE_ENV: "production" } });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/login`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const login = await call("/auth/login", "POST", { username: "focusedadmin", password });
  assert.equal(login.status, 200, login.message);
  cookie = login.response.headers.get("set-cookie").split(";")[0];
  const category = (await call("/categories", "POST", { name: "Juices", active: true })).data;
  const input = { name: "Special Mango", categoryId: category._id, basePrice: 80, active: true, special: true, variantsEnabled: false, addonsEnabled: false, variants: [], addons: [] };
  const a = (await call("/products", "POST", input)).data;
  const b = (await call("/products", "POST", { ...input, name: "Regular Lime", special: false })).data;
  assert.equal(a.special, true);
  assert.equal((await call("/products?special=true")).data.total, 1);
  await Setting.updateOne({ _id: "shop" }, { $set: { paymentMethods: ["Cash", "UPI"], "loyalty.enabled": false, "checkout.autoPrint": false } });
  assert.equal((await call("/day-sessions", "POST", { action: "open", openingCash: 0 })).status, 200);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    window.print = () => {
      window.parent.__printedReceipt = {
        html: document.documentElement.outerHTML,
        pageRule: document.getElementById("thermal-receipt-page")?.textContent,
      };
    };
  });
  const [name, value] = cookie.split("=");
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  await page.goto(`${base}/products`);
  await page.getByRole("checkbox", { name: "Select Special Mango", exact: true }).check();
  await page.getByRole("button", { name: "Mass Update", exact: true }).click();
  await page.getByLabel(/Base price \(INR\)/).fill("95");
  await page.getByRole("button", { name: "Apply changes" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await call(`/products/${a._id}`)).data.basePrice, 95);
  assert.equal((await call(`/products/${b._id}`)).data.basePrice, 80);
  await page.goto(`${base}/pos`);
  await page.getByRole("button", { name: "Special", exact: true }).click();
  await page.getByRole("button", { name: /Special Mango/ }).click();
  await page.getByRole("button", { name: /Proceed Payment/ }).click();
  const methods = page.locator(".checkout-methods");
  await methods.waitFor();
  assert.equal(await methods.locator("button").count(), 2);
  const widths = await methods.evaluate(el => ({ total: el.clientWidth, gap: parseFloat(getComputedStyle(el).gap), buttons: [...el.children].map(b => b.getBoundingClientRect().width) }));
  assert.ok(Math.abs(widths.buttons.reduce((x, y) => x + y, 0) + widths.gap - widths.total) < 2);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/checkout-two-methods.png", fullPage: true });
  await page.getByRole("button", { name: "GPay / UPI", exact: true }).click();
  await page.getByRole("button", { name: /Complete Sale/ }).click();
  await page.locator(".receipt").first().waitFor();
  assert.doesNotMatch(await page.locator(".receipt").first().innerText(), /Cashback earned|Stamps earned|Wallet used/);
  assert.doesNotMatch(await page.locator(".receipt").first().innerText(), /Juice POS/);
  assert.doesNotMatch(await page.locator(".receipt").first().innerText(), /Powered by/);
  assert.match(await page.locator(".receipt").first().innerText(), /•/);
  assert.match(await page.locator(".receipt").first().innerText(), /PAYMENT\s+Method\s+GPay \/ UPI/);
  assert.match(await page.locator(".receipt").first().innerText(), /Thank you!\s+Visit again/);
  await page.screenshot({ path: "test-results/receipt-redesign.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Print Bill", exact: true }).click();
  await page.waitForFunction(() => window.__printedReceipt?.pageRule?.includes("@page"));
  const printed = await page.evaluate(() => window.__printedReceipt);
  assert.match(printed.pageRule, /size: 80mm \d+mm/);
  assert.doesNotMatch(printed.pageRule, /80mm auto/);
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".receipt").first().evaluate(el => getComputedStyle(el).color), "rgb(0, 0, 0)");
  const printPage = await context.newPage();
  await printPage.goto(`${base}/login`);
  await printPage.setContent(printed.html);
  await printPage.emulateMedia({ media: "print" });
  const pdf = await printPage.pdf({ path: "test-results/receipt-redesign.pdf", preferCSSPageSize: true, printBackground: true });
  const mediaBoxes = [...pdf.toString("latin1").matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/g)];
  assert.equal(mediaBoxes.length, 1, "Receipt fits on one thermal page");
  assert.ok(Math.abs(Number(mediaBoxes[0][1]) * 25.4 / 72 - 80) < 0.5, "PDF page itself is 80mm wide");
  console.log(`Thermal PDF: ${(Number(mediaBoxes[0][1]) * 25.4 / 72).toFixed(1)}mm wide, ${(Number(mediaBoxes[0][2]) * 25.4 / 72).toFixed(1)}mm high`);
  const sales = (await call("/sales")).data.items;
  assert.equal(sales.length, 1);
  const ids = [a._id, b._id];
  assert.equal((await call("/products/bulk", "PATCH", { action: "update", ids, changes: { special: true, available: false } })).status, 200);
  assert.equal((await call("/products?special=true")).data.total, 2);
  assert.equal((await call("/products/bulk", "PATCH", { action: "delete", ids: [a._id, "1234567890abcdef12345678"] })).status, 409);
  assert.equal((await call(`/products/${a._id}`)).status, 200);
  assert.equal((await call("/products/bulk", "PATCH", { action: "delete", ids })).data.count, 2);
  const preserved = (await call(`/sales/${sales[0]._id}`)).data;
  assert.equal(preserved.items[0].productName, "Special Mango");
  assert.equal(preserved.total, 95);
  console.log("PASS: bulk update/delete, atomic stale selection, Special filter, preserved invoices, browser bulk editor, payment spacing, disabled loyalty receipt, print styling.");
} finally {
  await browser?.close();
  server?.kill();
  await mongoose.disconnect();
  await repl?.stop();
}
