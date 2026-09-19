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
  const printer = page.locator(".thermal-printer");
  await printer.locator('.thermal-paper').waitFor();
  await page.waitForFunction(() => document.querySelector('.thermal-printer')?.dataset.state === 'printing');
  const motion = await page.evaluate(() => {
    const paper = document.querySelector('.thermal-paper');
    const animation = paper.getAnimations()[0];
    animation.pause();
    animation.currentTime = 0;
    return { duration: animation.effect.getTiming().duration, start: getComputedStyle(paper).transform };
  });
  assert.ok(motion.duration >= 1500 && motion.duration <= 2500);
  await printer.screenshot({ path: "test-results/thermal-feed-start.png", animations: "allow" });
  await page.evaluate(() => { document.querySelector('.thermal-paper').getAnimations()[0].currentTime = 1000; });
  const middle = await page.locator('.thermal-paper').evaluate(el => getComputedStyle(el).transform);
  assert.notEqual(middle, motion.start, 'Paper moves upward through the slot');
  await printer.screenshot({ path: "test-results/thermal-feed-middle.png", animations: "allow" });
  await page.getByRole('button', { name: 'Print Bill', exact: true }).click();
  await page.waitForFunction(() => window.__printedReceipt?.pageRule?.includes('@page'));
  const earlyPrint = await page.evaluate(() => {
    const document = new DOMParser().parseFromString(window.__printedReceipt.html, 'text/html');
    return { receipts: document.querySelectorAll('.receipt').length, animatedWrappers: document.querySelectorAll('.thermal-paper, .thermal-feed-window').length, footer: document.querySelector('.receipt footer')?.textContent };
  });
  assert.equal(earlyPrint.receipts, 1);
  assert.equal(earlyPrint.animatedWrappers, 0, 'Printing during the feed omits all clipping and moving wrappers');
  assert.match(earlyPrint.footer, /Thank you/);
  await page.evaluate(() => document.querySelector('.thermal-paper').getAnimations()[0].finish());
  await page.waitForFunction(() => document.querySelector('.thermal-printer')?.dataset.state === 'completed');
  assert.equal(await page.locator('.thermal-paper').evaluate(el => getComputedStyle(el).transform), 'none');
  await printer.screenshot({ path: "test-results/thermal-feed-completed.png" });
  assert.doesNotMatch(await page.locator(".receipt").first().innerText(), /Cashback earned|Stamps earned|Wallet used/);
  assert.doesNotMatch(await page.locator(".receipt").first().innerText(), /Juice POS/);
  assert.doesNotMatch(await page.locator(".receipt").first().innerText(), /Powered by/);
  assert.match(await page.locator(".receipt").first().innerText(), /Date\s+:.*\s+Time\s+:/);
  assert.match(await page.locator(".receipt").first().innerText(), /Ph 9526532437/);
  assert.equal(await page.locator(".receipt-brand img").first().getAttribute("src"), "/receipt-logo.jpeg");
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
  const storedSale = (await call(`/sales/${sales[0]._id}`)).data;
  const longInvoice = { ...storedSale, invoiceNumber: 'ANIMATION-PREVIEW', business: { ...storedSale.business, footer: 'Thanks for visiting Karikku.' }, items: Array.from({length: 40}, (_, i) => ({ ...storedSale.items[0], productName: `Receipt line ${i + 1}` })) };
  await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.getByRole('button', { name: 'New Sale', exact: true }).click();
  await page.getByRole('button', { name: /Special Mango/ }).click();
  await page.locator('.pos-mobile-summary').click();
  await page.getByRole('button', { name: /Proceed Payment/ }).click();
  await page.getByRole('button', { name: 'GPay / UPI', exact: true }).click();
  // Browser-only response fixture to test long paper without storing a test sale.
  await page.route('**/api/sales', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 201, json: { success: true, data: longInvoice } }) : route.continue());
  await page.getByRole('button', { name: /Complete Sale/ }).click();
  await page.waitForFunction(() => document.querySelector('.thermal-printer')?.dataset.state === 'completed');
  assert.equal(await page.locator('.thermal-paper').evaluate(el => el.getAnimations().length), 0);
  const feed = page.locator('.thermal-feed-window');
  assert.ok(await feed.evaluate(el => el.scrollHeight > el.clientHeight));
  await feed.evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.match(await feed.innerText(), /Thanks for visiting Karikku\./);
  await page.screenshot({ path: 'test-results/thermal-tablet-reduced-motion.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator('.thermal-printer').evaluate(el => el.scrollWidth <= el.clientWidth));
  await feed.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: 'test-results/thermal-mobile-long-receipt.png' });
  await page.getByRole('button', { name: 'New Sale', exact: true }).click();
  await page.unroute('**/api/sales');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1280, height: 900 });
  const ids = [a._id, b._id];
  assert.equal((await call("/products/bulk", "PATCH", { action: "update", ids, changes: { special: true, available: false } })).status, 200);
  assert.equal((await call("/products?special=true")).data.total, 2);
  assert.equal((await call("/products/bulk", "PATCH", { action: "delete", ids: [a._id, "1234567890abcdef12345678"] })).status, 409);
  assert.equal((await call(`/products/${a._id}`)).status, 200);
  assert.equal((await call("/products/bulk", "PATCH", { action: "delete", ids })).data.count, 2);
  const preserved = (await call(`/sales/${sales[0]._id}`)).data;
  assert.equal(preserved.items[0].productName, "Special Mango");
  assert.equal(preserved.total, 95);
  await page.emulateMedia({ media: "screen" });
  await page.goto(`${base}/settings`);
  await page.getByRole("heading", { name: "Invoice Numbering", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "General", exact: true }).count(), 0);
  assert.equal(await page.locator('input[type="file"]').count(), 0);
  assert.equal(await page.getByLabel("Business Name", { exact: true }).count(), 0);
  await page.getByLabel("Invoice Prefix", { exact: true }).fill("INV-");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await page.getByRole("button", { name: "Save Changes", exact: true }).isDisabled();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent.includes("Save Changes") && b.disabled));
  assert.equal((await call("/settings")).data.invoicePrefix, "INV-");
  await page.screenshot({ path: "test-results/settings-without-business.png", fullPage: true });
  await page.getByLabel("Receipt Size", { exact: true }).selectOption("58mm");
  await page.getByRole("button", { name: "Preview Receipt", exact: true }).click();
  await page.locator(".receipt").first().waitFor();
  await page.evaluate(() => { window.__printedReceipt = null; });
  await page.getByRole("button", { name: "Print Bill", exact: true }).click();
  await page.waitForFunction(() => window.__printedReceipt?.pageRule?.includes("size: 58mm"));
  const narrowPrinted = await page.evaluate(() => window.__printedReceipt);
  await printPage.setContent(narrowPrinted.html);
  const narrowPdf = await printPage.pdf({ path: "test-results/receipt-58mm.pdf", preferCSSPageSize: true, printBackground: true });
  const narrowBoxes = [...narrowPdf.toString("latin1").matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/g)];
  assert.equal(narrowBoxes.length, 1);
  assert.ok(Math.abs(Number(narrowBoxes[0][1]) * 25.4 / 72 - 58) < 0.5);

  // Visual fixture only: intercept the read response, never insert example sales.
  const sample = { ...preserved, invoiceNumber: "INV-20260915-028", createdAt: "2026-09-14T19:21:00.000Z", cashier: { name: "Safwan" }, customer: null, paymentMethod: "Cash", payments: [{ method: "Cash", amount: 1320 }], cashReceived: 1320, changeGiven: 0, subtotal: 1320, total: 1320, discount: { amount: 0 }, business: { ...preserved.business, receiptSize: "80mm", receipt: { showLogo: true, showCashier: true, showPayment: true } }, items: [
    { productName: "Chocolate Shake", quantity: 2, unitPrice: 80, lineTotal: 160, addons: [], addonTotal: 0 },
    { productName: "Classic Karikku Shake", quantity: 2, unitPrice: 80, lineTotal: 160, addons: [], addonTotal: 0 },
    { productName: "Pista Karikku Shake", quantity: 10, unitPrice: 100, lineTotal: 1000, addons: [], addonTotal: 0 },
  ] };
  const visualContext = await browser.newContext({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 3.2 });
  await visualContext.addCookies([{ name, value, url: base }]);
  const visual = await visualContext.newPage();
  const browserErrors = [];
  visual.on("pageerror", error => browserErrors.push(error.message));
  await visual.route(`**/api/sales/${sales[0]._id}`, route => route.fulfill({ json: { success: true, data: sample } }));
  await visual.goto(`${base}/sales/${sales[0]._id}`);
  await visual.getByRole("button", { name: "Print / Reprint", exact: true }).click();
  const sampleReceipt = visual.locator(".receipt").first();
  await sampleReceipt.waitFor();
  await sampleReceipt.locator("img").evaluate(img => img.decode());
  await sampleReceipt.screenshot({ path: "test-results/receipt-reference-match.png" });
  assert.equal(await sampleReceipt.locator(".receipt-item").count(), 3);
  assert.equal(await sampleReceipt.locator(".grand").innerText(), "TOTAL\n₹1,320.00");
  await visual.setViewportSize({ width: 390, height: 1000 });
  await visual.screenshot({ path: "test-results/receipt-mobile.png", fullPage: true });
  assert.ok(await sampleReceipt.evaluate(el => el.scrollWidth <= el.clientWidth));
  assert.deepEqual(browserErrors, []);
  await visualContext.close();
  console.log("PASS: Settings removal and save, 58mm PDF, reference fixture, mobile receipt, no browser runtime errors.");
  console.log("PASS: upward paper-feed states and duration, printing during animation, reduced motion, long scrollable receipts, custom footer, tablet/mobile layouts.");
  console.log("PASS: bulk update/delete, atomic stale selection, Special filter, preserved invoices, browser bulk editor, payment spacing, disabled loyalty receipt, print styling.");
} finally {
  await browser?.close();
  server?.kill();
  await mongoose.disconnect();
  await repl?.stop();
}
