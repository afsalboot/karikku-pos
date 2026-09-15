import mongoose from "mongoose";
const cache =
  globalThis.__karikkuMongo ||
  (globalThis.__karikkuMongo = { connection: null, promise: null });
export async function connectDB() {
  if (cache.connection) return cache.connection;
  if (!process.env.MONGODB_URI)
    throw Object.assign(
      new Error("Database is not configured. Set MONGODB_URI in .env.local."),
      { status: 503 },
    );
  if (!cache.promise)
    cache.promise = mongoose.connect(process.env.MONGODB_URI, {
      ...(process.env.MONGODB_DB_NAME
        ? { dbName: process.env.MONGODB_DB_NAME }
        : {}),
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 15,
    });
  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } catch {
    cache.promise = null;
    throw Object.assign(
      new Error("Database is unavailable. Check the MongoDB connection."),
      { status: 503 },
    );
  }
}
