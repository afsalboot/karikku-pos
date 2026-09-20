import { z } from "zod";
import { checkoutSettingsSchema, receiptSettingsSchema, discountSettingsSchema, loyaltySettingsSchema } from "./settings-validation.js";
import { normalizePhone } from "./customer.js";
import { businessDate } from "./dates.js";
export const id = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, "Invalid record identifier");
const text = (max = 100) => z.string().trim().min(1).max(max);
export const amount = z
  .number()
  .finite()
  .min(0)
  .max(1000000)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001,
    "Use at most two decimal places",
  );
export const payment = z.enum([
  "Cash",
  "UPI",
  "Card",
  "Bank Transfer",
  "Other",
]);
export const loginSchema = z
  .object({
    username: text(60).toLowerCase(),
    password: z.string().min(1).max(72),
  })
  .strict();
export const categorySchema = z
  .object({ name: text(60), active: z.boolean().default(true) })
  .strict();
const option = z
  .object({ _id: id.optional(), name: text(60), price: amount })
  .strict();
export const productSchema = z
  .object({
    name: text(),
    categoryId: id,
    imageUrl: z
      .string()
      .max(2048)
      .refine(
        (value) =>
          !value ||
          /^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/(?:v\d+\/)?karikku\/products\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(
            value,
          ),
        "Invalid product image URL",
      )
      .optional(),
    basePrice: amount,
    active: z.boolean(),
    available: z.boolean().optional(),
    special: z.boolean().optional(),
    variantsEnabled: z.boolean(),
    addonsEnabled: z.boolean(),
    variants: z.array(option).max(30),
    addons: z.array(option).max(30),
  })
  .strict()
  .superRefine((p, ctx) => {
    for (const key of ["variants", "addons"])
      if (p[`${key}Enabled`]) {
        if (!p[key].length)
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `Add at least one ${key === "variants" ? "variant" : "add-on"}`,
          });
        if (
          new Set(p[key].map((o) => o.name.toLowerCase())).size !==
          p[key].length
        )
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Option names must be unique",
          });
      }
  });
const bulkIds = z.array(id).min(1).max(500).refine(ids => new Set(ids).size === ids.length, "Duplicate products selected");
export const productBulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: bulkIds }).strict(),
  z.object({ action: z.literal("update"), ids: bulkIds, changes: z.object({
    categoryId: id.optional(), basePrice: amount.optional(), active: z.boolean().optional(),
    available: z.boolean().optional(), special: z.boolean().optional(),
  }).strict().refine(value => Object.keys(value).length > 0, "Choose at least one change") }).strict(),
]);
export const customerSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the customer name").max(100),
    phone: z
      .string()
      .trim()
      .max(30)
      .transform(normalizePhone)
      .pipe(
        z
          .string()
          .regex(/^\d{10,15}$/, "Enter a valid phone number (10–15 digits)"),
      ),
  })
  .passthrough();
export const birthdayProofSchema = z.object({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the birthday shown on the proof")
    .refine(value => {
      const date = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= businessDate();
    }, "Enter a valid date of birth that is not in the future"),
  checked: z.literal(true, { error: "Confirm that you checked the birthday proof" }),
}).strict();
const loyaltyRedemptionSchema = z.object({
  walletAmount: amount.default(0),
  stampReward: z.boolean().default(false),
  birthdayReward: z.boolean().default(false),
  birthdayProof: birthdayProofSchema.optional(),
}).strict().refine(value => !value.birthdayProof || value.birthdayReward, {
  message: "Birthday proof is only used when applying a birthday reward",
  path: ["birthdayProof"],
});
export const checkoutSchema = z
  .object({
    requestId: z.string().uuid(),
    customer: customerSchema.optional(),
    items: z
      .array(
        z
          .object({
            productId: id,
            variantId: id.nullish(),
            addonIds: z.array(id).max(30).default([]),
            quantity: z.number().int().min(1).max(999),
            note: z.string().trim().max(200).default(""),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    discount: z
      .object({ type: z.enum(["fixed", "percentage"]), value: amount, reason: z.string().trim().max(200).optional() })
      .strict(),
    paymentMethod: z.enum(["Cash", "UPI", "Card", "Split"]),
    payments: z
      .array(
        z
          .object({
            method: z.enum(["Cash", "UPI", "Card"]),
            amount: z.number().finite().min(0).max(100000000),
          })
          .strict(),
      )
      .min(2)
      .max(3)
      .optional(),
    cashReceived: z.number().finite().min(0).max(100000000).optional(),
    loyalty: loyaltyRedemptionSchema.optional(),
  })
  .strict();
export const loyaltyPreviewSchema = z
  .object({
    customerId: id,
    subtotalAfterDiscount: amount,
    loyalty: loyaltyRedemptionSchema,
  })
  .strict();
export const expenseSchema = z
  .object({
    categoryId: id,
    description: text(200),
    amount: amount.refine((n) => n > 0, "Amount must be positive"),
    paymentMethod: payment,
    expenseDate: z.iso.date(),
    note: z.string().trim().max(500).default(""),
  })
  .strict();
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(12, "Use no more than 12 characters")
  .refine(
    (s) => new TextEncoder().encode(s).length <= 72,
    "Password must not exceed 72 bytes",
  );
export const userSchema = z
  .object({
    name: text(),
    username: text(60)
      .regex(/^[a-zA-Z0-9._-]+$/)
      .toLowerCase(),
    password: passwordSchema,
    role: z.enum(["ADMIN", "CASHIER"]),
    active: z.boolean().default(true),
  })
  .strict();
export const userUpdateSchema = userSchema
  .omit({ password: true })
  .extend({ password: passwordSchema.optional() });
export const settingSchema = z
  .object({
    checkout: checkoutSettingsSchema.optional(),
    receipt: receiptSettingsSchema.optional(),
    discounts: discountSettingsSchema.optional(),
    loyalty: loyaltySettingsSchema.optional(),
    upiId: z.string().trim().max(100).refine(v=>!v||/^[\w.\-]+@[\w.\-]+$/.test(v), "Enter a valid UPI ID").optional(),
    businessName: z.string().trim().max(100).default(""),
    address: z.string().trim().max(300),
    phone: z.string().trim().max(30),
    email: z.union([z.email(), z.literal("")]),
    gstin: z.string().trim().max(30),
    logo: z
      .string()
      .refine(
        (v) =>
          !v || /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(v),
        "Use a PNG, JPEG or WebP image",
      ),
    currency: z.literal("INR"),
    invoicePrefix: text(12).regex(/^[A-Za-z0-9-]+$/),
    invoiceNumberFormat: z.enum([
      "SEQUENCE",
      "DATE_SEQUENCE",
      "DATETIME_SEQUENCE",
    ]),
    invoiceSequencePadding: z.number().int().min(1).max(6),
    startingNumber: z.number().int().min(1).max(999999999),
    receiptFooter: z.string().trim().max(300),
    paymentMethods: z
      .array(z.enum(["Cash", "UPI", "Card"]))
      .min(1)
      .max(3)
      .refine((v) => new Set(v).size === v.length),
    discountEnabled: z.boolean(),
    allowCashierDiscount: z.boolean(),
    maxCashierDiscount: z.number().min(0).max(100),
    allowCashierExpenses: z.boolean(),
    allowCashierDayClosing: z.boolean(),
    receiptSize: z.enum(["80mm", "58mm"]),
    gstEnabled: z.boolean(),
    taxRate: z.number().min(0).max(100),
  })
  .strict()
  .refine((value) => Boolean(value.businessName || value.logo), {
    message: "Add a business name or receipt logo",
    path: ["businessName"],
  });
export const sessionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), openingCash: amount, openingAdjustmentReason: z.string().trim().max(300).optional() }).strict(),
  z.object({ action: z.literal("movement"), sessionId: id, requestId: z.string().uuid(), type: z.enum(["IN", "OUT"]), category: text(80), amount: amount.refine(n => n > 0, "Enter a positive amount"), note: z.string().trim().max(500).default("") }).strict(),
  z
    .object({
      action: z.literal("close"),
      sessionId: id,
      actualCash: amount,
      expectedCash: z.number().finite().optional(),
      reviewToken: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      differenceReason: z.string().trim().max(80).optional(),
      closingNote: z.string().trim().max(500).optional(),
      denominationCount: amount.optional(),
      denominationBreakdown: z.object({
        "500": z.number().int().min(0).max(100000), "200": z.number().int().min(0).max(100000),
        "100": z.number().int().min(0).max(100000), "50": z.number().int().min(0).max(100000),
        "20": z.number().int().min(0).max(100000), "10": z.number().int().min(0).max(100000), coins: amount,
      }).strict().optional(),
      cashRemovedAtClosing: amount.default(0),
      closingFloat: amount.optional(),
      differenceDescription: z.string().trim().max(300).optional(),
    })
    .strict(),
]);
export const statusSchema = z
  .object({ status: z.enum(["CANCELLED", "REFUNDED"]), reason: text(300) })
  .strict();
