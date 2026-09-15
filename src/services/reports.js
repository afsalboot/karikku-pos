import Sale from "../models/Sale.js";
import Expense from "../models/Expense.js";
import { admin, requireUser } from "../lib/auth.js";
import { ok } from "../lib/http.js";
import { dateBounds } from "../lib/dates.js";
import { dashboardClosing } from "./dashboard-overview.js";
import { paymentGroups } from "../lib/payments.js";
export async function reports(request) {
  admin(await requireUser());
  const url = new URL(request.url);
  const dashboard = url.pathname.endsWith("/dashboard");
  const dates = dateBounds(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );
  const [sales, expenses] = await Promise.all([
    Sale.aggregate([
      { $match: { status: "COMPLETED", createdAt: dates } },
      {
        $facet: {
          hourly: [
            {
              $group: {
                _id: {
                  $hour: { date: "$createdAt", timezone: "Asia/Kolkata" },
                },
                sales: { $sum: "$total" },
                orders: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          ...(dashboard
            ? {
                recent: [
                  { $sort: { createdAt: -1, _id: -1 } },
                  { $limit: 5 },
                  {
                    $project: {
                      invoiceNumber: 1,
                      items: { productName: 1, quantity: 1 },
                      createdAt: 1,
                      paymentMethod: 1,
                      total: 1,
                    },
                  },
                ],
              }
            : {}),
          summary: [
            {
              $group: {
                _id: null,
                sales: { $sum: "$total" },
                orders: { $sum: 1 },
                discount: { $sum: "$discount.amount" },
                tax: { $sum: "$tax.amount" },
              },
            },
          ],
          payments: paymentGroups,
          daily: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    date: "$createdAt",
                    format: "%Y-%m-%d",
                    timezone: "Asia/Kolkata",
                  },
                },
                sales: { $sum: "$total" },
              },
            },
            { $sort: { _id: 1 } },
          ],
          products: [
            { $unwind: "$items" },
            {
              $group: {
                _id: "$items.productId",
                name: { $last: "$items.productName" },
                categoryName: { $last: "$items.categoryName" },
                quantity: { $sum: "$items.quantity" },
                revenue: { $sum: "$items.lineTotal" },
              },
            },
            { $sort: { quantity: -1 } },
            { $limit: 500 },
          ],
          categories: [
            { $unwind: "$items" },
            {
              $group: {
                _id: "$items.categoryId",
                name: { $last: "$items.categoryName" },
                quantity: { $sum: "$items.quantity" },
                revenue: { $sum: "$items.lineTotal" },
              },
            },
            { $sort: { revenue: -1 } },
            { $limit: 500 },
          ],
          cashiers: [
            {
              $group: {
                _id: "$cashier.userId",
                name: { $last: "$cashier.name" },
                orders: { $sum: 1 },
                sales: { $sum: "$total" },
                discount: { $sum: { $ifNull: ["$discount.amount", 0] } },
              },
            },
            {
              $set: {
                gross: { $add: ["$sales", "$discount"] },
                averageBill: {
                  $cond: [
                    { $gt: ["$orders", 0] },
                    { $divide: ["$sales", "$orders"] },
                    0,
                  ],
                },
              },
            },
            { $sort: { sales: -1 } },
            { $limit: 500 },
          ],
        },
      },
    ]),
    Expense.aggregate([
      { $match: { deletedAt: null, expenseDate: dates } },
      {
        $facet: {
          summary: [{ $group: { _id: null, expenses: { $sum: "$amount" } } }],
          daily: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    date: "$expenseDate",
                    format: "%Y-%m-%d",
                    timezone: "Asia/Kolkata",
                  },
                },
                expenses: { $sum: "$amount" },
              },
            },
          ],
          categories: [
            {
              $group: {
                _id: "$categoryId",
                name: { $last: "$categoryName" },
                amount: { $sum: "$amount" },
              },
            },
            { $sort: { amount: -1 } },
            { $limit: 500 },
          ],
        },
      },
    ]),
  ]);
  const s = sales[0],
    e = expenses[0];
  const summary = {
    sales: 0,
    orders: 0,
    discount: 0,
    tax: 0,
    ...s.summary[0],
    expenses: e.summary[0]?.expenses || 0,
  };
  summary.netEarnings = summary.sales - summary.expenses;
  summary.averageBill = summary.orders ? summary.sales / summary.orders : 0;
  const daily = [];
  for (
    let date = new Date(dates.$gte);
    date < dates.$lt;
    date = new Date(date.getTime() + 86400000)
  ) {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(date);
    daily.push({
      date: key,
      sales: s.daily.find((d) => d._id === key)?.sales || 0,
      expenses: e.daily.find((d) => d._id === key)?.expenses || 0,
    });
  }
  return ok({
    ...(dashboard
      ? {
          hourly: s.hourly,
          recent: s.recent,
          closing: await dashboardClosing(),
        }
      : {}),
    summary,
    daily,
    hourly: s.hourly,
    payments: s.payments,
    products: s.products,
    categories: s.categories,
    cashiers: s.cashiers,
    expenseCategories: e.categories,
  });
}
