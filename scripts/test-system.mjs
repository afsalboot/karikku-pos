import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import User from "../src/models/User.js";
import { businessDate } from "../src/lib/dates.js";

const base = "http://localhost:3101";
const password = randomBytes(6).toString("hex");
let repl, server, browser;
let output = "";
let assertions = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  assertions++;
};
async function call(path, method = "GET", data, cookie = "") {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const json = await response.json();
  return { response, status: response.status, ...json };
}
try {
  console.log("Starting disposable MongoDB replica set for isolated tests…");
  repl = await MongoMemoryReplSet.create({
    binary: { downloadDir: join(process.cwd(), ".cache", "mongodb") },
    replSet: { count: 1 },
  });
  const uri = repl.getUri("karikku_test");
  await mongoose.connect(uri);
  await User.init();
  await promisify(execFile)(process.execPath, ["scripts/seed-admin.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MONGODB_URI: uri,
      MONGODB_DB_NAME: "karikku_test",
      SEED_ADMIN_USERNAME: "testadmin",
      SEED_ADMIN_PASSWORD: password,
    },
    windowsHide: true,
  });
  check(
    await User.exists({ username: "testadmin", role: "ADMIN", active: true }),
    "Documented bootstrap script creates the administrator",
  );
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", "3101"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MONGODB_URI: uri,
        MONGODB_DB_NAME: "karikku_test",
        JWT_SECRET: randomBytes(48).toString("hex"),
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  server.stdout.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-12000);
  });
  server.stderr.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-12000);
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error("Test server exited");
    try {
      if ((await fetch(`${base}/login`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  check(ready, "Test server starts");
  check(
    (await call("/products")).status === 401,
    "Catalog API rejects anonymous requests",
  );
  check(
    (await fetch(`${base}/products`, { redirect: "manual" })).status === 307,
    "Protected page redirects to login",
  );
  const login = await call("/auth/login", "POST", {
    username: "testadmin",
    password,
  });
  check(login.status === 200, `Login succeeds: ${login.message}`);
  const cookie = login.response.headers.get("set-cookie").split(";")[0];
  check(
    /HttpOnly/i.test(login.response.headers.get("set-cookie")),
    "Session cookie is HTTP-only",
  );
  check(
    /Secure/i.test(login.response.headers.get("set-cookie")),
    "Production cookie is secure",
  );
  const csrf = await fetch(`${base}/api/categories`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: "https://other.invalid",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Blocked" }),
  });
  check(csrf.status === 403, "Cross-origin mutation is blocked");
  const category = await call(
    "/categories",
    "POST",
    { name: "Test Juice", active: true },
    cookie,
  );
  check(category.status === 201, `Category create: ${category.message}`);
  check(
    (
      await call(
        "/categories",
        "POST",
        { name: "test juice", active: true },
        cookie,
      )
    ).status === 409,
    "Case-insensitive category uniqueness",
  );
  const productInput = {
    name: "Test Mango",
    categoryId: category.data._id,
    basePrice: 80,
    active: true,
    variantsEnabled: true,
    addonsEnabled: true,
    variants: [{ name: "Large", price: 100 }],
    addons: [
      { name: "Ice cream", price: 20 },
      { name: "Nuts", price: 30 },
    ],
  };
  const product = await call("/products", "POST", productInput, cookie);
  check(product.status === 201, `Product create: ${product.message}`);
  const p = product.data;
  const payload = () => ({
    requestId: randomUUID(),
    items: [
      {
        productId: p._id,
        variantId: p.variants[0]._id,
        addonIds: p.addons.map((a) => a._id),
        quantity: 2,
        note: "Less sugar",
      },
    ],
    discount: { type: "fixed", value: 20 },
    paymentMethod: "Cash",
  });
  check(
    (await call("/sales", "POST", payload(), cookie)).status === 409,
    "Checkout requires open day",
  );
  const open = await call(
    "/day-sessions",
    "POST",
    { action: "open", openingCash: 1000 },
    cookie,
  );
  check(open.status === 200, `Day open: ${open.message}`);
  check(product.data.available === true, "New products default to available");
  const productSummary = await call(
    "/products?summary=true&limit=1",
    "GET",
    undefined,
    cookie,
  );
  check(
    productSummary.data.summary.total === 1 &&
      productSummary.data.summary.active === 1 &&
      productSummary.data.summary.categories === 1,
    "Product summaries use real catalog counts",
  );
  for (const q of ["Test Juice", "Large"]) {
    const searchResult = await call(
      `/products?q=${encodeURIComponent(q)}`,
      "GET",
      undefined,
      cookie,
    );
    check(searchResult.data.total === 1, `Product search supports ${q}`);
  }
  await call(`/products/${p._id}`, "PATCH", { available: false }, cookie);
  const soldOutSale = await call("/sales", "POST", payload(), cookie);
  check(
    soldOutSale.status === 400,
    "Server rejects sold-out items from an existing cart",
  );
  const soldOutList = await call(
    "/products?available=false&active=true",
    "GET",
    undefined,
    cookie,
  );
  check(
    soldOutList.data.total === 1 && soldOutList.data.items[0].active,
    "Sold-out availability is independent of active status",
  );
  await call(
    `/products/${p._id}`,
    "PATCH",
    { ...productInput, variants: p.variants, addons: p.addons },
    cookie,
  );
  check(
    (await call(`/products/${p._id}`, "GET", undefined, cookie)).data
      .available === false,
    "Legacy product edits preserve availability",
  );
  check(
    (await call(`/products/${p._id}`, "PATCH", { available: "false" }, cookie))
      .status === 400,
    "Availability rejects non-boolean values",
  );
  await mongoose.connection
    .collection("products")
    .updateOne(
      { _id: new mongoose.Types.ObjectId(p._id) },
      { $unset: { available: "" } },
    );
  check(
    (await call("/products?available=true", "GET", undefined, cookie)).data
      .total === 1,
    "Legacy records without availability remain available",
  );
  await call(`/products/${p._id}`, "PATCH", { available: true }, cookie);
  check(
    (
      await call(
        "/day-sessions",
        "POST",
        { action: "open", openingCash: 0 },
        cookie,
      )
    ).status === 409,
    "Only one open session",
  );
  check(
    (await call("/sales", "POST", { ...payload(), total: 1 }, cookie))
      .status === 400,
    "Client-supplied totals are rejected",
  );
  const missingVariant = payload();
  missingVariant.customer = { name: "Failed Customer", phone: "9876543210" };
  missingVariant.items[0].variantId = null;
  check(
    (await call("/sales", "POST", missingVariant, cookie)).status === 400,
    "Required variant validated on server",
  );
  const request = payload();
  check(
    (await call("/customers", "GET", undefined, cookie)).data.total === 0,
    "Rejected checkout does not save a customer",
  );
  request.customer = { name: "Test Customer", phone: "+91 98765 43210" };
  const [sale1, retry] = await Promise.all([
    call("/sales", "POST", request, cookie),
    call("/sales", "POST", request, cookie),
  ]);
  check(
    sale1.status === 201 && retry.status === 201,
    `Concurrent checkout retry succeeds: ${sale1.message} / ${retry.message}`,
  );
  check(sale1.data._id === retry.data._id, "Identical retries return one sale");
  check(
    sale1.data.total === 280 && sale1.data.items[0].lineTotal === 300,
    "Server calculates variants and add-ons, then discounts",
  );
  check(
    sale1.data.invoiceNumber === "JS-000001",
    "Sequential invoice starts at configured number",
  );
  const second = await call(
    "/sales",
    "POST",
    {
      ...payload(),
      customer: { name: "Updated Customer", phone: "9876543210" },
    },
    cookie,
  );
  const customerList = await call("/customers", "GET", undefined, cookie);
  check(
    customerList.data.total === 1 &&
      customerList.data.items[0].name === "Updated Customer",
    "Repeated checkout and retries reuse the normalized phone customer",
  );
  check(
    sale1.data.customer.name === "Test Customer" &&
      sale1.data.customer.customerId === second.data.customer.customerId,
    "Sales retain customer snapshots and reference the same customer",
  );
  const customerHistory = await call(
    `/customers/${customerList.data.items[0]._id}`,
    "GET",
    undefined,
    cookie,
  );
  check(
    customerList.data.items[0].orders === 2 &&
      customerList.data.items[0].averageOrder === 280 &&
      customerList.data.items[0].totalSpent === 560,
    "Directory derives lifetime orders, spend and average from paid sales",
  );
  check(
    customerList.data.summary.totalCustomers === 1 &&
      customerList.data.summary.returningCustomers === 1 &&
      customerList.data.summary.newCustomers === 1 &&
      customerList.data.summary.customerSales === 560,
    "Customer summary uses actual paid activity and current-month creation",
  );
  const returningList = await call(
    "/customers?type=returning&lastPurchase=today",
    "GET",
    undefined,
    cookie,
  );
  check(
    returningList.data.total === 1,
    "Returning and last-purchase filters combine on the server",
  );
  check(
    (await call("/customers?q=%2B91%2098765%2043210", "GET", undefined, cookie))
      .data.total === 1,
    "Customer search normalizes Indian phone formatting",
  );
  check(
    (await call("/customers?q=NoSuchCustomer", "GET", undefined, cookie)).data
      .total === 0,
    "Customer search returns an empty result for unmatched names",
  );
  const historyPage = await call(
    `/customers/${customerList.data.items[0]._id}?limit=1&page=2`,
    "GET",
    undefined,
    cookie,
  );
  check(
    historyPage.data.items.length === 1 &&
      historyPage.data.pages === 2 &&
      historyPage.data.summary.orders === 2,
    "Full history pagination keeps lifetime summary independent of the page",
  );
  check(
    customerHistory.data.total === 2 &&
      customerHistory.data.summary.totalSpent === 560,
    "Customer history includes linked invoices and paid spending",
  );
  check(second.data.invoiceNumber === "JS-000002", "Second invoice increments");
  await call(
    `/products/${p._id}`,
    "PATCH",
    { ...productInput, name: "Renamed Mango", basePrice: 999 },
    cookie,
  );
  const historical = await call(
    `/sales/${sale1.data._id}`,
    "GET",
    undefined,
    cookie,
  );
  check(
    historical.data.items[0].productName === "Test Mango" &&
      historical.data.total === 280,
    "Saved sale retains product snapshots",
  );
  const expenseCategory = await call(
    "/expense-categories",
    "POST",
    { name: "Test Expenses", active: true },
    cookie,
  );
  const expense = await call(
    "/expenses",
    "POST",
    {
      categoryId: expenseCategory.data._id,
      description: "Test cash outgoing",
      amount: 50,
      paymentMethod: "Cash",
      expenseDate: businessDate(),
      note: "",
    },
    cookie,
  );
  check(expense.status === 201, `Expense creation: ${expense.message}`);
  const expenseList = await call(
    `/expenses?q=Test%20Expenses&createdBy=${login.data._id}`,
    "GET",
    undefined,
    cookie,
  );
  check(
    expenseList.data.total === 1 &&
      expenseList.data.summary.amount === 50 &&
      expenseList.data.summary.average === 50 &&
      expenseList.data.categories[0]._id === "Test Expenses" &&
      expenseList.data.creators.some((creator) => creator.name === "Admin"),
    "Expenses expose summary, category breakdown, creator filters and category-name search",
  );
  check(
    (await call("/expenses?payment=Bank%20Transfer", "GET", undefined, cookie))
      .status === 200,
    "Expenses accept Bank Transfer as a filterable payment method",
  );
  check(
    (
      await call(
        "/expenses",
        "POST",
        {
          categoryId: expenseCategory.data._id,
          description: "Invalid outgoing",
          amount: 10,
          paymentMethod: "Other",
          expenseDate: businessDate(),
          note: "",
        },
        cookie,
      )
    ).status === 400,
    "New expenses reject unsupported legacy payment methods",
  );
  const report = await call("/reports", "GET", undefined, cookie);
  check(
    report.data.summary.sales === 560 &&
      report.data.summary.expenses === 50 &&
      report.data.summary.netEarnings === 510,
    "Reports reconcile sales and expenses",
  );
  const dashboard = await call("/dashboard", "GET", undefined, cookie);
  check(
    dashboard.data.summary.sales === report.data.summary.sales &&
      dashboard.data.hourly.reduce((sum, row) => sum + row.sales, 0) === 560 &&
      dashboard.data.hourly.reduce((sum, row) => sum + row.orders, 0) === 2,
    "Dashboard hourly totals reconcile with reports",
  );
  check(
    dashboard.data.recent.length === 2 &&
      dashboard.data.recent[0]._id === second.data._id &&
      dashboard.data.recent[0].items[0].productName === "Test Mango",
    "Dashboard recent sales retain historical product names and newest-first order",
  );
  check(
    dashboard.data.closing.totalSales === 560 &&
      dashboard.data.closing.expenses === 50 &&
      dashboard.data.closing.expectedCash === 1510,
    "Dashboard closing reuses session cash reconciliation",
  );
  const historySummary = await call(
    "/sales?summary=true&limit=1",
    "GET",
    undefined,
    cookie,
  );
  check(
    historySummary.data.items.length === 1 &&
      historySummary.data.total === 2 &&
      historySummary.data.summary.sales === 560,
    "Sales history summary covers all matches beyond the current page",
  );
  const cashierSummary = await call(
    `/sales?summary=true&cashier=${second.data.cashier.userId}`,
    "GET",
    undefined,
    cookie,
  );
  check(
    cashierSummary.data.total === 2 &&
      cashierSummary.data.summary.sales === 560,
    "Cashier-filtered summary matches the sale list",
  );
  const customerSearch = await call(
    "/sales?q=Test%20Customer&summary=true",
    "GET",
    undefined,
    cookie,
  );
  check(
    customerSearch.data.total === 1 &&
      customerSearch.data.summary.sales === 280,
    "Unified sales search matches snapshotted customer names",
  );
  const productSearch = await call(
    "/sales?q=Test%20Mango",
    "GET",
    undefined,
    cookie,
  );
  check(
    productSearch.data.total === 2,
    "Unified sales search matches historical product names",
  );
  const refund = await call(
    `/sales/${second.data._id}`,
    "PATCH",
    { status: "REFUNDED", reason: "Test reversal" },
    cookie,
  );
  check(refund.status === 200, "Admin can refund");
  const refundedCustomer = await call(
    `/customers/${customerList.data.items[0]._id}`,
    "GET",
    undefined,
    cookie,
  );
  check(
    refundedCustomer.data.total === 2 &&
      refundedCustomer.data.summary.totalSpent === 280,
    "Customer history retains refunds but excludes them from spending",
  );
  const dashboardAfterRefund = await call(
    "/dashboard",
    "GET",
    undefined,
    cookie,
  );
  const afterCustomerRefund = (
    await call("/customers?type=new", "GET", undefined, cookie)
  ).data;
  check(
    afterCustomerRefund.total === 1 &&
      afterCustomerRefund.items[0].orders === 1 &&
      afterCustomerRefund.items[0].totalSpent === 280 &&
      afterCustomerRefund.summary.returningCustomers === 0,
    "Refund removes qualifying order and spend from directory activity",
  );
  check(
    dashboardAfterRefund.data.summary.sales === 280 &&
      dashboardAfterRefund.data.recent.length === 1 &&
      dashboardAfterRefund.data.hourly.reduce(
        (sum, row) => sum + row.sales,
        0,
      ) === 280,
    "Dashboard excludes refunded sales from charts and recent completed sales",
  );
  check(
    (
      await call(
        `/sales/${second.data._id}`,
        "PATCH",
        { status: "REFUNDED", reason: "Duplicate" },
        cookie,
      )
    ).status === 409,
    "Duplicate refunds rejected",
  );
  const day = await call("/day-sessions", "GET", undefined, cookie);
  check(
    day.data.current.expectedCash === 1230,
    "Cash reconciliation excludes refunded sale and subtracts cash expense",
  );
  const cashier = await call(
    "/users",
    "POST",
    {
      name: "Test Cashier",
      username: "testcashier",
      password,
      role: "CASHIER",
      active: true,
    },
    cookie,
  );
  check(
    cashier.status === 201 &&
      !JSON.stringify(cashier.data).includes("password"),
    "User API never returns password fields",
  );
  const cashierLogin = await call("/auth/login", "POST", {
    username: "testcashier",
    password,
  });
  const cashierCookie = cashierLogin.response.headers
    .get("set-cookie")
    .split(";")[0];
  const cashierLookup = await call(
    "/customers?lookup=true&q=Updated",
    "GET",
    undefined,
    cashierCookie,
  );
  check(
    cashierLookup.status === 200 &&
      cashierLookup.data.items.length === 1 &&
      Object.keys(cashierLookup.data.items[0]).every((k) =>
        ["_id", "name", "phone"].includes(k),
      ),
    "Cashier lookup returns matching contact fields without customer history or metrics",
  );
  check(
    (
      await call(
        "/customers?lookup=true&q=%2B91%2098765%2043210",
        "GET",
        undefined,
        cashierCookie,
      )
    ).data.items.length === 1,
    "Checkout lookup supports normalized Indian phone numbers",
  );
  check(
    (await call("/customers?lookup=true&q=U", "GET", undefined, cashierCookie))
      .data.items.length === 0,
    "Customer lookup waits for at least two characters",
  );
  check(
    (await call("/customers?lookup=true&q=Updated")).status === 401,
    "Customer lookup requires authentication",
  );
  check(
    (
      await call(
        `/products/${p._id}`,
        "PATCH",
        { available: false },
        cashierCookie,
      )
    ).status === 403,
    "Cashiers cannot change product availability",
  );
  async function invalidImageUpload(sessionCookie = "") {
    const form = new FormData();
    form.set(
      "file",
      new Blob(["not an image"], { type: "image/png" }),
      "invalid.png",
    );
    return fetch(`${base}/api/uploads/product-image`, {
      method: "POST",
      headers: {
        Origin: base,
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      body: form,
    });
  }
  check(
    (await invalidImageUpload()).status === 401,
    "Anonymous uploads are rejected",
  );
  check(
    (await invalidImageUpload(cashierCookie)).status === 403,
    "Cashier uploads are rejected",
  );
  check(
    (await invalidImageUpload(cookie)).status === 400,
    "Fake image content is rejected before Cloudinary upload",
  );
  for (const path of [
    "/users",
    "/customers",
    "/reports",
    "/dashboard",
    "/expenses",
    "/day-sessions",
  ])
    check(
      (await call(path, "GET", undefined, cashierCookie)).status === 403,
      `Cashier is denied ${path}`,
    );
  check(
    (await call("/products", "POST", productInput, cashierCookie)).status ===
      403,
    "Cashier cannot modify products",
  );
  const freshProduct = await call(
    `/products/${p._id}`,
    "GET",
    undefined,
    cookie,
  );
  const staffPayload = payload();
  staffPayload.items[0].variantId = freshProduct.data.variants[0]._id;
  staffPayload.items[0].addonIds = freshProduct.data.addons.map((a) => a._id);
  check(
    (await call("/sales", "POST", staffPayload, cashierCookie)).status === 400,
    "Cashier discounts disabled on backend",
  );
  const settingsResponse = await call("/settings", "GET", undefined, cookie);
  const { _id, createdAt, updatedAt, __v, ...settings } = settingsResponse.data;
  const changedSettings = {
    ...settings,
    paymentMethods: ["Cash"],
    allowCashierDiscount: true,
    maxCashierDiscount: 10,
    gstEnabled: true,
    taxRate: 5,
  };
  check(
    (await call("/settings", "PATCH", changedSettings, cookie)).status === 200,
    "Admin updates settings",
  );
  staffPayload.paymentMethod = "UPI";
  check(
    (await call("/sales", "POST", staffPayload, cashierCookie)).status === 400,
    "Disabled payment is rejected",
  );
  await call("/settings", "PATCH", settings, cookie);
  const closed = await call(
    "/day-sessions",
    "POST",
    { action: "close", sessionId: open.data._id, actualCash: 1225 },
    cookie,
  );
  check(closed.data.difference === -5, "Closing difference is correct");
  const closedDashboard = await call("/dashboard", "GET", undefined, cookie);
  check(
    closedDashboard.data.closing.status === "CLOSED" &&
      closedDashboard.data.closing.actualCash === 1225 &&
      closedDashboard.data.closing.difference === -5,
    "Dashboard uses the saved closing snapshot",
  );
  check(
    (await call(`/expenses/${expense.data._id}`, "DELETE", {}, cookie))
      .status === 409,
    "Closed-session expenses cannot alter reconciliation",
  );
  const newDay = await call(
    "/day-sessions",
    "POST",
    { action: "open", openingCash: 1000 },
    cookie,
  );
  check(newDay.status === 200, "Next session opens");
  check(
    (
      await call(
        `/sales/${sale1.data._id}`,
        "PATCH",
        { status: "REFUNDED", reason: "Later-session test" },
        cookie,
      )
    ).status === 200,
    "Refund of earlier-session sale is supported",
  );
  const afterRefund = await call("/day-sessions", "GET", undefined, cookie);
  check(
    afterRefund.data.current.expectedCash === 720 &&
      afterRefund.data.current.cashRefunds === 280,
    "Earlier-session refund reduces current drawer only",
  );
  check(
    afterRefund.data.items[0].expectedCash === 1230,
    "Closed session snapshot is preserved",
  );
  console.log(
    `API and database checks passed (${assertions} assertions). Starting browser checks…`,
  );
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.getByLabel("Username", { exact: true }).fill("testadmin");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page
    .getByRole("heading", { name: "Recent Sales", exact: true })
    .waitFor();
  check(
    (await page.locator(".dash-primary-grid .dash-stat").count()) === 4,
    "Dashboard has four primary KPI cards",
  );
  await page.getByRole("button", { name: "7 Days", exact: true }).click();
  await page
    .getByRole("heading", { name: "Recent Sales", exact: true })
    .waitFor();
  check(
    (await page
      .locator(".dash-stat")
      .filter({ hasText: "Total Sales" })
      .count()) === 1,
    "Dashboard period changes primary KPI labels",
  );
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  check(
    await page.getByLabel("From Date", { exact: true }).isVisible(),
    "Custom dates appear only on demand",
  );
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page
    .getByRole("heading", { name: "Recent Sales", exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("#shop-navigation"))
        .visibility === "hidden",
  );
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Dashboard has no mobile horizontal overflow",
  );
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "Add Expense", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  check(
    await page.getByRole("dialog").isVisible(),
    "Dashboard Add Expense opens existing editor",
  );
  await page.goto(`${base}/dashboard`);
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await page.getByRole("button", { name: "Add Product", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Add Product", exact: true });
  const imageBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG2kAAAAASUVORK5CYII=",
    "base64",
  );
  const imageUrl =
    "https://res.cloudinary.com/karikku-test/image/upload/v1/karikku/products/browser-image.png";
  await page.route(imageUrl, (route) =>
    route.fulfill({ contentType: "image/png", body: imageBytes }),
  );
  let uploaded = false;
  await page.route("**/api/uploads/product-image", (route) => {
    uploaded = true;
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { url: imageUrl } }),
    });
  });
  check(
    await modal
      .getByRole("button", { name: "Add product image", exact: true })
      .isVisible(),
    "Empty image square is available",
  );
  await modal
    .getByLabel("Choose product image", { exact: true })
    .setInputFiles({
      name: "test-image.png",
      mimeType: "image/png",
      buffer: imageBytes,
    });
  check(
    await modal.getByAltText("Product image preview").isVisible(),
    "Selected image previews inside the square",
  );
  const square = await modal.locator(".product-image-square").boundingBox();
  check(
    Math.abs(square.width - square.height) < 1,
    "Image preview remains square",
  );
  await modal.getByLabel("Product name", { exact: true }).fill("Browser Juice");
  await modal.getByRole("button", { name: "Add New Category" }).click();
  const categoryModal = page.getByRole("dialog", {
    name: "Create Category",
    exact: true,
  });
  await categoryModal
    .getByLabel("Category name", { exact: true })
    .fill("Browser Category");
  await categoryModal
    .getByRole("button", { name: "Create Category", exact: true })
    .click();
  await categoryModal.waitFor({ state: "hidden" });
  check(
    (await modal.getByLabel("Category", { exact: true }).inputValue()) !== "",
    "Inline category is auto-selected",
  );
  await modal.getByLabel(/Base price/).fill("80");
  await modal.getByRole("switch", { name: "Enable variants" }).check();
  await modal.getByRole("button", { name: "Add variant", exact: true }).click();
  await modal.getByLabel("variant 1 name", { exact: true }).fill("Large");
  await modal
    .getByLabel("variant 1 price in rupees", { exact: true })
    .fill("100");
  await modal.getByRole("switch", { name: "Enable add-ons" }).check();
  await modal.getByRole("button", { name: "Add add-on", exact: true }).click();
  await modal.getByLabel("add-on 1 name", { exact: true }).fill("Nuts");
  await modal
    .getByLabel("add-on 1 price in rupees", { exact: true })
    .fill("20");
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/add-product-desktop.png",
    fullPage: true,
  });
  await modal.getByRole("button", { name: "Add Product", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  check(uploaded, "Saving uploads the selected image");
  const savedImage = await call(
    "/products?q=Browser%20Juice",
    "GET",
    undefined,
    cookie,
  );
  check(
    savedImage.data.items[0].imageUrl === imageUrl,
    "Product image URL persists in MongoDB",
  );
  await page
    .getByRole("button", { name: "Actions for Browser Juice", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Edit Product", exact: true })
    .click();
  const editModal = page.getByRole("dialog", {
    name: "Edit Product",
    exact: true,
  });
  check(
    (await editModal
      .getByAltText("Product image preview")
      .getAttribute("src")) === imageUrl,
    "Edit form restores the saved image",
  );
  await editModal.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.screenshot({
    path: "test-results/products-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Browser Juice", exact: true })
    .click();
  const productDrawer = page.getByRole("dialog", {
    name: "Product Details",
    exact: true,
  });
  await productDrawer
    .getByRole("heading", { name: "Browser Juice", exact: true })
    .waitFor();
  check(
    (await productDrawer.textContent()).includes("Large"),
    "Product drawer shows saved variants",
  );
  await page.screenshot({
    path: "test-results/product-drawer-desktop.png",
    fullPage: true,
  });
  await productDrawer
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Actions for Browser Juice", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Duplicate Product", exact: true })
    .click();
  const productCopy = page.getByRole("dialog", {
    name: "Add Product",
    exact: true,
  });
  check(
    (await productCopy
      .getByLabel("Product name", { exact: true })
      .inputValue()) === "Browser Juice Copy",
    "Duplicate product opens a prefilled Add Product form",
  );
  check(
    (await productCopy
      .getByLabel("variant 1 name", { exact: true })
      .inputValue()) === "Large",
    "Duplicate product preserves configured options",
  );
  await productCopy
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  check(
    (await call("/products?q=Browser%20Juice%20Copy", "GET", undefined, cookie))
      .data.total === 0,
    "Duplicate product requires confirmation before creating a record",
  );
  const availabilitySwitch = page.getByRole("switch", {
    name: "Availability for Browser Juice",
    exact: true,
  });
  const soldOutSaved = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" && r.url().includes("/api/products/"),
  );
  await availabilitySwitch.click();
  await soldOutSaved;
  await page.locator(".product-availability.sold-out").waitFor();
  check(
    (await availabilitySwitch.getAttribute("aria-checked")) === "false",
    "Quick availability switch persists sold-out state",
  );
  await page.getByRole("link", { name: "New Sale", exact: true }).click();
  const soldOutCard = page
    .locator(".pos-product-card")
    .filter({ hasText: "Browser Juice" });
  await soldOutCard.waitFor();
  check(
    await soldOutCard.isDisabled(),
    "Sold-out products cannot be selected in New Sale",
  );
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await page
    .getByLabel("Product availability filter", { exact: true })
    .selectOption("false");
  await page
    .getByRole("button", { name: "Browser Juice", exact: true })
    .waitFor();
  check(
    (await page.locator(".product-name-button").count()) === 1,
    "Availability filter returns only sold-out products",
  );
  const availableSaved = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" && r.url().includes("/api/products/"),
  );
  await availabilitySwitch.click();
  await availableSaved;
  await page
    .getByRole("heading", { name: "No products found", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Clear Filters", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Browser Juice", exact: true })
    .waitFor();
  const rejectAvailability = (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "Test save failure" }),
    });
  await page.route(
    `**/api/products/${savedImage.data.items[0]._id}`,
    rejectAvailability,
  );
  await availabilitySwitch.click();
  await page.getByText("Test save failure", { exact: true }).waitFor();
  check(
    (await availabilitySwitch.getAttribute("aria-checked")) === "true",
    "Failed availability save retains the original state",
  );
  await page.unroute(
    `**/api/products/${savedImage.data.items[0]._id}`,
    rejectAvailability,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "test-results/products-mobile.png",
    fullPage: true,
  });
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Products table scroll stays inside the mobile page",
  );
  await page
    .getByRole("button", { name: "Browser Juice", exact: true })
    .click();
  await productDrawer
    .getByRole("heading", { name: "Browser Juice", exact: true })
    .waitFor();
  check(
    Math.round((await productDrawer.boundingBox()).width) === 390,
    "Product drawer fills the mobile viewport",
  );
  await page.screenshot({
    path: "test-results/product-drawer-mobile.png",
    fullPage: true,
  });
  await productDrawer
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "New Sale", exact: true }).click();
  await page.waitForURL("**/pos");
  await page.locator(".pos-layout").waitFor();
  check(
    await page.locator(".pos-cart").isVisible(),
    "Empty cart remains visible",
  );
  await page.screenshot({ path: "test-results/pos-empty.png", fullPage: true });
  await page
    .locator(".pos-product-card")
    .filter({ hasText: "Browser Juice" })
    .click();
  const configure = page.getByRole("dialog", { name: "Browser Juice" });
  await configure
    .getByLabel("Choose a variant")
    .selectOption({ label: "Large — ₹100.00" });
  await configure.getByRole("checkbox", { name: /Nuts/ }).check();
  await configure
    .getByRole("button", { name: "Add to cart", exact: true })
    .click();
  check(
    await page.locator(".pos-cart").isVisible(),
    "Adding an item keeps the cart visible",
  );
  for (let i = 0; i < 2; i++) {
    await page
      .locator(".pos-product-card")
      .filter({ hasText: "Browser Juice" })
      .click();
    await configure.getByRole("checkbox", { name: /Nuts/ }).check();
    await configure
      .getByRole("button", { name: "Add to cart", exact: true })
      .click();
  }
  check(
    (await page.locator(".pos-cart-item").count()) === 1 &&
      (await page.locator(".pos-quantity span").textContent()) === "3",
    "Three identical selections make one row with quantity three",
  );
  await page
    .locator(".pos-product-card")
    .filter({ hasText: "Browser Juice" })
    .click();
  await configure
    .getByRole("button", { name: "Add to cart", exact: true })
    .click();
  check(
    (await page.locator(".pos-cart-item").count()) === 2,
    "The same product without add-ons stays separate",
  );
  await page.screenshot({
    path: "test-results/cart-merged.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Remove Browser Juice", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Decrease Browser Juice", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add note for Browser Juice", exact: true })
    .click();
  await page.getByLabel("Note for Browser Juice").fill("Less sugar");
  await page.getByLabel("Discount value").fill("20");
  await page
    .getByRole("button", { name: "Proceed Payment", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Checkout", exact: true }).waitFor();
  check(
    await page
      .getByRole("button", { name: "Complete Sale · ₹220.00", exact: true })
      .isDisabled(),
    "Checkout requires selecting a payment method",
  );
  await page.getByLabel("Customer name", { exact: true }).fill("Up");
  const existingOption = page.getByRole("option", {
    name: /Updated Customer.*9876543210/,
  });
  await existingOption.waitFor();
  await page.screenshot({
    path: "test-results/checkout-customer-suggestions.png",
    fullPage: true,
  });
  await existingOption.click();
  check(
    (await page.getByLabel("Phone number", { exact: true }).inputValue()) ===
      "9876543210" &&
      (await page.getByLabel("Customer name", { exact: true }).inputValue()) ===
        "Updated Customer",
    "Choosing a name suggestion fills both checkout customer fields",
  );
  await page.getByLabel("Customer name", { exact: true }).fill("");
  await page.getByLabel("Phone number", { exact: true }).fill("9876");
  await existingOption.waitFor();
  await page.getByLabel("Phone number", { exact: true }).press("Enter");
  check(
    (await page.getByLabel("Customer name", { exact: true }).inputValue()) ===
      "Updated Customer",
    "Phone suggestions support keyboard selection without submitting checkout",
  );
  await page.getByLabel("Customer name", { exact: true }).fill("");
  await page.getByLabel("Phone number", { exact: true }).fill("");
  await page.getByRole("button", { name: "Back to cart", exact: true }).click();
  check(
    (await page.locator(".pos-cart-item").count()) === 1,
    "Closing checkout retains the cart",
  );
  await page
    .getByRole("button", { name: "Proceed Payment", exact: true })
    .click();
  await page.getByRole("button", { name: "Cash", exact: true }).click();
  const checkoutDialog = page.getByRole("dialog", {
    name: "Checkout",
    exact: true,
  });
  const completeSale = checkoutDialog.getByRole("button", {
    name: /Complete Sale/,
  });
  check(
    (await checkoutDialog
      .getByLabel("Amount Received", { exact: true })
      .inputValue()) === "220",
    "Cash received defaults to exact bill total",
  );
  check(
    (await checkoutDialog
      .getByRole("button", { name: "Other", exact: true })
      .count()) === 0,
    "Checkout removes Other payment",
  );
  await checkoutDialog
    .getByLabel("Amount Received", { exact: true })
    .fill("100");
  check(
    (await completeSale.isDisabled()) &&
      (await checkoutDialog.locator(".checkout-change").textContent()).includes(
        "120.00",
      ),
    "Insufficient cash shows remaining and blocks checkout",
  );
  await checkoutDialog
    .getByLabel("Amount Received", { exact: true })
    .fill("500");
  check(
    (await checkoutDialog.locator(".checkout-change").textContent()).includes(
      "280.00",
    ),
    "Cash change updates while typing",
  );
  await page.screenshot({
    path: "test-results/checkout-cash.png",
    fullPage: true,
  });
  await checkoutDialog.getByLabel("Amount Received", { exact: true }).fill("");
  check(await completeSale.isDisabled(), "Empty cash tender blocks checkout");
  await checkoutDialog
    .getByLabel("Amount Received", { exact: true })
    .fill("100000001");
  check(
    await completeSale.isDisabled(),
    "Cash tender above the supported limit blocks checkout",
  );
  await checkoutDialog
    .getByRole("button", { name: "Exact", exact: true })
    .click();
  check(
    (await checkoutDialog
      .getByLabel("Amount Received", { exact: true })
      .inputValue()) === "220.00",
    "Exact cash helper restores the bill amount",
  );
  await checkoutDialog
    .getByRole("button", { name: "Back to cart", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Proceed Payment", exact: true })
    .click();
  check(
    (await completeSale.isDisabled()) &&
      (await checkoutDialog
        .getByLabel("Amount Received", { exact: true })
        .count()) === 0,
    "Closing and reopening resets temporary payment state",
  );
  await checkoutDialog
    .getByRole("button", { name: "GPay / UPI", exact: true })
    .click();
  check(
    (await checkoutDialog
      .getByLabel("Amount Received", { exact: true })
      .count()) === 0,
    "Digital payment removes cash tender fields",
  );
  await checkoutDialog
    .getByRole("button", { name: "Card", exact: true })
    .click();
  check(
    await checkoutDialog.locator(".checkout-digital").isVisible(),
    "Card shows amount to collect without card-data fields",
  );
  await checkoutDialog
    .getByRole("switch", { name: "Split payment", exact: true })
    .check();
  check(await completeSale.isDisabled(), "Empty split payment cannot complete");
  await checkoutDialog
    .getByRole("button", { name: "+ Add Card", exact: true })
    .click();
  await checkoutDialog
    .getByRole("button", { name: "Remove Card payment", exact: true })
    .click();
  check(
    await checkoutDialog
      .getByRole("button", { name: "+ Add Card", exact: true })
      .isVisible(),
    "Removing a split method releases its allocation",
  );
  await checkoutDialog
    .getByRole("switch", { name: "Split payment", exact: true })
    .uncheck();
  check(
    (await completeSale.isDisabled()) &&
      (await checkoutDialog
        .getByRole("button", { name: "Cash", exact: true })
        .isVisible()),
    "Switching back to single payment clears split state",
  );
  await checkoutDialog
    .getByRole("switch", { name: "Split payment", exact: true })
    .check();
  await checkoutDialog
    .getByRole("button", { name: "+ Add Cash", exact: true })
    .click();
  await checkoutDialog
    .getByLabel("Cash amount applied", { exact: true })
    .fill("100");
  await checkoutDialog
    .getByRole("button", { name: "+ Add GPay / UPI", exact: true })
    .click();
  await checkoutDialog
    .getByLabel("GPay / UPI amount applied", { exact: true })
    .fill("100");
  check(
    await completeSale.isDisabled(),
    "Incomplete split allocation cannot complete",
  );
  await checkoutDialog
    .locator(".checkout-split-row")
    .filter({ hasText: "GPay / UPI" })
    .getByRole("button", { name: /Pay remaining/ })
    .click();
  check(
    (await checkoutDialog
      .getByLabel("GPay / UPI amount applied", { exact: true })
      .inputValue()) === "120.00",
    "Pay remaining completes the selected allocation",
  );
  await checkoutDialog
    .getByLabel("GPay / UPI amount applied", { exact: true })
    .fill("121");
  check(
    (await completeSale.isDisabled()) &&
      (await checkoutDialog
        .getByText("Split payment exceeds the amount due.", { exact: true })
        .isVisible()),
    "Overallocated split shows validation and blocks checkout",
  );
  await checkoutDialog
    .getByLabel("GPay / UPI amount applied", { exact: true })
    .fill("120");
  await checkoutDialog.getByLabel("Cash received", { exact: true }).fill("500");
  check(
    (await checkoutDialog.locator(".checkout-change").textContent()).includes(
      "400.00",
    ),
    "Split cash change uses only the cash allocation",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  await checkoutDialog.locator(".checkout-payment").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/checkout-split-mobile.png",
    fullPage: true,
  });
  check(
    (await checkoutDialog.boundingBox()).width <= 390,
    "Split checkout fits the mobile viewport",
  );
  const footerBounds = await checkoutDialog
    .locator(".modal-footer")
    .boundingBox();
  check(
    footerBounds.y + footerBounds.height <= 844 && footerBounds.y > 600,
    "Mobile checkout footer remains pinned below the scrolling form",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByLabel("Customer name", { exact: true })
    .fill("Browser Customer");
  await page.getByLabel("Phone number", { exact: true }).fill("9123456780");
  await page.screenshot({
    path: "test-results/pos-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Complete Sale · ₹220.00", exact: true })
    .click();
  const success = page.getByRole("dialog", {
    name: "Payment Successful",
    exact: true,
  });
  await success.waitFor();
  check(
    (await success.locator(".sale-payment-breakdown").textContent()).includes(
      "Split",
    ) &&
      (await success.locator(".sale-payment-breakdown").textContent()).includes(
        "400.00",
      ),
    "Receipt shows split allocations and cash change",
  );
  check(
    (await success.textContent()).includes("Browser Customer") &&
      (await success.textContent()).includes("9123456780"),
    "Receipt displays saved checkout customer details",
  );
  check(
    (await success.textContent()).includes("Less sugar"),
    "Receipt includes item note",
  );
  check(
    (await success.textContent()).includes("₹220.00"),
    "Receipt displays persisted total",
  );
  await page.screenshot({
    path: "test-results/receipt-desktop.png",
    fullPage: true,
  });
  let printFrameCreated = false;
  page.on("frameattached", () => {
    printFrameCreated = true;
  });
  await success
    .getByRole("button", { name: "Print Bill", exact: true })
    .click();
  await page.waitForTimeout(700);
  check(printFrameCreated, "Print action creates a receipt print document");
  await success.getByRole("button", { name: "New Sale", exact: true }).click();
  await page.goto(`${base}/customers`);
  const noPurchaseCustomers = (
    await call("/customers?lastPurchase=none", "GET", undefined, cookie)
  ).data;
  check(
    noPurchaseCustomers.total === 1 &&
      noPurchaseCustomers.items[0].averageOrder === 0 &&
      noPurchaseCustomers.items[0].lastPurchase === null,
    "No-purchase filter handles fully reversed customers without division by zero",
  );
  const highestCustomer = (
    await call("/customers?sort=spend&limit=1", "GET", undefined, cookie)
  ).data;
  check(
    highestCustomer.items[0].name === "Browser Customer" &&
      highestCustomer.total === 2 &&
      highestCustomer.summary.totalCustomers === 2,
    "Customer sorting and pagination retain global summary counts",
  );
  check(
    (await call("/customers?sort=toString", "GET", undefined, cookie))
      .status === 200,
    "Unknown sort values safely use the default customer ordering",
  );
  await page
    .locator(".customer-name")
    .filter({ hasText: "Browser Customer" })
    .waitFor();
  await page.screenshot({
    path: "test-results/customers-desktop.png",
    fullPage: true,
  });
  await page
    .locator(".customer-name")
    .filter({ hasText: "Browser Customer" })
    .click();
  await page
    .getByRole("dialog", { name: "Customer Details", exact: true })
    .waitFor();
  await page.getByRole("dialog").getByRole("button", { name: /JS-/ }).waitFor();
  check(
    (await page.getByRole("dialog").textContent()).includes("9123456780"),
    "Customer module shows saved details and linked purchase history",
  );
  await page.screenshot({
    path: "test-results/customer-history.png",
    fullPage: true,
  });
  const customerDrawer = page.getByRole("dialog", {
    name: "Customer Details",
    exact: true,
  });
  await customerDrawer
    .getByRole("button", { name: "View Full Purchase History", exact: true })
    .click();
  const fullCustomerHistory = page.getByRole("dialog", {
    name: "Customer Purchase History",
    exact: true,
  });
  await fullCustomerHistory.getByRole("button", { name: /JS-/ }).click();
  const customerSale = page.getByRole("dialog", {
    name: "Sale Details",
    exact: true,
  });
  await customerSale.locator(".sale-drawer-content").waitFor();
  check(
    (await customerSale.isVisible()) && page.url().endsWith("/customers"),
    "Customer invoice opens shared Sale Details without leaving the directory",
  );
  await customerSale
    .getByRole("button", { name: "Close", exact: true })
    .click();
  check(
    await fullCustomerHistory.isVisible(),
    "Closing sale details restores customer purchase history",
  );
  await fullCustomerHistory
    .getByRole("button", {
      name: "Close Customer Purchase History",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Search customers", { exact: true })
    .fill("NobodyMatchesThis");
  await page
    .getByRole("heading", { name: "No customers found", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Clear Filters", exact: true })
    .click();
  await page
    .locator(".customer-name")
    .filter({ hasText: "Browser Customer" })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "test-results/customers-mobile.png",
    fullPage: true,
  });
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Customers use compact mobile cards without horizontal overflow",
  );
  await page
    .getByRole("button", { name: "Actions for Browser Customer", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Purchase History", exact: true })
    .click();
  await fullCustomerHistory.getByRole("button", { name: /JS-/ }).waitFor();
  check(
    Math.round((await fullCustomerHistory.boundingBox()).width) === 390,
    "Customer history drawer fills the mobile viewport",
  );
  await page.screenshot({
    path: "test-results/customer-history-mobile.png",
    fullPage: true,
  });
  await fullCustomerHistory
    .getByRole("button", {
      name: "Close Customer Purchase History",
      exact: true,
    })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/pos`);
  await page.locator(".pos-cart").waitFor();
  check(
    await page.locator(".pos-cart").isVisible(),
    "New Sale clears and retains the cart panel",
  );
  await page
    .locator(".pos-product-card")
    .filter({ hasText: "Browser Juice" })
    .click();
  await configure
    .getByRole("button", { name: "Add to cart", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove Browser Juice", exact: true })
    .click();
  check(
    await page.locator(".pos-cart").isVisible(),
    "Removing the last item retains the cart panel",
  );
  await page
    .locator(".pos-product-card")
    .filter({ hasText: "Browser Juice" })
    .click();
  await configure
    .getByRole("button", { name: "Add to cart", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear cart", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Clear cart", exact: true })
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  check(
    await page.locator(".pos-cart").isVisible(),
    "Clearing the cart retains the cart panel",
  );
  await page.goto(`${base}/sales`);
  await page.getByLabel("Search sales").fill("Browser Customer");
  await page.waitForTimeout(450);
  await page.locator(".sales-invoice").first().waitFor();
  await page.screenshot({
    path: "test-results/sales-history-desktop.png",
    fullPage: true,
  });
  const historyUrl = page.url();
  await page.locator(".sales-invoice").first().click();
  const drawer = page.getByRole("dialog", {
    name: "Sale Details",
    exact: true,
  });
  await drawer.getByText("Browser Customer", { exact: false }).waitFor();
  check(
    page.url() === historyUrl,
    "Sale details opens in a drawer without leaving history",
  );
  await page.screenshot({
    path: "test-results/sale-details-drawer.png",
    fullPage: true,
  });
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".sales-more").first().click();
  await page.getByRole("menuitem", { name: "Refund", exact: true }).click();
  const refundDialog = page.getByRole("dialog", {
    name: "Refund sale",
    exact: true,
  });
  await refundDialog
    .getByLabel("Reason")
    .fill("Confirmation interaction check");
  check(
    await refundDialog.isVisible(),
    "History refund confirmation opens above the details drawer",
  );
  await refundDialog
    .getByRole("button", { name: "Keep sale", exact: true })
    .click();
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".sales-more").first().click();
  await page
    .getByRole("menuitem", { name: "Reprint Receipt", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Print Bill", exact: true })
    .waitFor();
  check(
    (await page.getByRole("dialog").locator(".receipt").count()) === 1,
    "Sales action menu preserves reprint receipt",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.locator(".sales-more").first().click();
  await page
    .getByRole("menuitem", { name: "Duplicate Sale", exact: true })
    .click();
  const duplicate = page.getByRole("dialog", {
    name: "Duplicate Sale",
    exact: true,
  });
  await duplicate
    .getByRole("button", { name: "Use items", exact: true })
    .click();
  check(
    (await page.locator(".pos-quantity span").textContent()) === "2",
    "Duplicate sale restores quantities to an unpaid new cart",
  );
  await page.goto(`${base}/sales`);
  await page.locator(".sales-invoice").first().waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Sales history confines table scrolling on mobile",
  );
  await page.screenshot({
    path: "test-results/sales-history-mobile.png",
    fullPage: true,
  });
  await page.locator(".sales-invoice").first().click();
  await page
    .getByRole("dialog", { name: "Sale Details", exact: true })
    .waitFor();
  check(
    Math.round((await page.getByRole("dialog").boundingBox()).width) === 390,
    "Sales drawer fills the mobile viewport",
  );
  await page
    .getByRole("button", { name: "Close Sale Details", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [label, heading] of [
    ["Sales", "Sales History"],
    ["Expenses", "Expenses"],
    ["Reports", "Reports"],
    ["Day Closing", "Day Opening & Closing"],
    ["Users", "Users"],
    ["Settings", "Settings"],
  ]) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await page
      .getByRole("heading", { name: heading, exact: true, level: 1 })
      .waitFor();
    check(true, `${label} page loads`);
  }
  await page.getByRole("link", { name: "Expenses", exact: true }).click();
  await page.getByRole("heading", { name: "Expense Breakdown" }).waitFor();
  check(
    await page.getByText("Test cash outgoing", { exact: true }).isVisible(),
    "Expenses page renders the upgraded table with existing records",
  );
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  check(
    await page.getByLabel("From Date", { exact: true }).isVisible(),
    "Expense custom dates appear only on demand",
  );
  await page
    .getByRole("button", { name: /Open actions for Test cash outgoing/ })
    .click();
  check(
    await page
      .getByRole("menuitem", { name: "Edit Expense", exact: true })
      .isVisible(),
    "Expense actions use a three-dot menu",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Add Product", exact: true }).click();
  await page.getByRole("dialog", { name: "Add Product" }).waitFor();
  await page.screenshot({
    path: "test-results/add-product-mobile.png",
    fullPage: true,
  });
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile product screen has no horizontal overflow",
  );
  await page.keyboard.press("Escape");
  check((await page.getByRole("dialog").count()) === 0, "Escape closes modal");
  check(errors.length === 0, `No browser runtime errors: ${errors.join("; ")}`);
  check(
    (
      await call(
        `/users/${login.data._id}`,
        "PATCH",
        { name: "Admin", username: "testadmin", role: "CASHIER", active: true },
        cookie,
      )
    ).status === 409,
    "Last active administrator cannot be demoted",
  );
  await call(
    `/users/${cashier.data._id}`,
    "PATCH",
    {
      name: "Test Cashier",
      username: "testcashier",
      role: "CASHIER",
      active: false,
    },
    cookie,
  );
  check(
    (await call("/auth/me", "GET", undefined, cashierCookie)).status === 401,
    "Deactivating a user immediately revokes their session",
  );
  check(
    (await call("/customers", "GET", undefined, cookie)).data.total === 2,
    "Walk-in checkouts do not create customer records",
  );
  const beforeRace = (await call("/day-sessions", "GET", undefined, cookie))
    .data.current;
  const racePayload = payload();
  racePayload.items[0].variantId = freshProduct.data.variants[0]._id;
  racePayload.items[0].addonIds = freshProduct.data.addons.map((a) => a._id);
  racePayload.discount.value = 0;
  const [raceSale, raceClose] = await Promise.all([
    call("/sales", "POST", racePayload, cookie),
    call(
      "/day-sessions",
      "POST",
      { action: "close", sessionId: beforeRace._id, actualCash: 0 },
      cookie,
    ),
  ]);
  check(
    raceClose.status === 200 && [201, 409].includes(raceSale.status),
    "Concurrent checkout and close have a valid serial outcome",
  );
  check(
    raceClose.data.expectedCash ===
      beforeRace.expectedCash +
        (raceSale.status === 201 ? raceSale.data.total : 0),
    "Closing captures all committed cash sales during concurrency",
  );
  const splitDay = await call(
    "/day-sessions",
    "POST",
    { action: "open", openingCash: 1000 },
    cookie,
  );
  const beforeSplitReport = (await call("/reports", "GET", undefined, cookie))
    .data;
  const splitPayload = {
    ...racePayload,
    requestId: randomUUID(),
    paymentMethod: "Split",
    payments: [
      { method: "Cash", amount: 100 },
      { method: "UPI", amount: 150 },
      { method: "Card", amount: 50 },
    ],
    cashReceived: 500,
  };
  for (const override of [
    {
      payments: [
        { method: "Cash", amount: 100 },
        { method: "UPI", amount: 199 },
      ],
    },
    {
      payments: [
        { method: "Cash", amount: 100 },
        { method: "UPI", amount: 201 },
      ],
    },
    {
      payments: [
        { method: "Cash", amount: 100 },
        { method: "Cash", amount: 200 },
      ],
    },
    { cashReceived: 99 },
    {
      payments: [
        { method: "Cash", amount: 0.001 },
        { method: "UPI", amount: 299.999 },
      ],
    },
    { paymentMethod: "Other", payments: undefined, cashReceived: undefined },
  ]) {
    check(
      (
        await call(
          "/sales",
          "POST",
          { ...splitPayload, ...override, requestId: randomUUID() },
          cookie,
        )
      ).status === 400,
      "Server rejects invalid split/tender data before creating a sale",
    );
  }
  const [splitSale, splitRetry] = await Promise.all([
    call("/sales", "POST", splitPayload, cookie),
    call("/sales", "POST", splitPayload, cookie),
  ]);
  check(
    splitSale.status === 201 && splitSale.data._id === splitRetry.data._id,
    "Split checkout retries produce one invoice",
  );
  check(
    splitSale.data.total === 300 &&
      splitSale.data.payments[0].amount === 100 &&
      splitSale.data.cashReceived === 500 &&
      splitSale.data.changeGiven === 400,
    "Split sale stores applied payments separately from tender and change",
  );
  const afterSplitReport = (await call("/reports", "GET", undefined, cookie))
    .data;
  const byMethod = (report, m) =>
    report.payments.find((p) => p._id === m)?.total || 0;
  check(
    afterSplitReport.summary.sales - beforeSplitReport.summary.sales === 300 &&
      byMethod(afterSplitReport, "Cash") -
        byMethod(beforeSplitReport, "Cash") ===
        100 &&
      byMethod(afterSplitReport, "UPI") - byMethod(beforeSplitReport, "UPI") ===
        150,
    "Reports allocate split sales by applied payment amounts",
  );
  const splitClosing = (await call("/day-sessions", "GET", undefined, cookie))
    .data.current;
  check(
    splitClosing.cashSales === 100 && splitClosing.expectedCash === 1100,
    "Day closing includes applied cash rather than tendered cash",
  );
  const splitHistory = (
    await call("/sales?payment=Split&summary=true", "GET", undefined, cookie)
  ).data;
  check(
    splitHistory.items.some((s) => s._id === splitSale.data._id),
    "History supports Split payment filtering",
  );
  await call(
    "/day-sessions",
    "POST",
    { action: "close", sessionId: splitDay.data._id, actualCash: 1100 },
    cookie,
  );
  await call(
    "/day-sessions",
    "POST",
    { action: "open", openingCash: 1000 },
    cookie,
  );
  await call(
    `/sales/${splitSale.data._id}`,
    "PATCH",
    { status: "REFUNDED", reason: "Split refund test" },
    cookie,
  );
  const splitRefund = (await call("/day-sessions", "GET", undefined, cookie))
    .data.current;
  check(
    splitRefund.cashRefunds === 100 && splitRefund.expectedCash === 900,
    "Later-session split refund returns only applied cash",
  );
  const bulkProduct = await call("/products", "POST", { ...productInput, name: "Bulk test special", special: true }, cookie);
  check(bulkProduct.status === 201 && bulkProduct.data.special === true, "Special persists on product creation");
  const bulkIds = [p._id, bulkProduct.data._id];
  check((await call("/products/bulk", "PATCH", { action: "update", ids: bulkIds, changes: { special: true, basePrice: 77 } }, cookie)).status === 200, "Mass update applies selected fields");
  const specials = await call("/products?special=true", "GET", undefined, cookie);
  check(bulkIds.every(id => specials.data.items.some(item => item._id === id && item.special && item.basePrice === 77)), "Special filter returns updated products");
  check((await call("/products/bulk", "PATCH", { action: "delete", ids: [p._id, "1234567890abcdef12345678"] }, cookie)).status === 409, "Stale bulk selection fails atomically");
  check((await call(`/products/${p._id}`, "GET", undefined, cookie)).status === 200, "Failed bulk deletion preserves existing selected product");
  check((await call("/products/bulk", "PATCH", { action: "delete", ids: bulkIds }, cookie)).data.count === 2, "Mass delete removes selected products");
  const preserved = await call(`/sales/${splitSale.data._id}`, "GET", undefined, cookie);
  check(preserved.data.items[0].productName === splitSale.data.items[0].productName && preserved.data.total === splitSale.data.total, "Deleting products preserves invoice snapshots and totals");
  console.log(`PASS: ${assertions} API, database and browser assertions. Screenshots saved in test-results/.`);
} catch (error) {
  console.error("TEST FAILED:", error.message);
  if (output)
    console.error(
      "Server log:",
      output.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/g, "[database URI]"),
    );
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) {
    server.kill();
    await new Promise((r) => setTimeout(r, 500));
  }
  await mongoose.disconnect();
  await repl?.stop();
}
