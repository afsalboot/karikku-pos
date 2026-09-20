import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import BackupState from "../models/BackupState.js";
import { fail } from "../lib/auth.js";

const stateCookie = "karikku_drive_connect";
export const googleConfigured = () => Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REDIRECT_URI && /^[a-f0-9]{64}$/i.test(process.env.BACKUP_TOKEN_KEY || ""));
function key() {
  if (!googleConfigured()) fail(503, "Google Drive setup is incomplete. Configure the server environment using the setup instructions.");
  return Buffer.from(process.env.BACKUP_TOKEN_KEY, "hex");
}
function seal(token) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
function unseal(token) {
  const data = Buffer.from(token, "base64"), decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString();
}
async function tokens(params) {
  key();
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, client_id: process.env.GOOGLE_DRIVE_CLIENT_ID, client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) fail(502, "Google authorization failed. Reconnect Google Drive and try again.");
  return response.json();
}
export async function connectGoogle(user) {
  key();
  const state = randomBytes(32).toString("hex"), verifier = randomBytes(32).toString("base64url");
  (await cookies()).set(stateCookie, JSON.stringify({ state, verifier, user: String(user._id) }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/backups", maxAge: 600 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: process.env.GOOGLE_DRIVE_CLIENT_ID, redirect_uri: process.env.GOOGLE_DRIVE_REDIRECT_URI, response_type: "code", scope: "https://www.googleapis.com/auth/drive.file", access_type: "offline", prompt: "consent", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
  return url.toString();
}
export async function googleCallback(request, user) {
  const jar = await cookies(), url = new URL(request.url);
  let saved; try { saved = JSON.parse(jar.get(stateCookie)?.value || "null"); } catch {}
  jar.delete(stateCookie);
  if (!saved || saved.user !== String(user._id) || !url.searchParams.get("state") || saved.state !== url.searchParams.get("state")) fail(400, "Google connection expired. Start again from Settings.");
  const destination = new URL("/settings", process.env.GOOGLE_DRIVE_REDIRECT_URI);
  if (url.searchParams.has("error")) { destination.searchParams.set("drive", "cancelled"); return NextResponse.redirect(destination); }
  const result = await tokens({ grant_type: "authorization_code", code: url.searchParams.get("code") || "", redirect_uri: process.env.GOOGLE_DRIVE_REDIRECT_URI, code_verifier: saved.verifier });
  if (!result.refresh_token || !result.scope?.split(" ").includes("https://www.googleapis.com/auth/drive.file")) fail(400, "Allow Drive file access and reconnect to enable backups.");
  await BackupState.findOneAndUpdate({ _id: "shop" }, { $set: { googleToken: seal(result.refresh_token), connectedAt: new Date() }, $unset: { googleFolderId: 1 } }, { upsert: true });
  destination.searchParams.set("drive", "connected");
  return NextResponse.redirect(destination);
}
async function driveRequest(token, url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(45000) });
  if (!response.ok) fail(502, "Google Drive could not save the backup. Check your connection, account access and available storage.");
  return response.json();
}
export async function uploadGoogle(filename, archive) {
  const config = await BackupState.findById("shop").select("+googleToken").lean();
  if (!config?.googleToken) fail(400, "Connect Google Drive before creating a Drive backup");
  const auth = await tokens({ grant_type: "refresh_token", refresh_token: unseal(config.googleToken) });
  let folderId = config.googleFolderId;
  if (!folderId) {
    const folder = await driveRequest(auth.access_token, "https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Karikku POS Backups", mimeType: "application/vnd.google-apps.folder" }) });
    folderId = folder.id;
    await BackupState.updateOne({ _id: "shop" }, { $set: { googleFolderId: folderId } });
  }
  const boundary = `karikku_${randomBytes(16).toString("hex")}`;
  if (archive.length > 5 * 1024 * 1024) {
    const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
      method: "POST", headers: { Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json", "X-Upload-Content-Type": "application/octet-stream", "X-Upload-Content-Length": String(archive.length) },
      body: JSON.stringify({ name: filename, parents: [folderId] }), signal: AbortSignal.timeout(20000),
    });
    const location = start.headers.get("location");
    if (!start.ok || !location || new URL(location).origin !== "https://www.googleapis.com") fail(502, "Google Drive could not start the upload. Try again.");
    const file = await driveRequest(auth.access_token, location, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "Content-Length": String(archive.length) }, body: archive });
    return { fileId: file.id, folderUrl: `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}` };
  }
  const prefix = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: filename, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`;
  const result = await driveRequest(auth.access_token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: Buffer.concat([Buffer.from(prefix), archive, Buffer.from(`\r\n--${boundary}--`)]) });
  return { fileId: result.id, folderUrl: `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}` };
}
export async function disconnectGoogle() {
  // Removing the saved credential stops this installation from accessing Drive.
  await BackupState.updateOne({ _id: "shop" }, { $unset: { googleToken: 1, googleFolderId: 1, connectedAt: 1 } });
}
