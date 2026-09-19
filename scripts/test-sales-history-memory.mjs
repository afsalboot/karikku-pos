import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Sale from "../src/models/Sale.js";
import { salesHistoryPage } from "../src/lib/sales-history-query.js";

let server;
try {
  server = await MongoMemoryServer.create({
    binary: { downloadDir: ".cache/mongodb" },
    instance: { args: ["--setParameter", "internalQueryMaxBlockingSortMemoryUsageBytes=1048576", "--setParameter", "allowDiskUseByDefault=false"] },
  });
  await mongoose.connect(server.getUri("sales_history_memory_test"), { autoIndex: false });
  // Model the existing deployment: date-only index, before the new index exists.
  await Sale.collection.createIndex({ createdAt: -1 });
  const logo = "data:image/png;base64," + "a".repeat(180000);
  const rows = Array.from({ length: 90 }, (_, i) => ({
    _id: new mongoose.Types.ObjectId(),
    invoiceNumber: `MEMORY-${i}`,
    createdAt: new Date(Date.UTC(2026, 8, 1 + Math.floor(i / 10))),
    business: { logo, name: "Historical shop" },
    items: [{ productName: "Historical item", quantity: 1, unitPrice: 100, lineTotal: 100 }],
    total: 100, status: i % 3 ? "COMPLETED" : "REFUNDED", paymentMethod: i % 2 ? "UPI" : "Cash",
  }));
  await Sale.collection.insertMany(rows);
  const query = { createdAt: { $gte: new Date("2026-08-31T18:30:00Z"), $lte: new Date("2026-09-19T18:29:59.999Z") } };
  await assert.rejects(
    Sale.find(query).sort({ createdAt: -1, _id: -1 }).limit(25).allowDiskUse(false).lean(),
    error => error.code === 292,
    "Original full-document sort reproduces MongoServerError 292",
  );
  console.log("PASS: reproduced error 292 with the original query.");
  const expected = [...rows].sort((a, b) => b.createdAt - a.createdAt || String(b._id).localeCompare(String(a._id)));
  for (const skip of [0, 25, 75, 100]) {
    const actual = await salesHistoryPage(query, { skip, limit: 25 });
    assert.deepEqual(actual.map(row => String(row._id)), expected.slice(skip, skip + 25).map(row => String(row._id)));
    for (const row of actual) {
      assert.equal(row.business.logo, logo);
      assert.equal(row.items[0].productName, "Historical item");
    }
  }
  const filtered = await salesHistoryPage({ ...query, status: "COMPLETED", paymentMethod: "Cash" }, { skip: 0, limit: 25 });
  assert.deepEqual(filtered.map(row => String(row._id)), expected.filter(row => row.status === "COMPLETED" && row.paymentMethod === "Cash").slice(0, 25).map(row => String(row._id)));
  // Prove the small-key query works even when disk spilling is unavailable.
  const projected = await Sale.aggregate([{ $match: query }, { $project: { _id: 1, createdAt: 1 } }, { $sort: { createdAt: -1, _id: -1 } }, { $skip: 25 }, { $limit: 25 }]).allowDiskUse(false);
  assert.deepEqual(projected.map(row => String(row._id)), expected.slice(25, 50).map(row => String(row._id)));
  await Sale.collection.createIndex({ createdAt: -1, _id: -1 });
  const plan = await Sale.find(query).select({ _id: 1, createdAt: 1 }).sort({ createdAt: -1, _id: -1 }).limit(25).explain("queryPlanner");
  assert.doesNotMatch(JSON.stringify(plan.queryPlanner.winningPlan), /"stage":"SORT"/);
  console.log("PASS: large historical receipts, tied dates, first/later/empty pages, filters, intact receipt snapshots, no disk requirement, and index-backed sort.");
} finally {
  await mongoose.disconnect();
  await server?.stop();
}
