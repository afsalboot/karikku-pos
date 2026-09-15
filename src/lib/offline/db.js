"use client";

import Dexie from "dexie";

class KarikkuOfflineDatabase extends Dexie {
  constructor() {
    super("karikku-pos-offline");
    this.version(1).stores({
      products: "mongoId, name, categoryId, active, available, updatedAt",
      categories: "mongoId, name, active, updatedAt",
      customers: "mongoId, phone, name, updatedAt",
      settings: "key, updatedAt",
      sales: "localId, mongoId, syncStatus, createdAt",
      expenses: "localId, mongoId, syncStatus, createdAt",
      pendingSync: "++id, [status+nextAttemptAt], entityType, entityId, createdAt",
      syncMetadata: "entityType, lastSyncedAt",
    });
  }
}

export const offlineDb = new KarikkuOfflineDatabase();
