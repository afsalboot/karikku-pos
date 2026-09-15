import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import User from "../models/User.js";
import { body, ok } from "../lib/http.js";
import { loginSchema } from "../lib/validation.js";
import { connectDB } from "../lib/mongodb.js";
import { fail, requireUser, currentUser, publicUser } from "../lib/auth.js";
import { COOKIE, signToken } from "../lib/jwt.js";
const attempts =
  globalThis.__loginAttempts || (globalThis.__loginAttempts = new Map());
export async function login(request) {
  const input = loginSchema.parse(await body(request));
  const now = Date.now();
  for (const [key, value] of attempts)
    if (value.until < now) attempts.delete(key);
  const entry = attempts.get(input.username) || {
    count: 0,
    until: now + 15 * 60000,
  };
  if (entry.count >= 10 || attempts.size > 10000)
    fail(429, "Too many login attempts. Try again in 15 minutes.");
  entry.count++;
  attempts.set(input.username, entry);
  await connectDB();
  const user = await User.findOne({ username: input.username }).select(
    "+passwordHash +loginFailures +lockedUntil",
  );
  if (user?.lockedUntil?.getTime() > now)
    fail(429, "Too many login attempts. Try again in 15 minutes.");
  const valid =
    user && (await bcrypt.compare(input.password, user.passwordHash));
  if (!valid || !user.active) {
    if (user) {
      const updated = await User.findByIdAndUpdate(
        user._id,
        { $inc: { loginFailures: 1 } },
        { returnDocument: "after" },
      ).select("+loginFailures");
      if (updated.loginFailures >= 10)
        await User.updateOne(
          { _id: user._id },
          { $set: { lockedUntil: new Date(now + 15 * 60000) } },
        );
    }
    fail(401, "Invalid credentials");
  }
  const token = await signToken(user);
  await User.updateOne(
    { _id: user._id },
    { $set: { loginFailures: 0 }, $unset: { lockedUntil: 1 } },
  );
  attempts.delete(input.username);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 43200,
  });
  return ok(publicUser(user), "Signed in");
}
export async function logout() {
  const user = await currentUser();
  if (user)
    await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
  (await cookies()).delete(COOKIE);
  return ok(null, "Signed out");
}
export async function me() {
  return ok(publicUser(await requireUser()));
}
