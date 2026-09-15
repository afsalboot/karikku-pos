import Sale from "../models/Sale.js";
import Expense from "../models/Expense.js";
import Product from "../models/Product.js";
import Customer from "../models/Customer.js";
import { fail } from "../lib/auth.js";
import { initialize } from "./settings.js";
export const csvCell = value => `"${String(value ?? "").replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`;
export async function exportSettingsData(kind) {
  const specs = {
    sales: [Sale, ["invoiceNumber", "createdAt", "status", "total", "paymentMethod", "customer.name", "cashier.name"]],
    expenses: [Expense, ["expenseDate", "description", "amount", "paymentMethod", "note"]],
    products: [Product, ["name", "basePrice", "active", "available"]],
    customers: [Customer, ["name", "phone", "dateOfBirth", "loyalty.walletBalance", "loyalty.stampCount"]],
  };
  if (!specs[kind]) fail(400, "Choose sales, expenses, products or customers");
  await initialize();
  const [model, fields] = specs[kind];
  const cursor = model.find(kind === "expenses" ? {deletedAt:null} : {}).select(fields.join(" ")).lean().cursor();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode("\ufeff" + fields.map(csvCell).join(",") + "\r\n")); },
    async pull(controller) {
      try { const record = await cursor.next(); if (!record) { await cursor.close(); controller.close(); return; }
        controller.enqueue(encoder.encode(fields.map(path => {const value=path.split(".").reduce((obj,key)=>obj?.[key],record);return csvCell(value instanceof Date ? value.toISOString() : value);}).join(",") + "\r\n"));
      } catch(error) { await cursor.close(); controller.error(error); }
    },
    cancel() { return cursor.close(); }
  });
  return new Response(stream, {headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="karikku-${kind}.csv"`,"Cache-Control":"no-store"}});
}
