import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { productBulkSchema } from "../src/lib/validation.js";
test("bulk product actions reject empty, duplicate, excessive and unsafe changes", () => {
  const ids = ["1234567890abcdef12345678"];
  assert.equal(productBulkSchema.safeParse({ action: "delete", ids }).success, true);
  assert.equal(productBulkSchema.safeParse({ action: "delete", ids: [] }).success, false);
  assert.equal(productBulkSchema.safeParse({ action: "delete", ids: [...ids, ...ids] }).success, false);
  assert.equal(productBulkSchema.safeParse({ action: "delete", ids: Array(501).fill(ids[0]) }).success, false);
  for (const changes of [{}, { basePrice: -1 }, { basePrice: 1.001 }, { special: "true" }, { name: "Overwrite" }, { categoryId: "bad" }])
    assert.equal(productBulkSchema.safeParse({ action: "update", ids, changes }).success, false);
  assert.deepEqual(productBulkSchema.parse({ action: "update", ids, changes: { special: false, basePrice: 0 } }).changes, { special: false, basePrice: 0 });
});
import { normalizePayment, salePayments } from "../src/lib/payments.js";
import { checkoutDefaults, settingsWithDefaults, validateCheckoutSettings, discountDefaults } from "../src/lib/settings-config.js";
import { loyaltySettingsSchema } from "../src/lib/settings-validation.js";
import { birthdayEligible } from "../src/lib/reward-periods.js";
test("checkout defaults preserve existing behavior and configured restrictions are enforced",()=>{
  assert.deepEqual(settingsWithDefaults({}).checkout,checkoutDefaults);
  const input={items:[{quantity:1,note:""}],paymentMethod:"Cash"};
  assert.doesNotThrow(()=>validateCheckoutSettings(input,{}));
  assert.throws(()=>validateCheckoutSettings(input,{checkout:{customerPrompt:"REQUIRED"}}),/Customer/);
  assert.throws(()=>validateCheckoutSettings({...input,paymentMethod:"Split"},{checkout:{splitPayment:false}}),/Split/);
  assert.throws(()=>validateCheckoutSettings({...input,cashReceived:500},{checkout:{cashAmountEntry:false}}),/Cash/);
  assert.throws(()=>validateCheckoutSettings(input,{checkout:{allowCustomQuantity:false,defaultQuantity:2}}),/multiples/);
  assert.throws(()=>validateCheckoutSettings({...input,items:[{quantity:1,note:"test"}]},{checkout:{allowItemNotes:false}}),/notes/);
});
test("birthday windows follow IST including the midnight and year boundaries",()=>{
  const customer={dateOfBirth:"2000-09-15",loyalty:{}};
  assert.equal(birthdayEligible(customer,{availability:"DAY"},new Date("2026-09-14T19:00:00Z")),true);
  assert.equal(birthdayEligible(customer,{availability:"DAY"},new Date("2026-09-14T17:00:00Z")),false);
  assert.equal(birthdayEligible(customer,{availability:"WEEK"},new Date("2026-09-21T06:00:00Z")),true);
  assert.equal(birthdayEligible(customer,{availability:"WEEK"},new Date("2026-09-22T06:00:00Z")),false);
});
test("loyalty configuration rejects invalid rates and periods without losing disabled configuration",async()=>{
  const {defaults}=await import("../src/models/Setting.js");
  assert.equal(loyaltySettingsSchema.safeParse(defaults.loyalty).success,true);
  assert.equal(loyaltySettingsSchema.safeParse({...defaults.loyalty,wallet:{...defaults.loyalty.wallet,cashbackPercentage:101}}).success,false);
  assert.equal(loyaltySettingsSchema.safeParse({...defaults.loyalty,visit:{...defaults.loyalty.visit,periodDays:0}}).success,false);
  assert.equal(loyaltySettingsSchema.parse({...defaults.loyalty,enabled:false}).wallet.cashbackPercentage,defaults.loyalty.wallet.cashbackPercentage);
  assert.equal(discountDefaults.maximumPercentage,100);
});
import { validCash, validSession, cashDifference, historyFilter, denominationTotal, reconciliationState } from "../src/lib/day-closing.js";
test("drawer denominations retain paise and negative balances require review", () => {
  assert.equal(denominationTotal({500: 5, 200: 3, 100: 4, 50: 2, 20: 3, 10: 4, coins: 0.25}), 3700.25);
  assert.equal(reconciliationState({expectedCash: -100, difference: 100}), "NEEDS_REVIEW");
  assert.equal(reconciliationState({expectedCash: 100, difference: 0}), "BALANCED");
  assert.deepEqual(historyFilter(new URLSearchParams({balance: "review"})).expectedCash, {$lt: 0});
  assert.deepEqual(historyFilter(new URLSearchParams({balance: "over"})).expectedCash, {$gte: 0});
});
test("cash reconciliation rejects invalid counts and calculates exact paise differences", () => {
  for (const value of ["", "-1", "NaN", "Infinity", "1e2", "1.001", "1000001"]) assert.equal(validCash(value), false);
  for (const value of ["0", "0.01", "2900.00", "1000000"]) assert.equal(validCash(value), true);
  assert.equal(cashDifference("0.3", 0.1 + 0.2), 0);
  assert.equal(cashDifference("2400", 2900), -500);
  assert.equal(cashDifference("3100", 2900), 200);
  const day = { _id: "session", status: "OPEN", openedAt: "2026-09-13T16:00:00Z", businessDate: "2026-09-13", openingCash: 2500, cashSales: 100, cashExpenses: 25, cashRefunds: 50, expectedCash: 2525, totalSales: 400 };
  assert.equal(validSession(day), true);
  assert.equal(validSession({...day, expectedCash: 2825}), false);
  assert.equal(validSession({...day, cashSales: NaN}), false);
  assert.equal(validSession({...day, status: "CLOSED"}), false);
});
test("closed-session filters combine dates, status and escaped literal search", () => {
  const filter = historyFilter(new URLSearchParams({from: "2026-09-01", to: "2026-09-14", balance: "short", search: "Admin.*"}));
  assert.deepEqual(filter.businessDate, {$gte:"2026-09-01", $lte:"2026-09-14"});
  assert.deepEqual(filter.difference, {$lt:0});
  assert.equal(filter.$or[0]["openedBy.name"].$regex, "Admin\\.\\*");
  assert.throws(()=>historyFilter(new URLSearchParams({from:"2026-09-14",to:"2026-09-01"})));
});
test("cached Sale schema accepts split snapshots after hot reload", async () => {
  const cached = mongoose.model(
    "Sale",
    new mongoose.Schema(
      {
        paymentMethod: { type: String, enum: ["Cash", "UPI", "Card", "Other"] },
      },
      { strict: "throw" },
    ),
  );
  try {
    const { default: Sale } = await import("../src/models/Sale.js");
    assert.equal(Sale, cached);
    const sale = new Sale({
      paymentMethod: "Split",
      payments: [
        { method: "Cash", amount: 100 },
        { method: "UPI", amount: 200 },
      ],
      cashReceived: 500,
      changeGiven: 400,
    });
    await assert.doesNotReject(sale.validate());
    assert.equal(sale.toObject().changeGiven, 400);
    assert.equal(sale.payments.length, 2);
    await assert.doesNotReject(new Sale({ paymentMethod: "Other" }).validate());
  } finally {
    mongoose.deleteModel("Sale");
  }
});
test("cash tender stores applied amount and computes change in paise", () => {
  const result = normalizePayment(
    { paymentMethod: "Cash", cashReceived: 500 },
    300.5,
  );
  assert.equal(result.payments[0].amount, 300.5);
  assert.equal(result.changeGiven, 199.5);
  assert.equal(normalizePayment({ paymentMethod: "Cash" }, 0).changeGiven, 0);
  for (const cashReceived of [NaN, -1, 299, 300.501, 100000001])
    assert.throws(() =>
      normalizePayment({ paymentMethod: "Cash", cashReceived }, 300.5),
    );
});
test("split allocations must balance exactly, be unique and use enabled methods", () => {
  const input = {
    paymentMethod: "Split",
    payments: [
      { method: "Cash", amount: 0.1 },
      { method: "UPI", amount: 0.2 },
    ],
    cashReceived: 1,
  };
  assert.equal(normalizePayment(input, 0.3).changeGiven, 0.9);
  for (const total of [0.2, 0.4])
    assert.throws(() => normalizePayment(input, total));
  assert.throws(() => normalizePayment(input, 0.3, ["Cash"]));
  assert.throws(() =>
    normalizePayment(
      {
        ...input,
        payments: [
          { method: "Cash", amount: 0.1 },
          { method: "Cash", amount: 0.2 },
        ],
      },
      0.3,
    ),
  );
  assert.throws(() => normalizePayment({ ...input, payments: [] }, 0.3));
  assert.throws(() =>
    normalizePayment(
      {
        ...input,
        payments: [
          { method: "Cash", amount: 0 },
          { method: "UPI", amount: 0.3 },
        ],
      },
      0.3,
    ),
  );
  assert.throws(() =>
    normalizePayment(
      {
        ...input,
        payments: [
          { method: "Cash", amount: 0.001 },
          { method: "UPI", amount: 0.299 },
        ],
      },
      0.3,
    ),
  );
});
test("new payments reject Other while historical receipts retain their payment method", () => {
  assert.throws(() => normalizePayment({ paymentMethod: "Other" }, 100));
  assert.throws(() =>
    normalizePayment({ paymentMethod: "Card", cashReceived: 100 }, 100),
  );
  assert.deepEqual(normalizePayment({ paymentMethod: "UPI" }, 100).payments, [
    { method: "UPI", amount: 100 },
  ]);
  assert.deepEqual(salePayments({ paymentMethod: "Other", total: 100 }), [
    { method: "Other", amount: 100 },
  ]);
});
test("cached Product models accept availability after hot reload and retain strict validation", async () => {
  const cached = mongoose.model(
    "Product",
    new mongoose.Schema({ name: String, active: Boolean }, { strict: "throw" }),
  );
  const cast = (Model, update) =>
    Model.findByIdAndUpdate("6aa45d70edc63c6d3f707cbc", update)._castUpdate(
      update,
    );
  try {
    assert.throws(() => cast(cached, { available: false }), {
      name: "StrictModeError",
    });
    const { default: Product } = await import("../src/models/Product.js");
    assert.equal(Product, cached);
    assert.deepEqual(cast(Product, { available: false }), {
      $set: { available: false },
    });
    assert.equal(new Product({ name: "Juice" }).available, true);
    assert.throws(() => cast(Product, { unknownField: true }), {
      name: "StrictModeError",
    });
  } finally {
    mongoose.deleteModel("Product");
  }
});
import { salesRange } from "../src/components/sales/history-utils.js";
import { duplicateItems } from "../src/lib/duplicate-sale.js";
test("sales presets handle last month and year boundaries", () => {
  assert.deepEqual(salesRange("last-month", "2026-01-12"), {
    from: "2025-12-01",
    to: "2025-12-31",
  });
  assert.deepEqual(salesRange("last-month", "2024-03-15"), {
    from: "2024-02-01",
    to: "2024-02-29",
  });
  assert.deepEqual(salesRange("7", "2026-01-03"), {
    from: "2025-12-28",
    to: "2026-01-03",
  });
});
test("sale duplication uses current prices and rejects unavailable options", () => {
  const sale = {
    items: [
      {
        productId: "p",
        productName: "Juice",
        quantity: 3,
        note: "No sugar",
        variant: { name: "Large" },
        addons: [{ name: "Ice cream" }],
      },
    ],
  };
  const product = {
    _id: "p",
    name: "Juice",
    active: true,
    categoryId: { active: true, name: "Juice" },
    variantsEnabled: true,
    variants: [{ _id: "v", name: "Large", price: 160 }],
    addonsEnabled: true,
    addons: [{ _id: "a", name: "Ice cream", price: 20 }],
  };
  const [item] = duplicateItems(sale, [product]);
  assert.equal(item.quantity, 3);
  assert.equal(item.unitTotal, 180);
  assert.equal(item.note, "No sugar");
  assert.deepEqual(item.addonIds, ["a"]);
  assert.throws(() => duplicateItems(sale, [{ ...product, active: false }]));
  assert.throws(() => duplicateItems(sale, [{ ...product, addons: [] }]));
});
import { customerSchema } from "../src/lib/validation.js";
test("checkout customers normalize phone numbers and require both details", () => {
  assert.deepEqual(
    customerSchema.parse({
      name: "  Test Customer  ",
      phone: "+91 98765-43210",
    }),
    { name: "Test Customer", phone: "9876543210" },
  );
  assert.equal(
    customerSchema.safeParse({ name: "", phone: "9876543210" }).success,
    false,
  );
  assert.equal(
    customerSchema.safeParse({ name: "Test", phone: "123" }).success,
    false,
  );
  assert.equal(
    customerSchema.safeParse({ name: "Test", phone: "letters9876543210" })
      .success,
    false,
  );
});
import {
  periodRange,
  previousRange,
  comparison,
  hourlySeries,
} from "../src/components/dashboard/period.js";
test("dashboard periods compare equal inclusive ranges across month boundaries", () => {
  assert.deepEqual(periodRange("7", "2026-03-02"), {
    from: "2026-02-24",
    to: "2026-03-02",
  });
  assert.deepEqual(previousRange({ from: "2026-02-24", to: "2026-03-02" }), {
    from: "2026-02-17",
    to: "2026-02-23",
  });
  assert.deepEqual(previousRange({ from: "2026-01-01", to: "2026-01-01" }), {
    from: "2025-12-31",
    to: "2025-12-31",
  });
  assert.throws(() => previousRange({ from: "2026-03-02", to: "2026-03-01" }));
});
test("dashboard comparisons handle zero baselines and hourly gaps", () => {
  assert.deepEqual(comparison(100, 0, true), { delta: 100, value: null });
  assert.deepEqual(comparison(125, 100, true), { delta: 25, value: 25 });
  assert.deepEqual(comparison(0, 100, true), { delta: -100, value: -100 });
  const hours = hourlySeries([{ _id: 13, sales: 450, orders: 2 }]);
  assert.equal(hours.length, 24);
  assert.equal(hours[13].label, "1 PM");
  assert.equal(
    hours.reduce((sum, item) => sum + item.sales, 0),
    450,
  );
  assert.equal(hours[0].sales, 0);
});
import { addCartItem } from "../src/lib/cart.js";
test("repeated matching products merge quantities while configurations stay separate", () => {
  const item = {
    key: "one",
    productId: "p",
    variantId: "v",
    addonIds: ["ice", "nuts"],
    unitTotal: 160,
    quantity: 1,
    note: "",
  };
  const original = [item];
  let cart = addCartItem(original, {
    ...item,
    key: "two",
    addonIds: ["nuts", "ice"],
  });
  cart = addCartItem(cart, { ...item, key: "three" });
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
  assert.equal(cart[0].key, "one");
  assert.equal(original[0].quantity, 1);
  for (const change of [
    { addonIds: [] },
    { variantId: "other" },
    { note: "No sugar" },
    { unitTotal: 170 },
    { productId: "different" },
  ]) {
    assert.equal(addCartItem(cart, { ...item, ...change }).length, 2);
  }
  assert.equal(
    addCartItem([{ ...item, quantity: 999 }], item)[0].quantity,
    999,
  );
});
import { calculateTotals, buildSaleItems } from "../src/lib/calculations.js";
import { formatInvoiceNumber } from "../src/lib/invoice-number.js";
test("sold-out products cannot enter checkout or duplicated sale carts", () => {
  const product = {
    _id: "p",
    name: "Juice",
    active: true,
    available: false,
    categoryId: { active: true },
  };
  assert.throws(
    () => buildSaleItems([{ productId: "p" }], [product], []),
    /no longer available/,
  );
  assert.throws(
    () =>
      duplicateItems({ items: [{ productId: "p", productName: "Juice" }] }, [
        product,
      ]),
    /no longer available/,
  );
});
import {
  productSchema,
  checkoutSchema,
  settingSchema,
  userSchema,
  userUpdateSchema,
} from "../src/lib/validation.js";
import { dateBounds, businessDate } from "../src/lib/dates.js";
import {
  validateProductImage,
  MAX_PRODUCT_IMAGE_BYTES,
} from "../src/lib/product-images.js";
test("product image validation checks type, file signature and size", () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.doesNotThrow(() => validateProductImage(png, "image/png"));
  assert.throws(() =>
    validateProductImage(Buffer.from("fake image"), "image/png"),
  );
  assert.throws(() => validateProductImage(png, "image/svg+xml"));
  assert.throws(() =>
    validateProductImage(
      Buffer.alloc(MAX_PRODUCT_IMAGE_BYTES + 1),
      "image/png",
    ),
  );
  assert.throws(() => validateProductImage(Buffer.alloc(0), "image/png"));
});
const settings = {
  discountEnabled: true,
  allowCashierDiscount: true,
  maxCashierDiscount: 10,
  gstEnabled: false,
  taxRate: 0,
};
test("invoice formats use Indian Standard Time and preserve the sequence", () => {
  const input = {
    prefix: "INV-",
    sequence: 42,
    date: new Date("2026-09-14T07:04:56.000Z"),
  };
  assert.equal(formatInvoiceNumber({ ...input, format: "SEQUENCE" }), "INV-000042");
  assert.equal(formatInvoiceNumber({ ...input, format: "SEQUENCE", sequencePadding: 1 }), "INV-42");
  assert.equal(formatInvoiceNumber({ ...input, format: "SEQUENCE", sequencePadding: 3 }), "INV-042");
  assert.equal(formatInvoiceNumber({ ...input, format: "DATE_SEQUENCE" }), "INV-20260914-000042");
  assert.equal(formatInvoiceNumber({ ...input, format: "DATETIME_SEQUENCE" }), "INV-20260914-123456-000042");
});
test("new and reset passwords accept 8–12 characters and reject outside bounds", () => {
  const fields = {
    name: "Test",
    username: "test",
    role: "CASHIER",
    active: true,
  };
  for (const length of [7, 8, 12, 13]) {
    const expected = length >= 8 && length <= 12;
    const input = { ...fields, password: "a".repeat(length) };
    assert.equal(userSchema.safeParse(input).success, expected);
    assert.equal(userUpdateSchema.safeParse(input).success, expected);
  }
  assert.equal(userUpdateSchema.safeParse(fields).success, true);
});
test("bill uses integer cents, rounds percentage discounts, then tax", () => {
  const result = calculateTotals(
    [{ lineTotal: 170 }, { lineTotal: 80 }],
    { type: "percentage", value: 10 },
    { ...settings, gstEnabled: true, taxRate: 5 },
    { role: "ADMIN" },
  );
  assert.equal(result.subtotal, 250);
  assert.equal(result.discount.amount, 25);
  assert.equal(result.tax.amount, 11.25);
  assert.equal(result.total, 236.25);
});
test("enabled discounts are available to every user", () => {
  const result = calculateTotals(
    [{ lineTotal: 100 }],
    { type: "fixed", value: 11 },
    settings,
    { role: "CASHIER" },
  );
  assert.equal(result.discount.amount, 11);
  assert.equal(result.total, 89);
});
test("disabled discounts are rejected for every user", () => {
  assert.throws(
    () =>
      calculateTotals(
        [{ lineTotal: 100 }],
        { type: "fixed", value: 1 },
        { ...settings, discountEnabled: false },
        { role: "ADMIN" },
      ),
    /disabled/,
  );
});
test("invalid, excessive and negative discounts are rejected", () => {
  for (const discount of [
    { type: "fixed", value: -1 },
    { type: "percentage", value: 101 },
    { type: "fixed", value: 101 },
  ])
    assert.throws(() =>
      calculateTotals([{ lineTotal: 100 }], discount, settings, {
        role: "ADMIN",
      }),
    );
});
test("variant and multiple add-ons are snapshotted and multiplied by quantity", () => {
  const products = [
    {
      _id: "p",
      active: true,
      name: "Mango",
      categoryId: "c",
      basePrice: 1,
      variantsEnabled: true,
      addonsEnabled: true,
      variants: [{ _id: "v", name: "Large", price: 100 }],
      addons: [
        { _id: "a", name: "Nuts", price: 30 },
        { _id: "b", name: "Ice cream", price: 20 },
      ],
    },
  ];
  const cart = [
    {
      productId: "p",
      variantId: "v",
      addonIds: ["a", "b"],
      quantity: 2,
      note: "Less sugar",
    },
  ];
  const result = buildSaleItems(cart, products, [
    { _id: "c", active: true, name: "Juice" },
  ]);
  assert.equal(result[0].lineTotal, 300);
  assert.equal(result[0].note, "Less sugar");
  assert.equal(result[0].variant.name, "Large");
  assert.throws(
    () =>
      buildSaleItems([{ ...cart[0], variantId: null }], products, [
        { _id: "c", active: true },
      ]),
    /variant/,
  );
  assert.throws(
    () =>
      buildSaleItems([{ ...cart[0], addonIds: ["a", "a"] }], products, [
        { _id: "c", active: true },
      ]),
    /Duplicate/,
  );
  assert.throws(
    () =>
      buildSaleItems(
        cart,
        [{ ...products[0], active: false }],
        [{ _id: "c", active: true }],
      ),
    /available/,
  );
});
test("IST date boundaries include midnight in India", () => {
  const dates = dateBounds("2026-09-12", "2026-09-12");
  assert.equal(dates.$gte.toISOString(), "2026-09-11T18:30:00.000Z");
  assert.equal(dates.$lt.toISOString(), "2026-09-12T18:30:00.000Z");
  assert.equal(businessDate(new Date("2026-09-11T20:00:00Z")), "2026-09-12");
  assert.throws(() => dateBounds("2026-02-30", "2026-03-01"));
  assert.throws(() => dateBounds("2026-09-12", "2026-09-11"));
});
test("product schema requires configured variants and unique option names", () => {
  const product = {
    name: "Mango",
    categoryId: "a".repeat(24),
    basePrice: 80,
    active: true,
    variantsEnabled: true,
    addonsEnabled: false,
    variants: [],
    addons: [],
  };
  assert.equal(productSchema.safeParse(product).success, false);
  assert.equal(
    productSchema.safeParse({
      ...product,
      variants: [
        { name: "Small", price: 50 },
        { name: "small", price: 60 },
      ],
    }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({
      ...product,
      variantsEnabled: false,
      basePrice: 0.001,
    }).success,
    false,
  );
});
test("checkout rejects client totals, zero quantities, and missing payment", () => {
  const cart = {
    requestId: "0bbf6cb5-4c5e-4394-89c7-41dcb113c31a",
    items: [{ productId: "a".repeat(24), quantity: 1, addonIds: [], note: "" }],
    discount: { type: "fixed", value: 0 },
    paymentMethod: "Cash",
  };
  assert.equal(checkoutSchema.safeParse(cart).success, true);
  assert.equal(checkoutSchema.safeParse({ ...cart, total: 1 }).success, false);
  assert.equal(
    checkoutSchema.safeParse({
      ...cart,
      items: [{ ...cart.items[0], quantity: 0 }],
    }).success,
    false,
  );
  assert.equal(
    checkoutSchema.safeParse({ ...cart, paymentMethod: "" }).success,
    false,
  );
  assert.equal(settingSchema.safeParse({}).success, false);
});
