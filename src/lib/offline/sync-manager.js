"use client";

import { api } from "@/lib/client";
import { offlineDb } from "./db";

const retryDelay = (attempts) => Math.min(300000, [2000, 5000, 15000, 30000][Math.min(attempts, 3)] * 2 ** Math.max(0, attempts - 3));

export async function enqueueSync({ entityType, entityId, path, method = "POST", payload }) {
  return offlineDb.pendingSync.add({ entityType, entityId, path, method, payload, status: "pending", attempts: 0, createdAt: new Date().toISOString(), nextAttemptAt: 0, error: "" });
}

async function syncQueue() {
  if (!navigator.onLine) return { synced: 0, pending: await offlineDb.pendingSync.count() };
  const due = await offlineDb.pendingSync.where("[status+nextAttemptAt]").between(["pending", 0], ["pending", Date.now()]).toArray();
  let synced = 0;
  for (const entry of due) {
    await offlineDb.pendingSync.update(entry.id, { status: "syncing", error: "" });
    try {
      const result = await api(entry.path, { method: entry.method, body: entry.payload });
      await offlineDb.transaction("rw", offlineDb.pendingSync, offlineDb.sales, offlineDb.expenses, async () => {
        if (entry.entityType === "sale") await offlineDb.sales.update(entry.entityId, { mongoId: result._id, syncStatus: "synced", syncedAt: new Date().toISOString() });
        if (entry.entityType === "expense") await offlineDb.expenses.update(entry.entityId, { mongoId: result._id, syncStatus: "synced", syncedAt: new Date().toISOString() });
        await offlineDb.pendingSync.delete(entry.id);
      });
      synced += 1;
    } catch {
      const attempts = entry.attempts + 1;
      await offlineDb.pendingSync.update(entry.id, { status: "pending", attempts, lastAttempt: new Date().toISOString(), nextAttemptAt: Date.now() + retryDelay(attempts), error: "Synchronization will retry automatically." });
    }
  }
  return { synced, pending: await offlineDb.pendingSync.count() };
}

let syncing = false;
export async function syncPendingRecords() {
  if (typeof navigator === "undefined" || syncing) return { synced: 0, pending: 0 };
  syncing = true;
  try {
    if (navigator.locks?.request)
      return await navigator.locks.request("karikku-pos-sync", { ifAvailable: true }, (lock) => lock ? syncQueue() : { synced: 0, pending: 0 });
    return await syncQueue();
  } finally {
    syncing = false;
  }
}
