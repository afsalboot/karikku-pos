import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import mongoose from "mongoose";

export const backupCollections = ["settings", "users", "products", "categories", "expensecategories", "customers", "sales", "expenses", "daysessions", "cashmovements", "loyaltytransactions"];
export const resetCollections = ["sales", "expenses", "customers", "daysessions", "cashmovements", "loyaltytransactions"];
const magic = Buffer.from("KARIKKU1");
export function encryptBackup(snapshot, password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new Error("Use a backup password of 12–128 characters");
  const raw = Buffer.from(mongoose.mongo.BSON.EJSON.stringify(snapshot, { relaxed: false }));
  if (raw.length > 50 * 1024 * 1024) throw new Error("This database exceeds the 50 MB application backup limit. Use a database backup tool.");
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
  cipher.setAAD(magic);
  const encrypted = Buffer.concat([cipher.update(gzipSync(raw)), cipher.final()]);
  return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), encrypted]);
}
export function decryptBackup(buffer, password) {
  if (buffer.length < 53 || !buffer.subarray(0, 8).equals(magic)) throw new Error("Invalid Karikku backup file");
  const decipher = createDecipheriv("aes-256-gcm", scryptSync(password, buffer.subarray(8, 24), 32), buffer.subarray(24, 36));
  decipher.setAAD(magic); decipher.setAuthTag(buffer.subarray(36, 52));
  const raw = gunzipSync(Buffer.concat([decipher.update(buffer.subarray(52)), decipher.final()]), { maxOutputLength: 50 * 1024 * 1024 });
  const data = mongoose.mongo.BSON.EJSON.parse(raw.toString(), { relaxed: false });
  if (data.format !== "karikku-pos" || Number(data.version) !== 1 || !data.collections || backupCollections.some(name => !Array.isArray(data.collections[name]))) throw new Error("Unsupported or incomplete backup");
  return data;
}
