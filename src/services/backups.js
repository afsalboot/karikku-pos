import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { cookies } from "next/headers";
import { requireUser, admin, fail } from "../lib/auth.js";
import { body, ok } from "../lib/http.js";
import { COOKIE } from "../lib/jwt.js";
import { encryptBackup, backupCollections, resetCollections } from "../lib/backup-archive.js";
import BackupState from "../models/BackupState.js";
import User from "../models/User.js";
import { getSettings, transaction } from "./settings.js";
import { googleConfigured, connectGoogle, googleCallback, uploadGoogle, disconnectGoogle } from "./google-backup.js";

const createSchema = z.object({ password: z.string().min(12).max(128), destination: z.enum(["local", "google", "both"]) }).strict();
const resetSchema = z.object({ backupToken: z.string().max(4000), password: z.string().min(1).max(72), confirmation: z.literal("RESET WORKSPACE"), backupSaved: z.literal(true) }).strict();
function signingKey() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) fail(503, "Configure JWT_SECRET before using backups");
  return new TextEncoder().encode(process.env.JWT_SECRET);
}
export async function backups(request, action) {
  const user = await requireUser(); admin(user);
  await getSettings(); await BackupState.init();
  if (action === "google-callback" && request.method === "GET") return googleCallback(request, user);
  if (!action && request.method === "GET") {
    const config = await BackupState.findById("shop").lean();
    const counts = {};
    for (const name of resetCollections) counts[name] = await mongoose.connection.collection(name).countDocuments();
    return ok({ counts, google: { configured: googleConfigured(), connected: Boolean(config?.connectedAt), folderUrl: config?.googleFolderId ? `https://drive.google.com/drive/folders/${encodeURIComponent(config.googleFolderId)}` : null }, lastBackup: config?.lastBackup || null, lastReset: config?.lastReset || null });
  }
  if (request.method !== "POST") fail(405, "Method not allowed");
  if (action === "google-connect") return ok({ url: await connectGoogle(user) });
  if (action === "google-disconnect") { await disconnectGoogle(); return ok(null, "Google Drive disconnected"); }
  if (action === "create") {
    const input = createSchema.parse(await body(request));
    if (input.destination !== "local" && !googleConfigured()) fail(503, "Complete Google Drive setup first, or choose Local / External Drive.");
    const snapshot = await transaction(async (session, settings) => {
      admin(user);
      const collections = {};
      let size = 0;
      for (const name of backupCollections) {
        collections[name] = [];
        for await (const doc of mongoose.connection.collection(name).find({}, { session })) {
          size += mongoose.mongo.BSON.calculateObjectSize(doc);
          if (size > 25 * 1024 * 1024) fail(413, "This database exceeds the application backup limit. Use a database backup tool before resetting.");
          collections[name].push(doc);
        }
      }
      return { format: "karikku-pos", version: 1, createdAt: new Date(), revision: settings.revision, collections };
    });
    const archive = encryptBackup(snapshot, input.password);
    const filename = `karikku-${new Date().toISOString().replace(/[:.]/g, "-")}.kbackup`;
    const drive = input.destination === "local" ? null : await uploadGoogle(filename, archive);
    await BackupState.findOneAndUpdate({ _id: "shop" }, { $set: { lastBackup: { filename, createdAt: new Date(), destination: input.destination, driveFileId: drive?.fileId } } }, { upsert: true });
    const backupToken = await new SignJWT({ revision: snapshot.revision, filename, version: user.tokenVersion })
      .setProtectedHeader({ alg: "HS256" }).setIssuer("karikku-pos").setAudience("workspace-reset").setSubject(String(user._id)).setIssuedAt().setExpirationTime("15m").sign(signingKey());
    return ok({ filename, backupToken, drive, content: input.destination === "google" ? null : archive.toString("base64"), bytes: archive.length }, "Encrypted backup created");
  }
  if (action === "reset") {
    const input = resetSchema.parse(await body(request));
    let proof;
    try { proof = (await jwtVerify(input.backupToken, signingKey(), { algorithms: ["HS256"], issuer: "karikku-pos", audience: "workspace-reset" })).payload; }
    catch { fail(409, "Create and save a fresh backup before resetting the workspace"); }
    if (proof.sub !== String(user._id) || proof.version !== user.tokenVersion) fail(403, "This backup confirmation belongs to another login");
    const result = await transaction(async (session, settings) => {
      if (settings.revision !== proof.revision + 1) fail(409, "Workspace data changed after the backup. Create and save a new backup before resetting.");
      const actor = await User.findById(user._id).select("+passwordHash").session(session);
      admin(actor);
      if (!(await bcrypt.compare(input.password, actor.passwordHash))) fail(400, "Administrator password is incorrect");
      const counts = {};
      for (const name of resetCollections) counts[name] = (await mongoose.connection.collection(name).deleteMany({}, { session })).deletedCount;
      // Invalidate every active checkout/login so stale tabs cannot submit an old cart.
      await User.updateMany({}, { $inc: { tokenVersion: 1 } }, { session });
      const reset = { createdAt: new Date(), userId: String(user._id), backupName: proof.filename, counts };
      await BackupState.updateOne({ _id: "shop" }, { $set: { lastReset: reset } }, { session });
      return reset;
    });
    (await cookies()).delete(COOKIE);
    return ok(result, "Workspace reset. Sign in again to start a fresh business day.");
  }
  fail(404, "Backup action not found");
}
