import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import User from "../src/models/User.js";

const base = "http://localhost:3117";
let repl, browser;
const servers = [];
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks++;
  console.log(`PASS ${checks}: ${message}`);
};
const password = randomBytes(6).toString("hex");
const secret = randomBytes(48).toString("hex");
async function start(port, uri, extra = {}) {
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", String(port)],
    {
      env: {
        ...process.env,
        NEXT_DIST_DIR: ".next-production-pages",
        MONGODB_URI: uri,
        MONGODB_DB_NAME: "page_audit_test",
        JWT_SECRET: secret,
        NODE_ENV: "production",
        MAINTENANCE_MODE: "false",
        ...extra,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  servers.push(child);
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(`Server on ${port} exited`);
    try {
      if ((await fetch(`http://localhost:${port}/login`)).status < 600) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server on ${port} did not start`);
}
async function login(username) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  check(response.status === 200, `${username} signs in`);
  return response.headers.get("set-cookie").split(";")[0];
}
async function cookieContext(cookie) {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
  });
  await context.addCookies([
    {
      name: "karikku_session",
      value: cookie.slice(cookie.indexOf("=") + 1),
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return context;
}
try {
  repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: join(process.cwd(), ".cache", "mongodb") },
    replSet: { count: 1 },
  });
  const uri = repl.getUri("page_audit_test");
  await mongoose.connect(uri, { dbName: "page_audit_test" });
  await User.create([
    {
      name: "Audit Admin",
      username: "auditadmin",
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMIN",
    },
    {
      name: "Audit Cashier",
      username: "auditcashier",
      passwordHash: await bcrypt.hash(password, 12),
      role: "CASHIER",
    },
  ]);
  await start(3117, uri);
  for (const path of ["/login", "/help", "/cookies", "/offline.html"]) {
    const response = await fetch(base + path);
    check(response.status === 200, `${path} is public and available`);
  }
  const anonymous = await fetch(`${base}/account`, { redirect: "manual" });
  check(
    anonymous.status === 307 &&
      anonymous.headers.get("location").includes("next=%2Faccount"),
    "Account redirects with safe destination",
  );
  check(
    (await fetch(`${base}/api/users`)).status === 401,
    "User API rejects anonymous access",
  );
  const adminCookie = await login("auditadmin");
  const cashierCookie = await login("auditcashier");
  const denied = await fetch(`${base}/users`, {
    headers: { Cookie: cashierCookie },
    redirect: "manual",
  });
  check(
    (denied.status === 307 &&
      denied.headers.get("location") === "/forbidden") ||
      (denied.status === 200 &&
        (await denied.text()).includes("NEXT_REDIRECT;replace;/forbidden")),
    "Cashier denied page is explicit (including streamed redirect)",
  );
  check(
    (await fetch(`${base}/api/users`, { headers: { Cookie: cashierCookie } }))
      .status === 403,
    "User API enforces permission independently",
  );
  const unknown = await fetch(`${base}/does-not-exist`, {
    headers: { Cookie: adminCookie },
  });
  check(
    (await unknown.text()).includes("Page not found"),
    "Dynamic unknown route uses custom 404",
  );
  const nestedUnknown = await fetch(`${base}/no/such/page`);
  check(
    nestedUnknown.status === 404 &&
      (await nestedUnknown.text()).includes("Page not found"),
    "Unmatched path returns custom HTTP 404",
  );
  browser = await chromium.launch({ headless: true });
  await mkdir("test-results/production-pages", { recursive: true });
  const context = await cookieContext(adminCookie);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/account`);
  await expect(
    page.getByRole("heading", { name: "Your account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Audit Admin", { exact: true }).last(),
  ).toBeVisible();
  await page.getByLabel("Profile options").click();
  await page.getByRole("link", { name: "Help and setup" }).click();
  await expect(
    page.getByRole("heading", { name: "Help with your workspace" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/production-pages/help-desktop.png",
    fullPage: true,
  });
  check(true, "Profile links reach help");
  await page.setViewportSize({ width: 390, height: 844 });
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Help fits mobile width",
  );
  await page.screenshot({
    path: "test-results/production-pages/help-mobile.png",
    fullPage: true,
  });
  await page.goto(`${base}/cookies`);
  await expect(
    page.getByRole("heading", {
      name: "Cookies and browser storage",
      exact: true,
    }),
  ).toBeVisible();
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Storage notice fits mobile width",
  );
  await page.goto(`${base}/pos`);
  await expect(
    page.getByRole("heading", { name: "No active products found" }),
  ).toBeVisible();
  await page.getByLabel("Search menu").fill("no-match");
  await expect(
    page.getByRole("heading", { name: "No matching products" }),
  ).toBeVisible();
  await expect(page.getByLabel("Search menu")).toHaveValue("no-match");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.getByLabel("Search menu")).toHaveValue("");
  check(true, "Empty/search states preserve query and reset filters");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Keep this tab open to retain unfinished work. Reconnect before saving a sale.",
    ),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/production-pages/offline-mobile.png",
    fullPage: true,
  });
  check(true, "Offline status is announced with accurate recovery guidance");
  await page.goto(`${base}/help`);
  await expect(
    page.getByRole("heading", { name: "Connection unavailable" }),
  ).toBeVisible();
  check(true, "Service worker supplies offline navigation fallback");
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page).toHaveURL(`${base}/dashboard`);
  const cashierContext = await cookieContext(cashierCookie);
  const cashierPage = await cashierContext.newPage();
  await cashierPage.goto(`${base}/users`);
  await expect(
    cashierPage.getByRole("heading", { name: "Access not available" }),
  ).toBeVisible();
  await cashierPage.getByRole("link", { name: "Return to workspace" }).click();
  await expect(cashierPage).toHaveURL(`${base}/pos`);
  check(true, "Cashier permission page returns to permitted workspace");
  await cashierContext.close();
  await User.updateOne(
    { username: "auditcashier" },
    { $inc: { tokenVersion: 1 } },
  );
  const revokedContext = await cookieContext(cashierCookie);
  const revokedPage = await revokedContext.newPage();
  // Trigger a real protected navigation after revocation.
  await revokedPage.goto(`${base}/account`);
  await expect(revokedPage).toHaveURL(/\/login\?.*reason=expired/);
  await expect(revokedPage.getByRole("status")).toContainText(
    "Your session has ended",
  );
  await revokedPage
    .getByLabel("Username", { exact: true })
    .fill("auditcashier");
  await revokedPage.getByLabel("Password", { exact: true }).fill(password);
  await revokedPage
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(revokedPage).toHaveURL(`${base}/account`);
  check(
    true,
    "Revoked session explains expiry and restores a safe destination",
  );
  const expired = await fetch(`${base}/api/auth/me`, {
    headers: { Cookie: cashierCookie },
  });
  check(
    expired.status === 401 &&
      /karikku_session=;/.test(expired.headers.get("set-cookie")),
    "Rejected API session clears cookie",
  );
  const publicContext = await browser.newContext();
  const loginPage = await publicContext.newPage();
  await loginPage.goto(
    `${base}/login?next=${encodeURIComponent("//evil.example")}`,
  );
  await loginPage.getByLabel("Username", { exact: true }).fill("auditadmin");
  await loginPage.getByLabel("Password", { exact: true }).fill("wrongpass");
  await loginPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    loginPage.getByRole("alert").filter({ hasText: "Invalid credentials" }),
  ).toBeVisible();
  await expect(loginPage.getByLabel("Username", { exact: true })).toHaveValue(
    "auditadmin",
  );
  await loginPage.getByLabel("Password", { exact: true }).fill(password);
  await loginPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(loginPage).toHaveURL(`${base}/dashboard`);
  check(
    true,
    "Login retains input after error and rejects external return URLs",
  );
  await loginPage.goto(`${base}/login`);
  await loginPage.getByRole("link", { name: "Forgot your password?" }).focus();
  await loginPage.keyboard.press("Enter");
  await expect(loginPage).toHaveURL(`${base}/help#sign-in`);
  check(true, "Password assistance is reachable by keyboard");
  const stateContext = await cookieContext(adminCookie);
  const statePage = await stateContext.newPage();
  let releaseSales;
  const salesGate = new Promise((resolve) => {
    releaseSales = resolve;
  });
  await statePage.route("**/api/sales?**", async (route) => {
    await salesGate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unable to complete the request" }),
    });
  });
  await statePage.goto(`${base}/sales`);
  await expect(
    statePage.getByRole("status", { name: "Loading sales" }),
  ).toBeVisible();
  releaseSales();
  await expect(
    statePage
      .getByRole("alert")
      .filter({ hasText: "Unable to complete the request" }),
  ).toBeVisible();
  await statePage.unroute("**/api/sales?**");
  await statePage
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await expect(
    statePage.getByRole("heading", { name: "No sales found" }),
  ).toBeVisible();
  check(
    true,
    "Sales loading and recoverable error lead to empty state after retry",
  );
  await stateContext.close();
  check(
    errors.length === 0,
    `New page flow has no browser exceptions: ${errors.join("; ")}`,
  );
  await start(3118, uri, { MAINTENANCE_MODE: "true" });
  for (const path of [
    "/",
    "/login",
    "/account",
    "/api/users",
    "/api/uploads/product-image",
  ]) {
    const response = await fetch(`http://localhost:3118${path}`);
    check(
      response.status === 503 && response.headers.get("retry-after") === "300",
      `Maintenance gates ${path}`,
    );
  }
  const blockedWrite = await fetch("http://localhost:3118/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3118",
    },
    body: JSON.stringify({ username: "auditadmin", password }),
  });
  check(blockedWrite.status === 503, "Maintenance blocks mutations");
  await page.goto("http://localhost:3118/");
  await expect(
    page.getByRole("heading", { name: "Temporarily unavailable" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/production-pages/maintenance-mobile.png",
    fullPage: true,
  });
  await start(3119, uri, { JWT_SECRET: "" });
  const failure = await fetch("http://localhost:3119/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3119",
    },
    body: JSON.stringify({ username: "auditadmin", password }),
  });
  const failureBody = await failure.json();
  check(
    failure.status === 503 &&
      failureBody.message === "Unable to complete the request",
    "Server setup failures do not expose environment details",
  );
  await start(3120, "");
  const errorContext = await browser.newContext();
  await errorContext.addCookies([
    {
      name: "karikku_session",
      value: adminCookie.slice(adminCookie.indexOf("=") + 1),
      url: "http://localhost:3120",
      httpOnly: true,
    },
  ]);
  const errorPage = await errorContext.newPage();
  await errorPage.goto("http://localhost:3120/account");
  await expect(
    errorPage.getByRole("heading", { name: "Unable to load this page" }),
  ).toBeVisible();
  check(
    !(await errorPage.locator("body").innerText()).includes("MONGODB_URI"),
    "Server error page hides setup details",
  );
  await errorPage
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await expect(
    errorPage.getByRole("heading", { name: "Unable to load this page" }),
  ).toBeVisible();
  await errorPage.getByRole("link", { name: "Help with Karikku POS" }).click();
  await expect(
    errorPage.getByRole("heading", { name: "Help with your workspace" }),
  ).toBeVisible();
  check(
    true,
    "Server error offers retry and reachable help even without a database",
  );
  console.log(
    `PASS: ${checks} production-page API/database/browser checks; screenshots in test-results/production-pages/.`,
  );
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const server of servers) server.kill();
  await mongoose.disconnect();
  await repl?.stop();
}
