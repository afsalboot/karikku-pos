import test from "node:test";
import assert from "node:assert/strict";
import { safeReturnPath, canAccessSection } from "../src/lib/navigation.js";
import { maintenanceEnabled } from "../src/lib/maintenance.js";
import { api } from "../src/lib/client.js";

test("return destinations reject external URLs, encodings, action queries and auth loops", () => {
  for (const value of [
    null,
    "",
    "https://other.test",
    "//other.test",
    "/\\other.test",
    "/%2fother.test",
    "/login",
    "/api/auth/logout",
    "/help",
    "/pos?duplicate=123",
    "/sales#secret",
    "/sales/../login",
    "/sales\n",
    "/products/add",
  ]) {
    assert.equal(safeReturnPath(value), "/pos", String(value));
  }
  assert.equal(safeReturnPath("/sales"), "/sales");
  assert.equal(
    safeReturnPath("/sales/1234567890abcdef12345678"),
    "/sales/1234567890abcdef12345678",
  );
  assert.equal(safeReturnPath(null, "/dashboard"), "/dashboard");
});

test("cashier page access follows explicit permission flags", () => {
  assert.equal(canAccessSection("CASHIER", "users"), false);
  assert.equal(canAccessSection("CASHIER", "settings"), false);
  assert.equal(canAccessSection("CASHIER", "account"), true);
  assert.equal(canAccessSection("CASHIER", "expenses"), false);
  assert.equal(
    canAccessSection("CASHIER", "expenses", { allowCashierExpenses: true }),
    true,
  );
  assert.equal(
    canAccessSection("CASHIER", "day-closing", {
      allowCashierDayClosing: true,
    }),
    true,
  );
  assert.equal(canAccessSection("ADMIN", "users"), true);
});

test("maintenance must be explicitly enabled", () => {
  for (const value of [undefined, "false", "0", "TRUE", ""])
    assert.equal(maintenanceEnabled(value), false);
  assert.equal(maintenanceEnabled("true"), true);
});

test("API expiry clears reference cache and uses a safe return, while bad login stays on form", async () => {
  const originalFetch = globalThis.fetch,
    originalWindow = globalThis.window;
  const destinations = [];
  globalThis.window = {
    location: { pathname: "/sales", assign: (url) => destinations.push(url) },
  };
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ data: { old: true } }),
    });
    await api("/settings");
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: "Please sign in" }),
    });
    await assert.rejects(api("/auth/me"), /Please sign in/);
    assert.equal(destinations[0], "/login?reason=expired&next=%2Fsales");
    await assert.rejects(api("/settings"), /Please sign in/);
    await assert.rejects(
      api("/auth/login", { method: "POST", body: {} }),
      /Please sign in/,
    );
    assert.equal(destinations.length, 2);
    globalThis.fetch = async () => {
      throw new TypeError("sensitive network detail");
    };
    await assert.rejects(api("/sales"), /Unable to reach the server/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
