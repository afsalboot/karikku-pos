import Sale from "../models/Sale.js";

// Sort only small keys: historical receipts may contain large inline logos.
// Fetch the full snapshots after pagination so reprints keep their stored data.
export async function salesHistoryPage(query, { skip, limit }) {
  const keys = await Sale.aggregate([
    { $match: query },
    { $project: { _id: 1, createdAt: 1 } },
    { $sort: { createdAt: -1, _id: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]).allowDiskUse(true);
  if (!keys.length) return [];
  const records = await Sale.find({ _id: { $in: keys.map(row => row._id) } }).lean();
  const byId = new Map(records.map(row => [String(row._id), row]));
  return keys.map(row => byId.get(String(row._id))).filter(Boolean);
}
