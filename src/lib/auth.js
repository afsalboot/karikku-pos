import { cookies } from "next/headers";
import { cache } from "react";
import { connectDB } from "./mongodb.js";
import { COOKIE, verifyToken } from "./jwt.js";
import User from "../models/User.js";
export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
// Deduplicate layout/page verification only within a server render, never across requests.
export const currentUser = cache(async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let payload;
  try {
    payload = await verifyToken(token);
  } catch {
    return null;
  }
  if (!/^[a-f0-9]{24}$/i.test(payload.sub || "")) return null;
  await connectDB();
  const user = await User.findById(payload.sub).lean();
  return user?.active && user.tokenVersion === payload.version ? user : null;
});
export async function requireUser() {
  const user = await currentUser();
  if (!user) fail(401, "Please sign in to continue");
  return user;
}
export function admin(user) {
  if (user.role !== "ADMIN") fail(403, "Administrator access required");
}
export const publicUser = (user) => ({
  _id: String(user._id),
  name: user.name,
  username: user.username,
  role: user.role,
  active: user.active,
});
