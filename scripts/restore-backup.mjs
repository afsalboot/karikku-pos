// Usage: set BACKUP_PASSWORD, MONGODB_URI and MONGODB_DB_NAME in the shell.
// node scripts/restore-backup.mjs path/to/file.kbackup [--apply]
// Inspection is the default. Apply only restores into an EMPTY target database.
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import { decryptBackup, backupCollections } from "../src/lib/backup-archive.js";
import "../src/models/Setting.js";
import "../src/models/User.js";
import "../src/models/Product.js";
import "../src/models/Category.js";
import "../src/models/ExpenseCategory.js";
import "../src/models/Customer.js";
import "../src/models/Sale.js";
import "../src/models/Expense.js";
import "../src/models/DaySession.js";
import "../src/models/CashMovement.js";
import "../src/models/LoyaltyTransaction.js";

try {
  const path = process.argv[2];
  if (!path || !process.env.BACKUP_PASSWORD) throw new Error("Provide a .kbackup file and BACKUP_PASSWORD. No database changes have been made.");
  const data = decryptBackup(await readFile(path), process.env.BACKUP_PASSWORD);
  console.log("Verified encrypted Karikku backup:", data.createdAt);
  console.table(Object.fromEntries(backupCollections.map(name => [name, data.collections[name].length])));
  if (process.argv.includes("--apply")) {
    if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) throw new Error("Set MONGODB_URI and an empty MONGODB_DB_NAME explicitly");
    await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
    for (const collection of await mongoose.connection.db.listCollections().toArray()) {
      if (!collection.name.startsWith("system.") && await mongoose.connection.collection(collection.name).countDocuments()) throw new Error("Restore target must be empty. Existing databases are never overwritten.");
    }
    await Promise.all(mongoose.modelNames().map(name => mongoose.model(name).init()));
    await mongoose.connection.transaction(async session => {
      for (const name of backupCollections) {
        if (await mongoose.connection.collection(name).countDocuments({}, { session })) throw new Error("Target changed during restore; refusing to overwrite data");
        if (data.collections[name].length) await mongoose.connection.collection(name).insertMany(data.collections[name], { session });
      }
      await mongoose.connection.collection("users").updateMany({}, { $inc: { tokenVersion: 1 }, $set: { loginFailures: 0 }, $unset: { lockedUntil: "" } }, { session });
    });
    console.log("Restore completed. Configure the application to use this database and sign in. Reconnect Google Drive if needed.");
  } else console.log("Inspection only. Use --apply with an empty target database to restore.");
} catch (error) { console.error("Backup operation failed:", error.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
